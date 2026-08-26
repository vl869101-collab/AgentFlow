import IORedis, { type Redis as RedisInstance } from "ioredis";
import { randomUUID } from "node:crypto";
import { getEnv } from "./env.js";

let redisClient: RedisInstance | null = null;
const memoryIdempotencyStore = new Map<string, { executionId: string; expiresAt: number }>();
const memorySlidingWindowStore = new Map<string, number[]>();

export function getRedisClient(): RedisInstance | null {
  if (process.env.NODE_ENV === "test" && process.env.ALLOW_MEMORY_DB === "1" && !process.env.REDIS_URL_TEST) {
    return null;
  }
  if (redisClient) return redisClient;
  try {
    const env = getEnv();
    const redisUrl = env.REDIS_URL || "redis://localhost:6379";
    redisClient = new (IORedis as any)(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
    });
    redisClient?.on("error", (err: Error) => {
      console.warn("[Redis] Connection warning:", err.message);
    });
    return redisClient;
  } catch (err) {
    console.warn("[Redis] Initialization skipped:", err);
    return null;
  }
}

export async function checkAndSetWebhookIdempotency(
  key: string,
  executionId: string,
  ttlSeconds = 86400,
): Promise<{ isDuplicate: boolean; existingExecutionId?: string }> {
  const client = getRedisClient();

  if (client) {
    try {
      const result = await client.set(key, executionId, "EX", ttlSeconds, "NX");
      if (result === "OK") {
        return { isDuplicate: false };
      }
      const existing = await client.get(key);
      return { isDuplicate: true, existingExecutionId: existing ?? undefined };
    } catch (err) {
      console.warn("[Redis] Idempotency falling back to memory:", (err as Error).message);
    }
  }

  const now = Date.now();
  const entry = memoryIdempotencyStore.get(key);
  if (entry) {
    if (entry.expiresAt > now) {
      return { isDuplicate: true, existingExecutionId: entry.executionId };
    }
    memoryIdempotencyStore.delete(key);
  }

  memoryIdempotencyStore.set(key, {
    executionId,
    expiresAt: now + ttlSeconds * 1000,
  });

  return { isDuplicate: false };
}

export interface SlidingWindowRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

/**
 * Sliding Window Log rate limiter using Redis Sorted Sets with memory fallback.
 */
export async function checkSlidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs = 60000,
): Promise<SlidingWindowRateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const client = getRedisClient();

  if (client) {
    try {
      // 1. Remove timestamps outside the sliding window
      await client.zremrangebyscore(key, 0, windowStart);

      // 2. Count requests in current window
      const count = await client.zcard(key);

      if (count < limit) {
        const member = `${now}-${randomUUID()}`;
        await client.zadd(key, now, member);
        await client.pexpire(key, windowMs);
        const remaining = Math.max(0, limit - count - 1);
        return {
          allowed: true,
          limit,
          remaining,
          resetMs: windowMs,
          retryAfterSeconds: 0,
        };
      }

      // Over limit - find oldest request to calculate exact retryAfter
      const oldestEntries = await client.zrange(key, 0, 0, "WITHSCORES");
      const oldestTimestamp = oldestEntries.length >= 2 ? Number(oldestEntries[1]) : windowStart;
      const resetMs = Math.max(100, oldestTimestamp + windowMs - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));

      return {
        allowed: false,
        limit,
        remaining: 0,
        resetMs,
        retryAfterSeconds,
      };
    } catch (err) {
      console.warn("[Redis] Sliding window rate limit falling back to memory:", (err as Error).message);
    }
  }

  // Memory fallback implementation
  let timestamps = memorySlidingWindowStore.get(key) || [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length < limit) {
    timestamps.push(now);
    memorySlidingWindowStore.set(key, timestamps);
    const remaining = Math.max(0, limit - timestamps.length);
    return {
      allowed: true,
      limit,
      remaining,
      resetMs: windowMs,
      retryAfterSeconds: 0,
    };
  }

  const oldestTimestamp = timestamps[0] || windowStart;
  const resetMs = Math.max(100, oldestTimestamp + windowMs - now);
  const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));

  return {
    allowed: false,
    limit,
    remaining: 0,
    resetMs,
    retryAfterSeconds,
  };
}

export function resetMemoryIdempotencyStore() {
  memoryIdempotencyStore.clear();
}

export function resetMemoryRateLimitStore() {
  memorySlidingWindowStore.clear();
}
