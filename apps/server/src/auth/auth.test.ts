import { describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { AuthService, normalizeUsername } from "./auth";

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

const RANDOM_APPEARANCE: AvatarAppearance = {
  hair: "bob",
  hairColor: "#3b2418",
  skinTone: "#b77a58",
  shirt: "hoodie",
  shirtColor: "#7f3b44",
  pants: "wide",
  pantsColor: "#3f4d5c",
  shoes: "sneakers",
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
