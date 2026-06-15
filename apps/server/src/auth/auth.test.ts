import { describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import {
  AuthBackpressureError,
  AuthPasswordLimiter,
  AuthService,
  DEFAULT_STARTING_DOLLARS,
  DrizzleAuthStore,
  isValidUsername,
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  UsernameTakenError,
} from "./auth";

describe("normalizeUsername", () => {
  test("trims and lowercases usernames for uniqueness checks", () => {
    expect(normalizeUsername("  DaN  ")).toBe("dan");
  });
});

describe("isValidUsername", () => {
  test("allows ascii letters, numbers, underscores, and hyphens", () => {
    expect(isValidUsername("Dan_42-test")).toBe(true);
  });

  test("rejects usernames with spaces, unicode, punctuation, or excessive length", () => {
    expect(isValidUsername("Dan Test")).toBe(false);
    expect(isValidUsername("Dán")).toBe(false);
    expect(isValidUsername("Dan!")).toBe(false);
    expect(isValidUsername("d".repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("AuthService", () => {
  test("creates users with hashed passwords, randomized appearances, and case-insensitive uniqueness", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, {
      secret: "test-secret",
      random: createSequenceRandom([0.99, 0, 0.2, 0.75, 0.5, 0.99, 0, 0.8, 0.8]),
    });

    const created = await auth.createUser("  Dan  ", "correct horse battery staple");

    expect(created.user).toMatchObject({
      id: "user_1",
      username: "Dan",
      appearance: RANDOM_APPEARANCE,
      dollars: DEFAULT_STARTING_DOLLARS,
    });
    expect(store.users[0]?.usernameKey).toBe("dan");
    expect(store.users[0]?.passwordHash).not.toBe("correct horse battery staple");
    await expect(auth.createUser("dan", "another password")).rejects.toThrow(
      "Username is already taken",
    );
  });

  test("rejects invalid usernames before hashing or persistence", async () => {
    const store = createAuthStore();
    let hashCalls = 0;
    const auth = new AuthService(store, {
      secret: "test-secret",
      passwordHash: async () => {
        hashCalls += 1;
        return "hashed-password";
      },
    });

    await expect(auth.createUser("Dan!", "correct horse battery staple")).rejects.toThrow(
      "Username must be 24 characters or fewer",
    );
    await expect(
      auth.createUser("d".repeat(USERNAME_MAX_LENGTH + 1), "correct horse battery staple"),
    ).rejects.toThrow("Username must be 24 characters or fewer");

    expect(hashCalls).toBe(0);
    expect(store.users).toEqual([]);
  });

  test("logs in usernames case-insensitively and rejects bad passwords", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });
    const created = await auth.createUser("Dan", "correct horse battery staple");

    const session = await auth.login("dan", "correct horse battery staple");

    expect(session.user).toEqual(created.user);
    expect(await auth.verifyToken(session.token)).toEqual(session.user);
    await expect(auth.login("DAN", "wrong password")).rejects.toThrow(
      "Invalid username or password",
    );
  });

  test("treats legacy invalid password hashes as invalid credentials", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });
    store.users.push({
      id: "user_1",
      username: "Dan",
      usernameKey: "dan",
      passwordHash: "legacy-user-without-password",
      tokenVersion: 0,
      appearance: DEFAULT_AVATAR_APPEARANCE,
      dollars: 0,
    });

    await expect(auth.login("dan", "anything")).rejects.toThrow("Invalid username or password");
  });

  test("updates a user's persisted avatar appearance", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });
    const session = await auth.createUser("Dan", "correct horse battery staple");
    const appearance: AvatarAppearance = {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part" as const,
      hairColor: "#8b4a24",
    };

    const updated = await auth.updateAppearance(session.user.id, appearance);

    expect(updated).toEqual({ ...session.user, appearance });
    expect(await auth.verifyToken(session.token)).toEqual(updated);
  });

  test("sanitizes a corrupt/legacy persisted appearance on read", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });
    const session = await auth.createUser("Dan", "correct horse battery staple");

    // Simulate a legacy or hand-edited row holding retired enum values, bypassing the strict
    // write-path validation.
    const stored = store.users[0];
    if (!stored) {
      throw new Error("expected a stored user");
    }
    stored.appearance = {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "retired-style",
      hairColor: "#zzzzzz",
    } as unknown as AvatarAppearance;

    const verified = await auth.verifyToken(session.token);

    // The retired fields degrade to defaults; reads never surface an invalid appearance.
    expect(verified?.appearance).toEqual(DEFAULT_AVATAR_APPEARANCE);
  });

  test("rejects unsupported avatar colors before persistence", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });
    const session = await auth.createUser("Dan", "correct horse battery staple");

    await expect(
      auth.updateAppearance(session.user.id, {
        ...DEFAULT_AVATAR_APPEARANCE,
        shirtColor: "#123456",
      } as unknown as AvatarAppearance),
    ).rejects.toThrow("Invalid character appearance");

    expect(store.users[0]?.appearance).toEqual(session.user.appearance);
  });
});

