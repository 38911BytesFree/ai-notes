/**
 * In-memory Token Bucket rate limiter per IP.
 * Defaults to 10 requests per minute with a bucket capacity of 10.
 */

interface Bucket {
  tokens: number;
  lastRefill: number; // timestamp in ms
}

export interface RateLimiterOptions {
  capacity?: number;
  refillPerMinute?: number;
  now?: () => number;
}

export class RateLimiter {
  private capacity: number;
  private refillRatePerMs: number;
  private buckets = new Map<string, Bucket>();
  private now: () => number;

  constructor(options: RateLimiterOptions = {}) {
    this.capacity = options.capacity ?? 10;
    const refillPerMinute = options.refillPerMinute ?? 10;
    this.refillRatePerMs = refillPerMinute / (60 * 1000);
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Attempts to consume 1 token for the specified key.
   * Returns true if allowed, false if rate limited.
   */
  public consume(key: string): boolean {
    const now = this.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefill);
      const refilledTokens = elapsed * this.refillRatePerMs;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refilledTokens);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  public getClientIp(request: Request): string {
    const xForwardedFor = request.headers.get("x-forwarded-for");
    if (xForwardedFor) {
      const first = xForwardedFor.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }
    return "127.0.0.1";
  }

  public checkRequest(request: Request): boolean {
    const ip = this.getClientIp(request);
    return this.consume(ip);
  }

  public reset(): void {
    this.buckets.clear();
  }
}

// Global in-memory singleton for the Node server instance
export const globalRateLimiter = new RateLimiter();

export function rateLimit(request: Request): boolean {
  return globalRateLimiter.checkRequest(request);
}
