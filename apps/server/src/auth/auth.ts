import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type AvatarAppearance,
  avatarAppearanceSchema,
  createRandomAvatarAppearance,
} from "@tilezo/protocol";
import { eq } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { users } from "../db/schema";
import { createId } from "../util/ids";

export type AuthUser = {
  id: string;
  username: string;
  appearance: AvatarAppearance;
};

export type StoredAuthUser = AuthUser & {
  usernameKey: string;
  passwordHash: string;
};

export type AuthSession = {
  user: AuthUser;
  token: string;
};

export type AuthStore = {
  createUser(user: {
    appearance: AvatarAppearance;
    username: string;
    usernameKey: string;
    passwordHash: string;
  }): Promise<StoredAuthUser>;
  findUserByUsernameKey(usernameKey: string): Promise<StoredAuthUser | undefined>;
  findUserById(id: string): Promise<StoredAuthUser | undefined>;
  updateUserAppearance(
    id: string,
    appearance: AvatarAppearance,
  ): Promise<StoredAuthUser | undefined>;
};

type AuthOptions = {
  metrics?: AuthMetrics;
  now?: () => number;
  passwordHash?: (password: string) => Promise<string>;
  passwordLimiter?: AuthPasswordLimiter;
  passwordVerify?: (password: string, passwordHash: string) => Promise<boolean>;
  random?: () => number;
  secret: string;
};

type AuthMetrics = {
  increment(counter: string, amount?: number): void;
  observe(histogram: string, valueMs: number): void;
};

type AuthPasswordWaiter = {
  reject: (error: AuthBackpressureError) => void;
  resolve: (release: () => void) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const USERNAME_MAX_LENGTH = 24;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export class AuthService {
  private readonly now: () => number;
  private readonly passwordHash: (password: string) => Promise<string>;
  private readonly passwordVerify: (password: string, passwordHash: string) => Promise<boolean>;

  constructor(
    private readonly store: AuthStore,
    private readonly options: AuthOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.passwordHash = options.passwordHash ?? Bun.password.hash;
    this.passwordVerify = options.passwordVerify ?? verifyPassword;
  }

  async createUser(usernameInput: string, password: string): Promise<AuthSession> {
    const username = usernameInput.trim();
    const usernameKey = normalizeUsername(username);

    if (!username || !password.trim()) {
      throw new AuthError("INVALID_AUTH_INPUT", "Username and password are required");
    }

    if (!isValidUsername(username)) {
      throw new AuthError(
        "INVALID_USERNAME",
        `Username must be ${USERNAME_MAX_LENGTH.toString()} characters or fewer and can only use letters, numbers, underscores, or hyphens`,
      );
    }

    const passwordHash = await this.runPasswordTask("hash", () => this.passwordHash(password));

    try {
      const user = await this.measure("auth.user_create.duration", () =>
        this.store.createUser({
          appearance: createRandomAvatarAppearance(this.options.random),
          username,
          usernameKey,
          passwordHash,
        }),
      );
      return this.createSession(user);
    } catch {
      throw new AuthError("USERNAME_TAKEN", "Username is already taken");
    }
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const user = await this.measure("auth.user_lookup.duration", () =>
      this.store.findUserByUsernameKey(normalizeUsername(username)),
    );
    const passwordMatches = user
      ? await this.runPasswordTask("verify", () => this.passwordVerify(password, user.passwordHash))
      : false;

    if (!user || !passwordMatches) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password");
    }

    return this.createSession(user);
  }

  async verifyToken(token: string): Promise<AuthUser | undefined> {
    const parsed = this.parseToken(token);

    if (!parsed || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
      return undefined;
    }

    const user = await this.measure("auth.user_token_lookup.duration", () =>
      this.store.findUserById(parsed.userId),
    );
    return user ? toAuthUser(user) : undefined;
  }

  async updateAppearance(userId: string, appearance: AvatarAppearance): Promise<AuthUser> {
    const parsed = avatarAppearanceSchema.safeParse(appearance);

    if (!parsed.success) {
      throw new AuthError("INVALID_APPEARANCE", "Invalid character appearance");
    }

    const user = await this.measure("auth.appearance_update.duration", () =>
      this.store.updateUserAppearance(userId, parsed.data),
    );

    if (!user) {
      throw new AuthError("USER_NOT_FOUND", "User not found");
    }

    return toAuthUser(user);
  }

  private createSession(user: AuthUser): AuthSession {
    const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const payload = `${user.id}.${expiresAt}`;
    const signature = this.sign(payload);
    return {
      user: toAuthUser(user),
      token: `${payload}.${signature}`,
    };
  }

  private parseToken(token: string): { userId: string; expiresAt: number } | undefined {
    const [userId, expiresAtRaw, signature] = token.split(".");

    if (!userId || !expiresAtRaw || !signature) {
      return undefined;
    }

    const payload = `${userId}.${expiresAtRaw}`;
    const expectedSignature = this.sign(payload);

    if (!safeEqual(signature, expectedSignature)) {
      return undefined;
    }

    const expiresAt = Number(expiresAtRaw);
    return Number.isFinite(expiresAt) ? { userId, expiresAt } : undefined;
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.options.secret).update(payload).digest("base64url");
  }

  private async runPasswordTask<T>(operation: "hash" | "verify", task: () => Promise<T>) {
    const limiter = this.options.passwordLimiter;
    const queueStartedAt = this.now();

    try {
      return await this.measure(`auth.password_${operation}.duration`, async () => {
        if (!limiter) {
          return await task();
        }

        return await limiter.run(async () => {
          this.options.metrics?.observe(
            `auth.password_${operation}.queue_wait.duration`,
            this.now() - queueStartedAt,
          );
          return await task();
        });
      });
    } catch (error) {
      if (error instanceof AuthBackpressureError) {
        this.options.metrics?.increment(`auth.password_${operation}.rejected`);
        throw new AuthError("AUTH_BUSY", "Authentication is busy, try again shortly");
      }

      throw error;
    }
  }

  private async measure<T>(histogram: string, task: () => Promise<T>): Promise<T> {
    const startedAt = this.now();

    try {
      return await task();
    } finally {
      this.options.metrics?.observe(histogram, this.now() - startedAt);
    }
  }
}