describe("AuthPasswordLimiter", () => {
  test("caps active password work and rejects when the wait queue is full", async () => {
    const limiter = new AuthPasswordLimiter({ concurrency: 1, maxQueue: 1, timeoutMs: 1000 });
    const firstTask = createDeferred<string>();

    const first = limiter.run(() => firstTask.promise);
    const second = limiter.run(async () => "second");

    await expect(limiter.run(async () => "third")).rejects.toBeInstanceOf(AuthBackpressureError);

    firstTask.resolve("first");

    expect(await first).toBe("first");
    expect(await second).toBe("second");
  });

  test("times out queued password work", async () => {
    const limiter = new AuthPasswordLimiter({ concurrency: 1, maxQueue: 1, timeoutMs: 1 });
    const firstTask = createDeferred<string>();

    const first = limiter.run(() => firstTask.promise);
    const second = limiter.run(async () => "second").catch((error) => error);

    await Bun.sleep(10);
    expect(await second).toBeInstanceOf(AuthBackpressureError);

    firstTask.resolve("first");
    expect(await first).toBe("first");
  });

  test("records queued password wait time through AuthService", async () => {
    let now = 0;
    const observed: { histogram: string; valueMs: number }[] = [];
    const firstHashStarted = createDeferred<void>();
    const firstHashRelease = createDeferred<void>();
    const auth = new AuthService(createAuthStore(), {
      secret: "test-secret",
      now: () => now,
      passwordLimiter: new AuthPasswordLimiter({ concurrency: 1, maxQueue: 1, timeoutMs: 1000 }),
      passwordHash: async (password) => {
        if (password === "first password") {
          firstHashStarted.resolve();
          await firstHashRelease.promise;
        }

        now += 5;
        return `hashed:${password}`;
      },
      metrics: {
        increment() {},
        observe(histogram, valueMs) {
          observed.push({ histogram, valueMs });
        },
      },
    });

    const first = auth.createUser("Dan", "first password");
    await firstHashStarted.promise;
    const second = auth.createUser("Kai", "second password");
    now = 25;
    firstHashRelease.resolve();
    await Promise.all([first, second]);

    expect(observed).toContainEqual({
      histogram: "auth.password_hash.queue_wait.duration",
      valueMs: 30,
    });
  });

  test("maps AuthService password backpressure to a public auth error", async () => {
    const rejected: string[] = [];
    const firstHashStarted = createDeferred<void>();
    const firstHashRelease = createDeferred<void>();
    const auth = new AuthService(createAuthStore(), {
      secret: "test-secret",
      passwordLimiter: new AuthPasswordLimiter({ concurrency: 1, maxQueue: 0, timeoutMs: 1000 }),
      passwordHash: async (password) => {
        if (password === "first password") {
          firstHashStarted.resolve();
          await firstHashRelease.promise;
        }

        return `hashed:${password}`;
      },
      metrics: {
        increment(counter) {
          rejected.push(counter);
        },
        observe() {},
      },
    });

    const first = auth.createUser("Dan", "first password");
    await firstHashStarted.promise;

    await expect(auth.createUser("Kai", "second password")).rejects.toThrow(
      "Authentication is busy",
    );

    firstHashRelease.resolve();
    await first;
    expect(rejected).toContain("auth.password_hash.rejected");
  });

  test("records password and store timings through AuthService metrics", async () => {
    let now = 0;
    const observed: { histogram: string; valueMs: number }[] = [];
    const auth = new AuthService(createAuthStore(), {
      secret: "test-secret",
      now: () => now,
      passwordHash: async () => {
        now += 25;
        return "hashed-password";
      },
      metrics: {
        increment() {},
        observe(histogram, valueMs) {
          observed.push({ histogram, valueMs });
        },
      },
    });

    await auth.createUser("Dan", "correct horse battery staple");

    expect(observed).toContainEqual({ histogram: "auth.password_hash.duration", valueMs: 25 });
    expect(observed.some((sample) => sample.histogram === "auth.user_create.duration")).toBe(true);
  });
});

