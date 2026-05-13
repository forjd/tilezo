import { describe, expect, test } from "bun:test";
import { parseArgs } from "./cleanup-stress-users";

describe("cleanup-stress-users CLI", () => {
  test("parses the default stress prefix safely", () => {
    expect(parseArgs([])).toEqual({
      dryRun: false,
      force: false,
      prefix: "stress_",
    });
  });

  test("normalizes explicit stress prefixes and dry-run flags", () => {
    expect(parseArgs(["--prefix", " Stress_Bench_ ", "--dry-run"])).toEqual({
      dryRun: true,
      force: false,
      prefix: "stress_bench_",
    });
  });

  test("rejects non-stress prefixes unless forced", () => {
    expect(() => parseArgs(["--prefix", "dan"])).toThrow(
      "--prefix must start with stress_ and be at least 7 characters",
    );
    expect(parseArgs(["--prefix", "dan", "--force"])).toMatchObject({
      force: true,
      prefix: "dan",
    });
  });

  test("rejects invalid boolean flags", () => {
    expect(() => parseArgs(["--dry-run=maybe"])).toThrow("--dry-run must be true or false");
  });
});
