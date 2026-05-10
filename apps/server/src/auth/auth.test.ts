import { describe, expect, test } from "bun:test";
import { type AvatarAppearance, DEFAULT_AVATAR_APPEARANCE } from "@tilezo/protocol";
import { AuthService, normalizeUsername } from "./auth";

describe("normalizeUsername", () => {
  test("trims and lowercases usernames for uniqueness checks", () => {
    expect(normalizeUsername("  DaN  ")).toBe("dan");
  });
});

describe("AuthService", () => {
  test("creates users with hashed passwords and rejects case-insensitive duplicates", async () => {
    const store = createAuthStore();
    const auth = new AuthService(store, { secret: "test-secret" });

    const created = await auth.createUser("  Dan  ", "correct horse battery staple");

    expect(created.user).toMatchObject({
      id: "user_1",
      username: "Dan",
      appearance: DEFAULT_AVATAR_APPEARANCE,
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
    await auth.createUser("Dan", "correct horse battery staple");

    const session = await auth.login("dan", "correct horse battery staple");

    expect(session.user).toMatchObject({
      id: "user_1",
      username: "Dan",
      appearance: DEFAULT_AVATAR_APPEARANCE,
    });
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
    const appearance = {
      ...DEFAULT_AVATAR_APPEARANCE,
      hair: "side-part" as const,
      hairColor: "#8b4a24",
    };

    const updated = await auth.updateAppearance(session.user.id, appearance);

    expect(updated).toEqual({ ...session.user, appearance });
    expect(await auth.verifyToken(session.token)).toEqual(updated);
  });
});

function createAuthStore() {
  return {
    users: [] as {
      id: string;
      username: string;
      usernameKey: string;
      passwordHash: string;
      appearance: AvatarAppearance;
    }[],
    async createUser(user: { username: string; usernameKey: string; passwordHash: string }) {
      if (this.users.some((existing) => existing.usernameKey === user.usernameKey)) {
        throw new Error("duplicate username");
      }

      const persisted = {
        id: `user_${this.users.length + 1}`,
        appearance: DEFAULT_AVATAR_APPEARANCE,
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