describe("AuthService password rules", () => {
  test("rejects passwords that are too short or too long", async () => {
    const auth = new AuthService(createAuthStore(), { secret: "test-secret" });

    await expect(auth.createUser("Dan", "short")).rejects.toThrow(
      "Password must be between 8 and 200 characters",
    );
    await expect(auth.createUser("Dan", "x".repeat(201))).rejects.toThrow(
      "Password must be between 8 and 200 characters",
    );
  });

  test("rejects an oversized login password before running a verify (DoS guard)", async () => {
    let verifyCalls = 0;
    const auth = new AuthService(createAuthStore(), {
      secret: "test-secret",
      passwordVerify: async () => {
        verifyCalls += 1;
        return true;
      },
    });

    await expect(auth.login("Dan", "x".repeat(201))).rejects.toThrow(
      "Invalid username or password",
    );
    expect(verifyCalls).toBe(0);
  });

  test("runs a verify even for unknown users so login timing does not leak existence", async () => {
    let verifyCalls = 0;
    const auth = new AuthService(createAuthStore(), {
      secret: "test-secret",
      passwordVerify: async () => {
        verifyCalls += 1;
        return false;
      },
    });

    await expect(auth.login("ghost", "correct horse battery")).rejects.toThrow(
      "Invalid username or password",
    );
    expect(verifyCalls).toBe(1);
  });
});

describe("AuthService createUser error handling", () => {
  test("maps a uniqueness conflict to USERNAME_TAKEN", async () => {
    const auth = new AuthService(createAuthStore(), { secret: "test-secret" });
    await auth.createUser("Dan", "correct horse battery staple");

    await expect(auth.createUser("dan", "another password")).rejects.toThrow(
      "Username is already taken",
    );
  });

  test("surfaces unexpected store failures instead of masking them as USERNAME_TAKEN", async () => {
    const failures: string[] = [];
    const auth = new AuthService(
      {
        ...createAuthStore(),
        async createUser() {
          throw new Error("connection reset");
        },
      },
      {
        secret: "test-secret",
        metrics: {
          increment(counter) {
            failures.push(counter);
          },
          observe() {},
        },
      },
    );

    await expect(auth.createUser("Dan", "correct horse battery staple")).rejects.toThrow(
      "connection reset",
    );
    expect(failures).toContain("auth.user_create.failed");
  });
});

describe("AuthService token verification", () => {
  test("rejects expired, forged, wrong-secret, and malformed tokens", async () => {
    let nowSeconds = 1_000_000;
    const store = createAuthStore();
    const auth = new AuthService(store, {
      secret: "test-secret",
      nowSeconds: () => nowSeconds,
    });
    const session = await auth.createUser("Dan", "correct horse battery staple");

    // Valid right now.
    expect(await auth.verifyToken(session.token)).toEqual(session.user);

    // Forged signature.
    const [userId, version, expiresAt] = session.token.split(".");
    expect(await auth.verifyToken(`${userId}.${version}.${expiresAt}.forged`)).toBeUndefined();

    // Malformed shapes.
    expect(await auth.verifyToken("")).toBeUndefined();
    expect(await auth.verifyToken("only.three.parts")).toBeUndefined();

    // Wrong secret: a different service cannot verify this token.
    const otherAuth = new AuthService(store, { secret: "other-secret" });
    expect(await otherAuth.verifyToken(session.token)).toBeUndefined();

    // Expired after the TTL elapses.
    nowSeconds += 60 * 60 * 24 * 7 + 1;
    expect(await auth.verifyToken(session.token)).toBeUndefined();
  });

  test("logout revokes every previously issued token", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });
    const session = await auth.createUser("Dan", "correct horse battery staple");

    expect(await auth.verifyToken(session.token)).toEqual(session.user);

    await auth.logout(session.user.id);

    // The old token is now invalid (token version bumped).
    expect(await auth.verifyToken(session.token)).toBeUndefined();

    // A fresh login mints a token at the new version that verifies again.
    const next = await auth.login("Dan", "correct horse battery staple");
    expect(await auth.verifyToken(next.token)).toEqual(next.user);
  });
});