export class AuthPasswordLimiter {
  private active = 0;
  private readonly queue: AuthPasswordWaiter[] = [];

  constructor(
    private readonly options: {
      concurrency: number;
      maxQueue: number;
      timeoutMs: number;
    },
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    const release = await this.acquire();

    try {
      return await task();
    } finally {
      release();
    }
  }

  private acquire(): Promise<() => void> {
    if (this.active < this.options.concurrency) {
      this.active += 1;
      return Promise.resolve(() => this.release());
    }

    if (this.queue.length >= this.options.maxQueue) {
      return Promise.reject(new AuthBackpressureError("Auth password queue is full"));
    }

    return new Promise((resolve, reject) => {
      const waiter: AuthPasswordWaiter = {
        reject,
        resolve,
        timeout: setTimeout(() => {
          const index = this.queue.indexOf(waiter);

          if (index >= 0) {
            this.queue.splice(index, 1);
          }

          reject(new AuthBackpressureError("Auth password queue timed out"));
        }, this.options.timeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  private release(): void {
    const waiter = this.queue.shift();

    if (!waiter) {
      this.active = Math.max(0, this.active - 1);
      return;
    }

    clearTimeout(waiter.timeout);
    waiter.resolve(() => this.release());
  }
}

export class AuthBackpressureError extends Error {}

export class DrizzleAuthStore implements AuthStore {
  constructor(private readonly db: TilezoDatabase) {}

  async createUser(user: {
    appearance: AvatarAppearance;
    username: string;
    usernameKey: string;
    passwordHash: string;
  }): Promise<StoredAuthUser> {
    const [created] = await this.db
      .insert(users)
      .values({
        id: createId("user"),
        ...user,
      })
      .returning({
        id: users.id,
        username: users.username,
        usernameKey: users.usernameKey,
        passwordHash: users.passwordHash,
        appearance: users.appearance,
      });

    if (!created) {
      throw new Error("User creation failed");
    }

    return created;
  }

  async findUserByUsernameKey(usernameKey: string): Promise<StoredAuthUser | undefined> {
    const [user] = await this.db
      .select({
        id: users.id,
        username: users.username,
        usernameKey: users.usernameKey,
        passwordHash: users.passwordHash,
        appearance: users.appearance,
      })
      .from(users)
      .where(eq(users.usernameKey, usernameKey));
    return user;
  }

  async findUserById(id: string): Promise<StoredAuthUser | undefined> {
    const [user] = await this.db
      .select({
        id: users.id,
        username: users.username,
        usernameKey: users.usernameKey,
        passwordHash: users.passwordHash,
        appearance: users.appearance,
      })
      .from(users)
      .where(eq(users.id, id));
    return user;
  }

  async updateUserAppearance(
    id: string,
    appearance: AvatarAppearance,
  ): Promise<StoredAuthUser | undefined> {
    const [user] = await this.db
      .update(users)
      .set({
        appearance,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        usernameKey: users.usernameKey,
        passwordHash: users.passwordHash,
        appearance: users.appearance,
      });

    return user;
  }
}

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US");
}

export function isValidUsername(username: string): boolean {
  return username.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(username);
}

function toAuthUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    appearance: { ...user.appearance },
  };
}

function safeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, passwordHash);
  } catch {
    return false;
  }
}
