import { describe, it, expect } from "vitest";
import { RateLimiter } from "./ratelimit.server";

describe("RateLimiter", () => {
  it("allows requests up to capacity and blocks subsequent requests", () => {
    let currentTime = 1000000;
    const limiter = new RateLimiter({
      capacity: 10,
      refillPerMinute: 10,
      now: () => currentTime,
    });

    const ip = "192.0.2.1";

    // First 10 requests should succeed
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume(ip)).toBe(true);
    }

    // 11th request immediately afterwards should be blocked
    expect(limiter.consume(ip)).toBe(false);
  });

  it("refills tokens over time", () => {
    let currentTime = 1000000;
    const limiter = new RateLimiter({
      capacity: 10,
      refillPerMinute: 10, // 1 token every 6 seconds (6000 ms)
      now: () => currentTime,
    });

    const ip = "192.0.2.1";

    // Consume all 10 tokens
    for (let i = 0; i < 10; i++) {
      limiter.consume(ip);
    }
    expect(limiter.consume(ip)).toBe(false);

    // Advance time by 3 seconds - not enough for 1 full token
    currentTime += 3000;
    expect(limiter.consume(ip)).toBe(false);

    // Advance time by another 3 seconds (6 seconds total) - 1 token refilled
    currentTime += 3000;
    expect(limiter.consume(ip)).toBe(true);
    expect(limiter.consume(ip)).toBe(false);

    // Advance time by 1 minute (60,000 ms) - full refill
    currentTime += 60000;
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume(ip)).toBe(true);
    }
    expect(limiter.consume(ip)).toBe(false);
  });

  it("tracks different IPs separately", () => {
    const limiter = new RateLimiter({ capacity: 2, refillPerMinute: 10 });

    expect(limiter.consume("ip-1")).toBe(true);
    expect(limiter.consume("ip-1")).toBe(true);
    expect(limiter.consume("ip-1")).toBe(false);

    // ip-2 still has full capacity
    expect(limiter.consume("ip-2")).toBe(true);
    expect(limiter.consume("ip-2")).toBe(true);
    expect(limiter.consume("ip-2")).toBe(false);
  });

  it("extracts client IP correctly from X-Forwarded-For header", () => {
    const limiter = new RateLimiter();

    const req1 = new Request("https://ai-notes.io", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      },
    });
    expect(limiter.getClientIp(req1)).toBe("203.0.113.195");

    const req2 = new Request("https://ai-notes.io");
    expect(limiter.getClientIp(req2)).toBe("127.0.0.1");
  });
});
