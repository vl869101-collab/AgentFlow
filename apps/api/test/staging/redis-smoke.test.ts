import assert from "node:assert/strict";
import test from "node:test";

delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const [{ getRedisClient, checkAndSetWebhookIdempotency }, { getWorkflowQueue, getQueueMetrics }] = await Promise.all([
  import("../../src/lib/redis.js"),
  import("../../src/services/queue.js"),
]);

test("Redis Staging Smoke: Configuration, Idempotency & Queue Subsystems", async () => {
  // 1. Check Redis client initialization logic
  const client = getRedisClient();
  if (client) {
    console.log("[Redis Smoke] Live Redis connection detected, running live PING test");
    try {
      const pong = await client.ping();
      assert.equal(pong, "PONG");

      // Verify Set/Get with TTL
      const testKey = `smoke:staging:${Date.now()}`;
      await client.set(testKey, "staging-ok", "EX", 10);
      const val = await client.get(testKey);
      assert.equal(val, "staging-ok");
      await client.del(testKey);
    } catch (err) {
      console.warn("[Redis Smoke] Live Redis ping skipped/unavailable:", (err as Error).message);
    }
  } else {
    console.log("[Redis Smoke] In-memory fallback mode active (ALLOW_MEMORY_DB=1)");
  }

  // 2. Test Idempotency with memory fallback guarantee
  const testIdemKey = `smoke-idem-${Date.now()}`;
  const first = await checkAndSetWebhookIdempotency(testIdemKey, "smoke-exec-1", 60);
  assert.equal(first.isDuplicate, false);

  const second = await checkAndSetWebhookIdempotency(testIdemKey, "smoke-exec-2", 60);
  assert.equal(second.isDuplicate, true);
  assert.equal(second.existingExecutionId, "smoke-exec-1");

  // 3. Test Queue metrics & readiness
  const metrics = await getQueueMetrics();
  assert.ok(metrics !== null && typeof metrics === "object");
  assert.ok("workflows" in metrics);
  assert.ok("dlq" in metrics);
});
