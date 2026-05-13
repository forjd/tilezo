export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type FixedWindowRateLimiterOptions = {
  limit: number;
  now?: () => number;
  windowMs: number;
};

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly now: () => number;

  constructor(private readonly options: FixedWindowRateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  consume(key: string): RateLimitResult {
    const now = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      return { allowed: true };
    }

    if (bucket.count >= this.options.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    bucket.count += 1;
    return { allowed: true };
  }

  prune(): void {
    const now = this.now();

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
