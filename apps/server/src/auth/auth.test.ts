import { describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { AuthBackpressureError, AuthPasswordLimiter, AuthService, normalizeUsername } from "./auth";

describe("normalizeUsername", () => {
  test("trims and lowercases usernames for uniqueness checks", () => {
    expect(normalizeUsername("  DaN  ")).toBe("dan");
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
    });
    expect(store.users[0]?.usernameKey).toBe("dan");
    expect(store.users[0]?.passwordHash).not.toBe("correct horse battery staple");
    await expect(auth.createUser("dan", "another password")).rejects.toThrow(
      "Username is already taken",
    );
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
      appearance: DEFAULT_AVATAR_APPEARANCE,
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

const RANDOM_APPEARANCE: AvatarAppearance = {
  hair: "buzz",
  hairColor: "#3b2418",
  skinTone: "#b77a58",
  shirt: "striped",
  shirtColor: "#7f3b44",
  pants: "skirt",
  pantsColor: "#3f4d5c",
  shoes: "flats",
  shoesColor: "#e5ded1",
};

function createAuthStore() {
  return {
    users: [] as {
      id: string;
      appearance: AvatarAppearance;
      username: string;
      usernameKey: string;
      passwordHash: string;
    }[],
    async createUser(user: {
      appearance: AvatarAppearance;
      username: string;
      usernameKey: string;
      passwordHash: string;
    }) {
      if (this.users.some((existing) => existing.usernameKey === user.usernameKey)) {
        throw new Error("duplicate username");
      }

      const persisted = {
        id: `user_${this.users.length + 1}`,
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
  };
}

function createSequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
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
