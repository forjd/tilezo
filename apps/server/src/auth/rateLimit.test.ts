import { describe, expect, test } from "bun:test";
import { FixedWindowRateLimiter } from "./rateLimit";

describe("FixedWindowRateLimiter", () => {
  test("allows requests up to the configured limit", () => {
    let now = 1000;
    const limiter = new FixedWindowRateLimiter({
      limit: 2,
      now: () => now,
      windowMs: 10_000,
    });

    expect(limiter.consume("127.0.0.1")).toEqual({ allowed: true });
    expect(limiter.consume("127.0.0.1")).toEqual({ allowed: true });
    expect(limiter.consume("127.0.0.1")).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });

    now = 11_000;

    expect(limiter.consume("127.0.0.1")).toEqual({ allowed: true });
  });

  test("tracks clients independently and prunes expired buckets", () => {
    let now = 1000;
    const limiter = new FixedWindowRateLimiter({
      limit: 1,
      now: () => now,
      windowMs: 1000,
    });

    expect(limiter.consume("first")).toEqual({ allowed: true });
    expect(limiter.consume("second")).toEqual({ allowed: true });
    expect(limiter.consume("first")).toEqual({ allowed: false, retryAfterSeconds: 1 });

    now = 2000;
    limiter.prune();

    expect(limiter.consume("first")).toEqual({ allowed: true });
  });
});
