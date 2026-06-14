import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type AuthUser,
  type AvatarAppearance,
  avatarAppearanceSchema,
  createRandomAvatarAppearance,
} from "@tilezo/protocol";
import { eq, sql } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { users } from "../db/schema";
import { createId } from "../util/ids";

export type StoredAuthUser = AuthUser & {
  usernameKey: string;
  passwordHash: string;
  tokenVersion: number;
};

export const DEFAULT_STARTING_DOLLARS = 500;

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
  // Invalidates every token previously issued to the user (logout / forced sign-out).
  incrementTokenVersion(id: string): Promise<void>;
};

type AuthOptions = {
  metrics?: AuthMetrics;
  now?: () => number;
  nowSeconds?: () => number;
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
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
// Used to run a constant-cost argon2 verify when a username does not exist, so login
// latency does not reveal which usernames are registered.
const DUMMY_VERIFY_PASSWORD = "tilezo-dummy-verify-password";

/* c8 ignore next 11 -- Bun reports these constructor-assigned declare fields as uncovered. */
export class AuthService {
  private declare readonly now: () => number;
  private declare readonly nowSeconds: () => number;
  private declare readonly passwordHash: (password: string) => Promise<string>;
  private declare readonly passwordVerify: (
    password: string,
    passwordHash: string,
  ) => Promise<boolean>;
  private declare dummyPasswordHash?: Promise<string>;

  constructor(
    private readonly store: AuthStore,
    private readonly options: AuthOptions,
  ) {
    this.now = options.now ?? (() => performance.now());
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
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

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new AuthError(
        "INVALID_PASSWORD",
        `Password must be between ${PASSWORD_MIN_LENGTH.toString()} and ${PASSWORD_MAX_LENGTH.toString()} characters`,
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
    } catch (error) {
      if (error instanceof UsernameTakenError) {
        throw new AuthError("USERNAME_TAKEN", "Username is already taken");
      }

      // Surface real persistence failures (connection drops, timeouts) instead of
      // masking them as a username collision and silently swallowing the error.
      this.options.metrics?.increment("auth.user_create.failed");
      throw error;
    }
  }

  async login(username: string, password: string): Promise<AuthSession> {
    // Reject oversized passwords before paying for an argon2 verify (KDF DoS guard).
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password");
    }

    const user = await this.measure("auth.user_lookup.duration", () =>
      this.store.findUserByUsernameKey(normalizeUsername(username)),
    );
    // Always run a verify (against a dummy hash when the user is unknown) so response
    // latency does not reveal whether a username exists (timing enumeration).
    const passwordHash = user?.passwordHash ?? (await this.getDummyPasswordHash());
    const passwordMatches = await this.runPasswordTask("verify", () =>
      this.passwordVerify(password, passwordHash),
    );

    if (!user || !passwordMatches) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password");
    }

    return this.createSession(user);
  }

  async verifyToken(token: string): Promise<AuthUser | undefined> {
    const parsed = this.parseToken(token);

    if (!parsed || parsed.expiresAt < this.nowSeconds()) {
      return undefined;
    }

    const user = await this.measure("auth.user_token_lookup.duration", () =>
      this.store.findUserById(parsed.userId),
    );

    if (!user || user.tokenVersion !== parsed.tokenVersion) {
      return undefined;
    }

    return toAuthUser(user);
  }

  // Invalidates all of a user's existing tokens (logout / forced sign-out).
  async logout(userId: string): Promise<void> {
    await this.store.incrementTokenVersion(userId);
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordHash(DUMMY_VERIFY_PASSWORD);
    return this.dummyPasswordHash;
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

  private createSession(user: StoredAuthUser): AuthSession {
    const expiresAt = this.nowSeconds() + TOKEN_TTL_SECONDS;
    const payload = `${user.id}.${user.tokenVersion}.${expiresAt}`;
    const signature = this.sign(payload);
    return {
      user: toAuthUser(user),
      token: `${payload}.${signature}`,
    };
  }

  private parseToken(
    token: string,
  ): { userId: string; tokenVersion: number; expiresAt: number } | undefined {
    const parts = token.split(".");

    if (parts.length !== 4) {
      return undefined;
    }

    const [userId, tokenVersionRaw, expiresAtRaw, signature] = parts;

    if (!userId || !tokenVersionRaw || !expiresAtRaw || !signature) {
      return undefined;
    }

    const payload = `${userId}.${tokenVersionRaw}.${expiresAtRaw}`;
    const expectedSignature = this.sign(payload);

    if (!safeEqual(signature, expectedSignature)) {
      return undefined;
    }

    const tokenVersion = Number(tokenVersionRaw);
    const expiresAt = Number(expiresAtRaw);

    if (!Number.isInteger(tokenVersion) || !Number.isFinite(expiresAt)) {
      return undefined;
    }

    return { userId, tokenVersion, expiresAt };
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

// Thrown by an AuthStore when a username already exists, so AuthService can map only a
// genuine uniqueness conflict to USERNAME_TAKEN and surface every other failure as-is.
export class UsernameTakenError extends Error {}

const STORED_USER_COLUMNS = {
  id: users.id,
  username: users.username,
  usernameKey: users.usernameKey,
  passwordHash: users.passwordHash,
  appearance: users.appearance,
  tokenVersion: users.tokenVersion,
  dollars: users.dollars,
} as const;

export class DrizzleAuthStore implements AuthStore {
  constructor(private readonly db: TilezoDatabase) {}

  async createUser(user: {
    appearance: AvatarAppearance;
    username: string;
    usernameKey: string;
    passwordHash: string;
  }): Promise<StoredAuthUser> {
    let created: StoredAuthUser | undefined;

    try {
      [created] = await this.db
        .insert(users)
        .values({
          id: createId("user"),
          ...user,
          dollars: DEFAULT_STARTING_DOLLARS,
        })
        .returning(STORED_USER_COLUMNS);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UsernameTakenError("Username is already taken");
      }

      throw error;
    }

    if (!created) {
      throw new Error("User creation failed");
    }

    return created;
  }

  async findUserByUsernameKey(usernameKey: string): Promise<StoredAuthUser | undefined> {
    const [user] = await this.db
      .select(STORED_USER_COLUMNS)
      .from(users)
      .where(eq(users.usernameKey, usernameKey));
    return user;
  }

  async findUserById(id: string): Promise<StoredAuthUser | undefined> {
    const [user] = await this.db.select(STORED_USER_COLUMNS).from(users).where(eq(users.id, id));
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
      .returning(STORED_USER_COLUMNS);

    return user;
  }

  async incrementTokenVersion(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
  }
}

// Detects a Postgres unique-violation (SQLSTATE 23505) across driver shapes. Drizzle wraps
// the driver error in `.cause`, and Bun's SQL driver exposes the SQLSTATE as `errno` while
// `code` is the generic "ERR_POSTGRES_SERVER_ERROR" — so we walk the cause chain and check
// code, errno, and the message at each level.
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current && typeof current === "object" && depth < 5; depth += 1) {
    const candidate = current as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    if (candidate.code === "23505" || candidate.errno === "23505") {
      return true;
    }

    if (
      typeof candidate.message === "string" &&
      /unique constraint|duplicate key/i.test(candidate.message)
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
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
    dollars: user.dollars,
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
