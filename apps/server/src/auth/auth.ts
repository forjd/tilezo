import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { TilezoDatabase } from "../db/db";
import { users } from "../db/schema";
import { createId } from "../util/ids";

export type AuthUser = {
  id: string;
  username: string;
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
    username: string;
    usernameKey: string;
    passwordHash: string;
  }): Promise<StoredAuthUser>;
  findUserByUsernameKey(usernameKey: string): Promise<StoredAuthUser | undefined>;
  findUserById(id: string): Promise<StoredAuthUser | undefined>;
};

type AuthOptions = {
  secret: string;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly options: AuthOptions,
  ) {}

  async createUser(usernameInput: string, password: string): Promise<AuthSession> {
    const username = usernameInput.trim();
    const usernameKey = normalizeUsername(username);

    if (!username || !password.trim()) {
      throw new AuthError("INVALID_AUTH_INPUT", "Username and password are required");
    }

    if (await this.store.findUserByUsernameKey(usernameKey)) {
      throw new AuthError("USERNAME_TAKEN", "Username is already taken");
    }

    try {
      const user = await this.store.createUser({
        username,
        usernameKey,
        passwordHash: await Bun.password.hash(password),
      });
      return this.createSession(user);
    } catch {
      throw new AuthError("USERNAME_TAKEN", "Username is already taken");
    }
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const user = await this.store.findUserByUsernameKey(normalizeUsername(username));

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password");
    }

    return this.createSession(user);
  }

  async verifyToken(token: string): Promise<AuthUser | undefined> {
    const parsed = this.parseToken(token);

    if (!parsed || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
      return undefined;
    }

    const user = await this.store.findUserById(parsed.userId);
    return user ? toAuthUser(user) : undefined;
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
}

export class DrizzleAuthStore implements AuthStore {
  constructor(private readonly db: TilezoDatabase) {}

  async createUser(user: {
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
      })
      .from(users)
      .where(eq(users.id, id));
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

function toAuthUser(user: AuthUser): AuthUser {
  return { id: user.id, username: user.username };
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
