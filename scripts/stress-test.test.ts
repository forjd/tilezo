import { describe, expect, test } from "bun:test";
import { parseArgs } from "./stress-test";

const decoder = new TextDecoder();

describe("stress-test CLI", () => {
  test("prints help without contacting the server", () => {
    const result = Bun.spawnSync(["bun", "run", "scripts/stress-test.ts", "--help"]);

    expect(result.exitCode).toBe(0);
    const output = decoder.decode(result.stdout);

    expect(output).toContain("Usage: bun run stress -- [options]");
    expect(output).toContain("--auth-mode <name>");
    expect(output).toContain("--duration <seconds>");
    expect(output).toContain("--preseed-users");
    expect(output).toContain("--request-timeout-ms <ms>");
    expect(output).toContain("--setup-concurrency <n>");
    expect(output).toContain("--seed <number>");
  });

  test("parses preseed setup options", () => {
    const options = parseArgs([
      "--bots",
      "3",
      "--concurrency",
      "9",
      "--preseed-users",
      "--setup-concurrency",
      "2",
    ]);

    expect(options.bots).toBe(3);
    expect(options.concurrency).toBe(3);
    expect(options.preseedUsers).toBe(true);
    expect(options.setupConcurrency).toBe(2);
  });

  test("parses explicit auth benchmark modes", () => {
    const loginOptions = parseArgs(["--scenario", "auth", "--auth-mode", "login"]);
    const registerOptions = parseArgs(["--scenario", "auth", "--auth-mode", "register"]);
    const preseedOptions = parseArgs(["--scenario", "auth", "--preseed-users"]);

    expect(loginOptions.authMode).toBe("login");
    expect(registerOptions.authMode).toBe("register");
    expect(preseedOptions.authMode).toBe("login");
  });

  test("rejects invalid scenarios before running load", () => {
    const result = Bun.spawnSync([
      "bun",
      "run",
      "scripts/stress-test.ts",
      "--scenario",
      "inventory",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(decoder.decode(result.stderr)).toContain(
      "--scenario must be one of auth, room, movement, chat, full",
    );
  });

  test("rejects auth modes outside the auth scenario", () => {
    expect(() => parseArgs(["--scenario", "full", "--auth-mode", "login"])).toThrow(
      "--auth-mode can only be used with --scenario auth",
    );
    expect(() => parseArgs(["--scenario", "auth", "--auth-mode", "refresh"])).toThrow(
      "--auth-mode must be one of register, login, register-login",
    );
  });

  test("rejects invalid timed-mode values before running load", () => {
    const result = Bun.spawnSync(["bun", "run", "scripts/stress-test.ts", "--duration", "-1"]);

    expect(result.exitCode).not.toBe(0);
    expect(decoder.decode(result.stderr)).toContain("--duration must be a non-negative number");
  });

  test("rejects invalid preseed flag values before running load", () => {
    expect(() => parseArgs(["--preseed-users=maybe"])).toThrow(
      "--preseed-users must be true or false",
    );
  });
});
