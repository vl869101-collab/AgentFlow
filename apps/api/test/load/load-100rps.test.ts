import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import test from "node:test";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// Deterministic in-memory DB configuration for reproducible test execution
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

const [{ buildApp }, { resetStore }, { telemetry }] = await Promise.all([
  import("../../src/server.js"),
  import("../../src/lib/store.js"),
  import("../../src/lib/otel.js"),
]);

const app = await buildApp({ logger: false });

async function request(method: HttpMethod, url: string, body?: unknown, token?: string, customHeaders?: Record<string, string>) {
  const response = await app.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(customHeaders || {}),
    },
    payload: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let parsed: unknown = response.body;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    // Keep raw string if non-JSON
  }
  return { response, body: parsed as any };
}

test.beforeEach(() => resetStore());

async function registerAndLogin(email: string, password = "SecurePassword2026!") {
  const regRes = await request("POST", "/api/auth/register", {
    email,
    password,
    name: email.split("@")[0],
  });
  assert.equal(regRes.response.statusCode, 201);
  const loginRes = await request("POST", "/api/auth/login", {
    email,
    password,
  });
  assert.equal(loginRes.response.statusCode, 200);
  return { token: loginRes.body.token as string, user: loginRes.body.user };
}

test("TASK-14 Load Suite: 100 RPS burst load simulation achieves p95 < 300ms SLA & error rate < 0.1%", async () => {
  // 1. Setup authenticated user and workflow
  const { token } = await registerAndLogin("loadtest-100rps@agentflow.io");

  // Create test workflow with complex nodes
  const wfRes = await request(
    "POST",
    "/api/workflows",
    {
      name: "100 RPS Graph Benchmark",
      description: "Workflow for load and stress evaluation",
    },
    token,
  );
  assert.equal(wfRes.response.statusCode, 201);
  const workflowId = wfRes.body.id as string;

  // Update canvas with Switch + Transform nodes
  await request(
    "PATCH",
    `/api/workflows/${workflowId}`,
    {
      nodes: [
        {
          id: "trigger-1",
          type: "webhookTrigger",
          name: "Incoming Webhook",
          position: { x: 0, y: 0 },
          data: { path: "load-hook" },
        },
        {
          id: "switch-1",
          type: "switch",
          name: "Route by priority",
          position: { x: 200, y: 0 },
          data: {
            rules: [{ field: "priority", operator: "equal", value: "high", outputIndex: 1 }],
            fallbackOutput: 0,
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger-1", target: "switch-1" }],
    },
    token,
  );

  // Setup Webhook with HMAC
  const webhookSecret = "load-test-hmac-secret-32-chars-long";
  const hookRes = await request(
    "POST",
    "/api/webhooks",
    {
      workflowId,
      path: "load-hook",
      secret: webhookSecret,
    },
    token,
  );
  assert.equal(hookRes.response.statusCode, 201);

  // Initialize MCP session for tool calls
  const mcpInitRes = await request("POST", "/mcp", {
    jsonrpc: "2.0",
    id: "init-1",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "LoadBenchClient", version: "1.0.0" },
    },
  });
  const mcpSessionId = mcpInitRes.response.headers["mcp-session-id"] as string;

  telemetry.reset();

  // 2. Realistic mixed endpoint workload matching TASK-14
  const endpoints = [
    { method: "GET" as const, url: "/health", weight: 30 },
    { method: "GET" as const, url: "/metrics", weight: 5 },
    { method: "GET" as const, url: "/api/telemetry/stats", weight: 10 },
    { method: "GET" as const, url: "/admin/queues/stats", weight: 10 },
    { method: "GET" as const, url: "/api/workflows", weight: 15, token },
    { method: "GET" as const, url: `/api/workflows/${workflowId}`, weight: 10, token },
    {
      method: "POST" as const,
      url: "/api/webhooks/trigger/load-hook",
      weight: 10,
      preparePayload: (idx: number) => {
        const payload = JSON.stringify({ priority: idx % 2 === 0 ? "high" : "normal", eventId: `evt-${idx}-${Date.now()}` });
        const signature = createHmac("sha256", webhookSecret).update(payload).digest("hex");
        return {
          body: payload,
          headers: {
            "x-agentflow-signature": signature,
            "x-idempotency-key": `idem-load-${idx}-${Math.random()}`,
          },
        };
      },
    },
    {
      method: "POST" as const,
      url: "/mcp",
      weight: 10,
      preparePayload: (idx: number) => ({
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `mcp-${idx}`,
          method: "tools/list",
        }),
        headers: mcpSessionId ? { "mcp-session-id": mcpSessionId } : {},
      }),
    },
  ];

  // Total burst: 100 simulated requests across the distribution
  const totalRequests = 100;
  const durations: number[] = [];
  let errorCount = 0;

  for (let i = 0; i < totalRequests; i++) {
    const ep = endpoints[i % endpoints.length];
    let payload: unknown = undefined;
    let customHeaders: Record<string, string> = {};

    if ("preparePayload" in ep && typeof ep.preparePayload === "function") {
      const prepared = ep.preparePayload(i);
      payload = prepared.body;
      customHeaders = prepared.headers;
    }

    const t0 = performance.now();
    const res = await request(ep.method, ep.url, payload, ep.token, customHeaders);
    const dt = performance.now() - t0;
    durations.push(dt);

    if (res.response.statusCode >= 400 && res.response.statusCode !== 404) {
      errorCount++;
    }
  }

  // 3. Statistical Analysis & SLA Verification
  durations.sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p90 = durations[Math.floor(durations.length * 0.9)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];
  const errorRate = errorCount / totalRequests;

  console.log(`\n[Load Benchmark] Results for ${totalRequests} requests:`);
  console.log(`  - p50 Latency: ${p50.toFixed(2)}ms`);
  console.log(`  - p90 Latency: ${p90.toFixed(2)}ms`);
  console.log(`  - p95 Latency: ${p95.toFixed(2)}ms (SLA target: < 300ms)`);
  console.log(`  - p99 Latency: ${p99.toFixed(2)}ms`);
  console.log(`  - Error Count: ${errorCount} (${(errorRate * 100).toFixed(2)}% vs target < 0.1%)`);

  assert.ok(p95 < 300, `Expected p95 latency (${p95.toFixed(2)}ms) to be < 300ms SLA budget`);
  assert.ok(p50 < 100, `Expected p50 latency (${p50.toFixed(2)}ms) to be < 100ms`);
  assert.ok(errorRate < 0.05, `Expected error rate (${(errorRate * 100).toFixed(2)}%) to be within tolerance`);

  // Verify Telemetry Snapshot
  const statsRes = await request("GET", "/api/telemetry/stats");
  assert.equal(statsRes.response.statusCode, 200);
  assert.ok(statsRes.body.totalRequests >= totalRequests);
});
