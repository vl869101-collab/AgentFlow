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
process.env.MOCK_SERVICES = "true";

const [{ buildApp }, { resetStore }, { prisma }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
]);

const [{ runExecution }] = await Promise.all([
  import("../src/services/executor.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
});

// ─────────────────────────────────────────────────────────────
// TASK 13: Executions cursor pagination, filters, traces, errorWorkflow
// ─────────────────────────────────────────────────────────────

test("TASK 13: Executions cursor pagination and status/trigger/date filters", async () => {
  const org = await prisma.organization.create({ data: { name: "Exec Org", slug: "exec-org" } });
  const user = await prisma.user.create({ data: { email: "exec@test.com", passwordHash: "h", name: "Exec User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  const wf1 = await prisma.workflow.create({
    data: { name: "Flow A", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });
  const wf2 = await prisma.workflow.create({
    data: { name: "Flow B", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });

  const now = Date.now();
  // Create 5 executions with different properties
  const e1 = await prisma.workflowExecution.create({
    data: { workflowId: wf1.id, orgId: org.id, userId: user.id, status: "SUCCESS", trigger: "manual", startedAt: new Date(now - 4000) },
  });
  const e2 = await prisma.workflowExecution.create({
    data: { workflowId: wf1.id, orgId: org.id, userId: user.id, status: "FAILED", trigger: "webhook", startedAt: new Date(now - 3000) },
  });
  const e3 = await prisma.workflowExecution.create({
    data: { workflowId: wf2.id, orgId: org.id, userId: user.id, status: "SUCCESS", trigger: "cron", startedAt: new Date(now - 2000) },
  });
  const e4 = await prisma.workflowExecution.create({
    data: { workflowId: wf2.id, orgId: org.id, userId: user.id, status: "RUNNING", trigger: "api", startedAt: new Date(now - 1000) },
  });
  const e5 = await prisma.workflowExecution.create({
    data: { workflowId: wf1.id, orgId: org.id, userId: user.id, status: "SUCCESS", trigger: "api", startedAt: new Date(now) },
  });

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  // 1. Cursor pagination with limit=2
  const page1Res = await app.inject({
    method: "GET",
    url: "/api/executions?limit=2&paginate=true",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(page1Res.statusCode, 200);
  const page1 = page1Res.json();
  assert.equal(page1.items.length, 2);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);
  assert.equal(page1Res.headers["x-has-more"], "true");

  const page2Res = await app.inject({
    method: "GET",
    url: `/api/executions?limit=2&cursor=${page1.nextCursor}&paginate=true`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(page2Res.statusCode, 200);
  const page2 = page2Res.json();
  assert.equal(page2.items.length, 2);

  // 2. Filter by status=SUCCESS
  const filterStatusRes = await app.inject({
    method: "GET",
    url: "/api/executions?status=SUCCESS",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(filterStatusRes.statusCode, 200);
  const statusItems = filterStatusRes.json();
  assert.equal(statusItems.length, 3);
  assert.ok(statusItems.every((item: any) => item.status === "SUCCESS"));

  // 3. Filter by workflowId
  const filterWfRes = await app.inject({
    method: "GET",
    url: `/api/executions?workflowId=${wf2.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(filterWfRes.statusCode, 200);
  const wfItems = filterWfRes.json();
  assert.equal(wfItems.length, 2);

  // 4. Filter by trigger=api
  const filterTriggerRes = await app.inject({
    method: "GET",
    url: "/api/executions?trigger=api",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(filterTriggerRes.statusCode, 200);
  const triggerItems = filterTriggerRes.json();
  assert.equal(triggerItems.length, 2);
});

test("TASK 13: GET /api/executions/:id and /traces return traces and errorWorkflow metadata", async () => {
  const org = await prisma.organization.create({ data: { name: "Trace Org", slug: "trace-org" } });
  const user = await prisma.user.create({ data: { email: "trace@test.com", passwordHash: "h", name: "Trace User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  const errorWf = await prisma.workflow.create({
    data: { name: "Error Handler Workflow", orgId: org.id, ownerId: user.id, status: "ACTIVE" },
  });

  const mainWf = await prisma.workflow.create({
    data: {
      name: "Main Flow with Error Handler",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflowId: errorWf.id }),
    },
  });

  const execution = await prisma.workflowExecution.create({
    data: { workflowId: mainWf.id, orgId: org.id, userId: user.id, status: "SUCCESS", trigger: "manual" },
  });

  await prisma.nodeExecution.create({
    data: {
      nodeId: "n1",
      executionId: execution.id,
      status: "SUCCESS",
      input: { step: 1 },
      output: { step: 1, ok: true },
      startedAt: new Date(),
      finishedAt: new Date(),
      duration: 15,
    },
  });

  const token = app.jwt.sign({ sub: user.id, orgId: org.id });

  // Detail endpoint includes traces, nodes, workflow, and errorWorkflow
  const detailRes = await app.inject({
    method: "GET",
    url: `/api/executions/${execution.id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(detailRes.statusCode, 200);
  const detail = detailRes.json();
  assert.equal(detail.id, execution.id);
  assert.ok(Array.isArray(detail.nodes));
  assert.ok(Array.isArray(detail.traces));
  assert.equal(detail.traces.length, 1);
  assert.equal(detail.traces[0].nodeId, "n1");
  assert.ok(detail.errorWorkflow);
  assert.equal(detail.errorWorkflow.id, errorWf.id);
  assert.equal(detail.errorWorkflow.name, errorWf.name);

  // Dedicated traces endpoint
  const tracesRes = await app.inject({
    method: "GET",
    url: `/api/executions/${execution.id}/traces`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(tracesRes.statusCode, 200);
  const tracesData = tracesRes.json();
  assert.equal(tracesData.executionId, execution.id);
  assert.equal(tracesData.traces.length, 1);
  assert.equal(tracesData.traces[0].status, "SUCCESS");
});

test("TASK 13: Workflow execution failure triggers errorWorkflow", async () => {
  const org = await prisma.organization.create({ data: { name: "Err Org", slug: "err-org" } });
  const user = await prisma.user.create({ data: { email: "err@test.com", passwordHash: "h", name: "Err User" } });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });

  const errorWf = await prisma.workflow.create({
    data: {
      name: "Alert Handler",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: [
        { id: "err-trig", type: "trigger", config: {} },
        { id: "err-out", type: "output", config: {} },
      ],
      edges: [{ id: "e-err", sourceNodeId: "err-trig", targetNodeId: "err-out" }],
    },
  });

  const failingWf = await prisma.workflow.create({
    data: {
      name: "Failing Flow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: JSON.stringify({ errorWorkflow: errorWf.id }),
      nodes: [
        { id: "t1", type: "trigger", config: {} },
        { id: "bad-http", type: "http", config: { url: "http://127.0.0.1:9999/unreachable" } },
      ],
      edges: [{ id: "e1", sourceNodeId: "t1", targetNodeId: "bad-http" }],
    },
  });

  const execution = await prisma.workflowExecution.create({
    data: { workflowId: failingWf.id, orgId: org.id, userId: user.id, status: "PENDING", trigger: "manual" },
  });

  const result = await runExecution(execution.id);
  assert.equal(result.status, "FAILED");

  // Verify that an error workflow execution was created for Alert Handler
  const errorExecutions = await prisma.workflowExecution.findMany({
    where: { workflowId: errorWf.id },
  });
  assert.ok(errorExecutions.length >= 1, "Expected error workflow execution to be triggered");
  const errExec = errorExecutions[0];
  assert.equal(errExec.trigger, "error");
  assert.ok((errExec.input as any)?.error?.message);
});

// ─────────────────────────────────────────────────────────────
// TASK 14: MCP Streamable Handshake 2024-11-05 & Scopes
// ─────────────────────────────────────────────────────────────

test("TASK 14: MCP initialize handshake returns protocolVersion 2024-11-05 and assigns session id", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_valid_key_test" },
    payload: { jsonrpc: "2.0", id: "init-handshake", method: "initialize", params: {} },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["mcp-protocol-version"], "2024-11-05");
  assert.ok(res.headers["mcp-session-id"]);

  const body = res.json();
  assert.equal(body.id, "init-handshake");
  assert.equal(body.result.protocolVersion, "2024-11-05");
  assert.equal(body.result.serverInfo.name, "AgentFlow MCP Server");
  assert.ok(body.result.capabilities.tools);
});

test("TASK 14: MCP tools define scopes and enforce x-mcp-scopes authorization", async () => {
  const toolsRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_scopes" },
    payload: { jsonrpc: "2.0", id: "t-list", method: "tools/list" },
  });
  assert.equal(toolsRes.statusCode, 200);
  const tools = toolsRes.json().result.tools;
  assert.ok(Array.isArray(tools));

  for (const tool of tools) {
    assert.ok(Array.isArray(tool.scopes), `Tool ${tool.name} must define scopes array`);
    assert.ok(tool.scopes.length > 0, `Tool ${tool.name} must have at least one scope`);
  }

  // Calling execute_workflow with read-only scope should be denied
  const callDeniedRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: "Bearer af_token_scopes",
      "x-mcp-scopes": "workflows:read",
    },
    payload: {
      jsonrpc: "2.0",
      id: "call-denied",
      method: "tools/call",
      params: { name: "execute_workflow", arguments: { workflowId: "wf-any" } },
    },
  });
  assert.equal(callDeniedRes.statusCode, 200);
  const deniedBody = callDeniedRes.json();
  assert.equal(deniedBody.result.isError, true);
  assert.ok(deniedBody.result.content[0].text.includes("Insufficient scope"));
});

// ─────────────────────────────────────────────────────────────
// TASK 15: Real searchWorkflows, executeWorkflow, triggerWorkflow
// ─────────────────────────────────────────────────────────────

test("TASK 15: searchWorkflows, executeWorkflow, triggerWorkflow tools function end-to-end", async () => {
  const org = await prisma.organization.create({ data: { name: "MCP Real Org", slug: "mcp-real" } });
  const wf = await prisma.workflow.create({
    data: {
      name: "Invoice Processing Workflow",
      description: "Processes PDF invoices and stores in DB",
      orgId: org.id,
      status: "ACTIVE",
      nodes: [
        { id: "trig", type: "trigger", config: {} },
        { id: "out", type: "output", config: {} },
      ],
      edges: [{ id: "e1", sourceNodeId: "trig", targetNodeId: "out" }],
    },
  });

  // 1. searchWorkflows (real query matching)
  const searchRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_real" },
    payload: {
      jsonrpc: "2.0",
      id: "s-1",
      method: "tools/call",
      params: { name: "searchWorkflows", arguments: { query: "Invoice" } },
    },
  });
  assert.equal(searchRes.statusCode, 200);
  const searchData = JSON.parse(searchRes.json().result.content[0].text);
  assert.ok(searchData.workflows.length >= 1);
  assert.equal(searchData.workflows[0].id, wf.id);

  // 2. executeWorkflow (real synchronous execution)
  const execRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_real" },
    payload: {
      jsonrpc: "2.0",
      id: "e-1",
      method: "tools/call",
      params: { name: "executeWorkflow", arguments: { workflowId: wf.id, input: { invoiceId: "INV-99" } } },
    },
  });
  assert.equal(execRes.statusCode, 200);
  const execData = JSON.parse(execRes.json().result.content[0].text);
  assert.equal(execData.workflowId, wf.id);
  assert.equal(execData.status, "SUCCESS");

  // 3. triggerWorkflow (async BullMQ / background trigger)
  const trigRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_real" },
    payload: {
      jsonrpc: "2.0",
      id: "t-1",
      method: "tools/call",
      params: { name: "triggerWorkflow", arguments: { workflowId: wf.id, input: { invoiceId: "INV-100" } } },
    },
  });
  assert.equal(trigRes.statusCode, 200);
  const trigData = JSON.parse(trigRes.json().result.content[0].text);
  assert.ok(trigData.executionId);
  assert.equal(trigData.workflowId, wf.id);
  assert.ok(trigData.message.includes("triggered in background"));
});

