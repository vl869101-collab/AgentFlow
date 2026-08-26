import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

// Deterministic in-memory database configuration for test suite
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

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
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

test("E2E COMPLETE PIPELINE: Auth -> Workflow Creation -> Manual Execution -> Webhook Trigger with HMAC & Idempotency -> MCP Tool Execution -> Traces & Observability", async () => {
  // ==========================================
  // STEP 1: Full Authentication & Token Rotation Flow
  // ==========================================
  const userEmail = "e2e-user@agentflow.io";
  const userPassword = "SecurePassword2026!";

  // 1.1 Register user
  const regRes = await request("POST", "/api/auth/register", {
    email: userEmail,
    password: userPassword,
    name: "E2E Test User",
  });
  assert.equal(regRes.response.statusCode, 201, `Registration failed: ${JSON.stringify(regRes.body)}`);
  assert.equal(typeof regRes.body.message, "string");

  // 1.2 Login user
  const loginRes = await request("POST", "/api/auth/login", {
    email: userEmail,
    password: userPassword,
  });
  assert.equal(loginRes.response.statusCode, 200, `Login failed: ${JSON.stringify(loginRes.body)}`);
  assert.ok(loginRes.body.token, "Access token missing from login response");
  assert.ok(loginRes.body.refreshToken, "Refresh token missing from login response");
  assert.ok(loginRes.body.user.orgId, "Organization ID missing from user profile");

  let token = loginRes.body.token as string;
  const refreshToken = loginRes.body.refreshToken as string;
  const orgId = loginRes.body.user.orgId as string;

  // 1.3 Verify Refresh Token rotation
  const refreshRes = await request("POST", "/api/auth/refresh", {
    refreshToken,
  });
  assert.equal(refreshRes.response.statusCode, 200, "Token refresh failed");
  assert.ok(refreshRes.body.token, "New access token missing");
  assert.ok(refreshRes.body.refreshToken, "New refresh token missing");
  // Update working token
  token = refreshRes.body.token;

  // 1.4 Verify unauthenticated request to protected route is rejected
  const unauthRes = await request("GET", "/api/workflows");
  assert.equal(unauthRes.response.statusCode, 401, "Protected route must reject unauthenticated requests");

  // ==========================================
  // STEP 2: Workflow Creation, Node Configuration, and Graph Definition
  // ==========================================
  // 2.1 Create new active workflow
  const wfCreateRes = await request(
    "POST",
    "/api/workflows",
    {
      name: "E2E E-Commerce Order Processing Pipeline",
      description: "Automated workflow from Webhook to Output",
    },
    token
  );
  assert.equal(wfCreateRes.response.statusCode, 201, `Workflow creation failed: ${JSON.stringify(wfCreateRes.body)}`);
  const workflowId = wfCreateRes.body.id as string;
  assert.ok(workflowId, "Workflow ID missing");
  assert.equal(wfCreateRes.body.orgId, orgId, "Workflow must belong to user organization");

  // 2.2 Configure full Node Graph (Trigger -> Output)
  const nodes = [
    {
      id: "node_trigger",
      type: "trigger",
      position: { x: 50, y: 150 },
      data: {
        type: "webhook",
        label: "Order Webhook",
        config: { path: "order-inbound" },
      },
    },
    {
      id: "node_output",
      type: "advanced",
      position: { x: 400, y: 150 },
      data: {
        type: "output",
        label: "Final Result Output",
        config: {},
      },
    },
  ];

  const edges = [
    { id: "e1", source: "node_trigger", target: "node_output" },
  ];

  const wfUpdateRes = await request(
    "PATCH",
    `/api/workflows/${workflowId}`,
    {
      status: "ACTIVE",
      nodes,
      edges,
    },
    token
  );
  assert.equal(wfUpdateRes.response.statusCode, 200, "Workflow update failed");
  assert.equal(wfUpdateRes.body.nodes.length, 2);
  assert.equal(wfUpdateRes.body.edges.length, 1);
  assert.equal(wfUpdateRes.body.status, "ACTIVE");

  // 2.3 Search workflow by query
  const searchRes = await request("GET", "/api/workflows?q=E-Commerce", undefined, token);
  assert.equal(searchRes.response.statusCode, 200);
  const searchItems = Array.isArray(searchRes.body.data) ? searchRes.body.data : searchRes.body;
  const found = searchItems.some((w: any) => w.id === workflowId);
  assert.ok(found, "Created workflow must be searchable");

  // ==========================================
  // STEP 3: Manual Execution Flow & Verification
  // ==========================================
  const manualInput = {
    orderId: "ORD-99881",
    amount: 250,
    customer: "alice@example.com",
  };

  const execTriggerRes = await request(
    "POST",
    "/api/executions/trigger",
    {
      workflowId,
      input: manualInput,
    },
    token
  );
  assert.equal(execTriggerRes.response.statusCode, 202, `Execution trigger failed: ${JSON.stringify(execTriggerRes.body)}`);
  const executionId = execTriggerRes.body.id as string;
  assert.ok(executionId, "Execution ID missing");

  // 3.2 Poll execution status until completion
  let executionDetails: any;
  for (let i = 0; i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const detailRes = await request("GET", `/api/executions/${executionId}`, undefined, token);
    if (detailRes.body.status === "SUCCESS" || detailRes.body.status === "FAILED") {
      executionDetails = detailRes.body;
      break;
    }
  }

  assert.ok(executionDetails, "Execution did not complete in expected time");
  assert.equal(executionDetails.status, "SUCCESS", `Execution ended in non-success status: ${executionDetails.status}`);
  assert.ok(executionDetails.nodes.length >= 2, "All pipeline nodes must be recorded in execution logs");
  assert.deepEqual(executionDetails.output, manualInput);

  // 3.3 Verify Execution Traces (OpenTelemetry integration)
  const tracesRes = await request("GET", `/api/executions/${executionId}/traces`, undefined, token);
  assert.equal(tracesRes.response.statusCode, 200);
  assert.equal(tracesRes.body.executionId, executionId, "Execution ID must match in traces response");
  assert.ok(Array.isArray(tracesRes.body.traces), "Traces must be an array");
  assert.ok(tracesRes.body.traces.length >= 2, "Traces must include executed nodes");

  // ==========================================
  // STEP 4: Webhook Ingestion with HMAC Verification & Idempotency
  // ==========================================
  const webhookSecret = "whsec_super_secret_e2e_key_443322";
  const webhookPath = "e2e-order-webhook";

  // 4.1 Register Webhook endpoint for the workflow
  const webhookCreateRes = await request(
    "POST",
    "/api/webhooks",
    {
      workflowId,
      path: webhookPath,
      secret: webhookSecret,
      active: true,
    },
    token
  );
  assert.equal(webhookCreateRes.response.statusCode, 201, `Webhook registration failed: ${JSON.stringify(webhookCreateRes.body)}`);

  const webhookPayload = JSON.stringify({
    orderId: "ORD-WEBHOOK-777",
    amount: 500,
    source: "shopify-webhook",
  });

  const validSignature = createHmac("sha256", webhookSecret).update(webhookPayload).digest("hex");
  const idempotencyKey = "idem_key_unique_e2e_778899";

  // 4.2 Test missing / invalid signature rejected with 401
  const badSigRes = await request(
    "POST",
    `/api/webhooks/trigger/${webhookPath}`,
    webhookPayload,
    undefined,
    {
      "content-type": "application/json",
      "x-signature": "sha256=invalid_hash",
      "x-idempotency-key": idempotencyKey,
    }
  );
  assert.equal(badSigRes.response.statusCode, 401, "Webhook with invalid signature must be rejected with 401");

  // 4.3 Test valid signed webhook accepted with 202
  const validWebhookRes = await request(
    "POST",
    `/api/webhooks/trigger/${webhookPath}`,
    webhookPayload,
    undefined,
    {
      "content-type": "application/json",
      "x-signature": `sha256=${validSignature}`,
      "x-idempotency-key": idempotencyKey,
    }
  );
  assert.equal(validWebhookRes.response.statusCode, 202, `Valid webhook failed: ${JSON.stringify(validWebhookRes.body)}`);
  const webhookExecId = validWebhookRes.body.executionId || validWebhookRes.body.id;
  assert.ok(webhookExecId, "Webhook trigger must return executionId");

  // 4.4 Test Idempotent replay: sending same idempotency key returns cached/deduplicated 200
  const replayWebhookRes = await request(
    "POST",
    `/api/webhooks/trigger/${webhookPath}`,
    webhookPayload,
    undefined,
    {
      "content-type": "application/json",
      "x-signature": `sha256=${validSignature}`,
      "x-idempotency-key": idempotencyKey,
    }
  );
  assert.equal(replayWebhookRes.response.statusCode, 200, "Duplicate idempotency key must return 200 cached response");

  // 4.5 Poll webhook execution to verify success
  let webhookExecDetails: any;
  for (let i = 0; i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const detailRes = await request("GET", `/api/executions/${webhookExecId}`, undefined, token);
    if (detailRes.body.status === "SUCCESS" || detailRes.body.status === "FAILED") {
      webhookExecDetails = detailRes.body;
      break;
    }
  }
  assert.ok(webhookExecDetails, "Webhook execution did not complete");
  assert.equal(webhookExecDetails.status, "SUCCESS");

  // ==========================================
  // STEP 5: MCP (Model Context Protocol) Server Tool Execution Flow
  // ==========================================
  // 5.1 Initialize MCP Session
  const mcpInitRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${token}` },
    payload: { jsonrpc: "2.0", id: "mcp-e2e-init", method: "initialize", params: {} },
  });
  assert.equal(mcpInitRes.statusCode, 200);
  const mcpInitBody = JSON.parse(mcpInitRes.body);
  assert.equal(mcpInitBody.result.protocolVersion, "2024-11-05");

  // 5.2 List MCP Tools
  const mcpToolsRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${token}` },
    payload: { jsonrpc: "2.0", id: "mcp-e2e-tools", method: "tools/list" },
  });
  assert.equal(mcpToolsRes.statusCode, 200);
  const tools = JSON.parse(mcpToolsRes.body).result.tools;
  assert.ok(tools.some((t: any) => t.name === "search_workflows"));
  assert.ok(tools.some((t: any) => t.name === "execute_workflow"));

  // 5.3 Call search_workflows tool via MCP
  const mcpSearchCall = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      jsonrpc: "2.0",
      id: "mcp-call-search",
      method: "tools/call",
      params: {
        name: "search_workflows",
        arguments: { query: "E-Commerce" },
      },
    },
  });
  assert.equal(mcpSearchCall.statusCode, 200);
  const searchCallResult = JSON.parse(mcpSearchCall.body);
  assert.ok(!searchCallResult.error, "MCP search tool should not error");
  const parsedSearch = JSON.parse(searchCallResult.result.content[0].text);
  assert.ok(parsedSearch.workflows.length >= 1, "Workflow must be found in MCP search");

  // 5.4 Call execute_workflow tool via MCP synchronously
  const mcpExecCall = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      jsonrpc: "2.0",
      id: "mcp-call-exec",
      method: "tools/call",
      params: {
        name: "execute_workflow",
        arguments: {
          workflowId,
          input: { orderId: "ORD-MCP-333", amount: 200 },
        },
      },
    },
  });
  assert.equal(mcpExecCall.statusCode, 200);
  const execCallResult = JSON.parse(mcpExecCall.body);
  assert.ok(!execCallResult.error, "MCP execution tool should not error");
  const parsedExec = JSON.parse(execCallResult.result.content[0].text);
  assert.equal(parsedExec.workflowId, workflowId);
  assert.equal(parsedExec.status, "SUCCESS");

  // ==========================================
  // STEP 6: History & Observability Metrics Check
  // ==========================================
  const historyRes = await request("GET", `/api/executions?workflowId=${workflowId}&status=SUCCESS`, undefined, token);
  assert.equal(historyRes.response.statusCode, 200);
  const items = Array.isArray(historyRes.body.data) ? historyRes.body.data : historyRes.body;
  assert.ok(items.length >= 2, "History must contain both manual and webhook executions");

  // 6.2 Check Prometheus metrics endpoint
  const metricsRes = await request("GET", "/metrics");
  assert.equal(metricsRes.response.statusCode, 200);
  assert.ok(typeof metricsRes.body === "string" && metricsRes.body.includes("# HELP"));
});
