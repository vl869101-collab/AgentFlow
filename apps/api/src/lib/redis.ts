import IORedis, { type Redis as RedisInstance } from "ioredis";
import { getEnv } from "./env.js";

let redisClient: RedisInstance | null = null;
const memoryIdempotencyStore = new Map<string, { executionId: string; expiresAt: number }>();

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

export function resetMemoryIdempotencyStore() {
  memoryIdempotencyStore.clear();
}