describe("DrizzleAuthStore", () => {
  const stored = {
    id: "user_1",
    username: "Dan",
    usernameKey: "dan",
    passwordHash: "hash",
    tokenVersion: 2,
    appearance: DEFAULT_AVATAR_APPEARANCE,
    dollars: DEFAULT_STARTING_DOLLARS,
  };
  const input = {
    appearance: DEFAULT_AVATAR_APPEARANCE,
    username: "Dan",
    usernameKey: "dan",
    passwordHash: "hash",
  };

  test("creates, looks up, updates, and revokes users", async () => {
    expect(await new DrizzleAuthStore(queryDouble([[stored]])).createUser(input)).toEqual(stored);
    expect(
      await new DrizzleAuthStore(queryDouble([[stored]])).findUserByUsernameKey("dan"),
    ).toEqual(stored);
    expect(await new DrizzleAuthStore(queryDouble([[stored]])).findUserById("user_1")).toEqual(
      stored,
    );
    expect(
      await new DrizzleAuthStore(queryDouble([[stored]])).updateUserAppearance(
        "user_1",
        DEFAULT_AVATAR_APPEARANCE,
      ),
    ).toEqual(stored);
    await new DrizzleAuthStore(queryDouble([[]])).incrementTokenVersion("user_1");
  });

  test("maps unique violations to UsernameTakenError and rethrows other failures", async () => {
    await expect(
      new DrizzleAuthStore(queryDouble([], { rejectWith: { code: "23505" } })).createUser(input),
    ).rejects.toBeInstanceOf(UsernameTakenError);
    await expect(
      new DrizzleAuthStore(
        queryDouble([], { rejectWith: new Error("connection reset") }),
      ).createUser(input),
    ).rejects.toThrow("connection reset");
  });

  test("throws when the insert returns no row", async () => {
    await expect(new DrizzleAuthStore(queryDouble([[]])).createUser(input)).rejects.toThrow(
      "User creation failed",
    );
  });
});

const RANDOM_APPEARANCE: AvatarAppearance = {
  hair: "locs",
  hairColor: "#3b2418",
  skinTone: "#a86c4d",
  shirt: "overshirt",
  shirtColor: "#5a4b7f",
  pants: "cuffed",
  pantsColor: "#3f4d5c",
  shoes: "work-boots",
  shoesColor: "#9f4f3f",
};

type StoredTestUser = {
  id: string;
  appearance: AvatarAppearance;
  username: string;
  usernameKey: string;
  passwordHash: string;
  tokenVersion: number;
  dollars: number;
};

function createAuthStore() {
  return {
    users: [] as StoredTestUser[],
    async createUser(user: {
      appearance: AvatarAppearance;
      username: string;
      usernameKey: string;
      passwordHash: string;
    }) {
      if (this.users.some((existing) => existing.usernameKey === user.usernameKey)) {
        throw new UsernameTakenError("duplicate username");
      }

      const persisted: StoredTestUser = {
        id: `user_${this.users.length + 1}`,
        tokenVersion: 0,
        dollars: DEFAULT_STARTING_DOLLARS,
        ...user,
      };
      this.users.push(persisted);
      return persisted;
    },
    async findUserByUsernameKey(usernameKey: string) {
      return this.users.find((user) => user.usernameKey === usernameKey);
    },
    async findUserById(id: string) {
      return this.users.find((user) => user.id === id);
    },
    async updateUserAppearance(id: string, appearance: AvatarAppearance) {
      const user = this.users.find((existing) => existing.id === id);

      if (!user) {
        return undefined;
      }

      user.appearance = appearance;
      return user;
    },
    async incrementTokenVersion(id: string) {
      const user = this.users.find((existing) => existing.id === id);

      if (user) {
        user.tokenVersion += 1;
      }
    },
  };
}

function createSequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

// A minimal awaitable/chainable Drizzle query-builder stand-in: every builder method
// returns the same chain, and awaiting it yields the next queued result array (or rejects
// with `rejectWith`). Enough to exercise the store's query construction and row mapping.
function queryDouble(
  results: unknown[][] = [],
  options: { rejectWith?: unknown } = {},
  // biome-ignore lint/suspicious/noExplicitAny: a structural stand-in for the Drizzle database.
): any {
  let index = 0;
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable and chainable.
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      if (options.rejectWith !== undefined) {
        return Promise.reject(options.rejectWith).then(resolve, reject);
      }
      return Promise.resolve(results[index++] ?? []).then(resolve, reject);
    },
  };

  for (const method of [
    "select",
    "from",
    "where",
    "limit",
    "orderBy",
    "set",
    "values",
    "returning",
    "onConflictDoNothing",
    "onConflictDoUpdate",
    "insert",
    "update",
    "delete",
  ]) {
    chain[method] = () => chain;
  }

  return chain;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}
