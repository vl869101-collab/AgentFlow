import assert from "node:assert/strict";
import test from "node:test";

// Tests intentionally use the deterministic in-memory adapter.
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

const [{ buildApp }, { resetStore }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => resetStore());

test("MCP streamable-http rejects unauthorized requests without af_ token", async () => {
  const noAuth = await app.inject({
    method: "POST",
    url: "/mcp/http",
    payload: { jsonrpc: "2.0", id: 1, method: "ping" },
  });
  assert.equal(noAuth.statusCode, 401);
  assert.equal(JSON.parse(noAuth.body).code, "AUTH_FAILED");

  const badToken = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer invalid_token" },
    payload: { jsonrpc: "2.0", id: 1, method: "ping" },
  });
  assert.equal(badToken.statusCode, 401);
  assert.equal(JSON.parse(badToken.body).code, "AUTH_FAILED");
});

test("MCP initialize returns capabilities, protocolVersion 2024-11-05 and assigns session id", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_secret_test_token" },
    payload: { jsonrpc: "2.0", id: "init-1", method: "initialize", params: {} },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["mcp-protocol-version"], "2024-11-05");
  const body = JSON.parse(res.body);
  assert.equal(body.id, "init-1");
  assert.equal(body.result.protocolVersion, "2024-11-05");
  assert.equal(body.result.serverInfo.name, "AgentFlow MCP Server");
  assert.ok(res.headers["mcp-session-id"]);
});

test("MCP tools/list returns tools with scopes per tool", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: { jsonrpc: "2.0", id: "tools-1", method: "tools/list" },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.result.tools));
  assert.ok(body.result.tools.length >= 10);

  const toolMap = new Map(body.result.tools.map((t: any) => [t.name, t]));
  assert.ok(toolMap.has("search_workflows"));
  assert.ok(toolMap.has("execute_workflow"));
  assert.ok(toolMap.has("trigger_workflow"));
  assert.ok(toolMap.has("validate_workflow"));

  // Check scopes are present on tools
  const searchTool = toolMap.get("search_workflows") as any;
  assert.ok(Array.isArray(searchTool.scopes));
  assert.ok(searchTool.scopes.includes("workflows:read"));

  const execTool = toolMap.get("execute_workflow") as any;
  assert.ok(Array.isArray(execTool.scopes));
  assert.ok(execTool.scopes.includes("executions:write"));
});

test("MCP tools/call executes tools correctly with real workflow execution and BullMQ trigger", async () => {
  // 1. Create a workflow via Prisma store
  const { prisma } = await import("../src/lib/prisma.js");
  const org = await prisma.organization.create({ data: { name: "MCP Test Org" } });
  const wf = await prisma.workflow.create({
    data: {
      name: "Test Flow",
      orgId: org.id,
      status: "ACTIVE",
      nodes: [
        { id: "trigger", type: "trigger", config: {} },
        { id: "output", type: "output", config: {} },
      ],
      edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
    },
  });

  // 2. Search workflows tool
  const searchRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "search-1",
      method: "tools/call",
      params: { name: "search_workflows", arguments: { query: "Test Flow" } },
    },
  });
  assert.equal(searchRes.statusCode, 200);
  const searchBody = JSON.parse(searchRes.body);
  const searchResult = JSON.parse(searchBody.result.content[0].text);
  assert.ok(searchResult.workflows.length >= 1);
  assert.equal(searchResult.workflows[0].id, wf.id);

  // 3. Execute workflow synchronously
  const execRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "exec-1",
      method: "tools/call",
      params: { name: "execute_workflow", arguments: { workflowId: wf.id, input: { foo: "bar" } } },
    },
  });
  assert.equal(execRes.statusCode, 200);
  const execBody = JSON.parse(execRes.body);
  const execResult = JSON.parse(execBody.result.content[0].text);
  assert.equal(execResult.workflowId, wf.id);
  assert.equal(execResult.status, "SUCCESS");

  // 4. Trigger workflow asynchronously via BullMQ
  const triggerRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "trig-1",
      method: "tools/call",
      params: { name: "trigger_workflow", arguments: { workflowId: wf.id, input: { asyncTest: 123 } } },
    },
  });
  assert.equal(triggerRes.statusCode, 200);
  const triggerBody = JSON.parse(triggerRes.body);
  const triggerResult = JSON.parse(triggerBody.result.content[0].text);
  assert.ok(triggerResult.executionId);
  assert.equal(triggerResult.workflowId, wf.id);

  // 4b. Test camelCase aliases (searchWorkflows, executeWorkflow, triggerWorkflow)
  const ccSearchRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "cc-search-1",
      method: "tools/call",
      params: { name: "searchWorkflows", arguments: { query: "Test Flow" } },
    },
  });
  assert.equal(ccSearchRes.statusCode, 200);
  assert.ok(JSON.parse(JSON.parse(ccSearchRes.body).result.content[0].text).workflows.length >= 1);

  const ccExecRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "cc-exec-1",
      method: "tools/call",
      params: { name: "executeWorkflow", arguments: { workflowId: wf.id, input: { aliasTest: true } } },
    },
  });
  assert.equal(ccExecRes.statusCode, 200);
  assert.equal(JSON.parse(JSON.parse(ccExecRes.body).result.content[0].text).status, "SUCCESS");

  const ccTriggerRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "cc-trig-1",
      method: "tools/call",
      params: { name: "triggerWorkflow", arguments: { workflowId: wf.id, input: { asyncAlias: true } } },
    },
  });
  assert.equal(ccTriggerRes.statusCode, 200);
  assert.ok(JSON.parse(JSON.parse(ccTriggerRes.body).result.content[0].text).executionId);

  // 5. Test scope enforcement
  const scopeDeniedRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: "Bearer af_token_123",
      "x-mcp-scopes": "workflows:read", // Does not have executions:write
    },
    payload: {
      jsonrpc: "2.0",
      id: "scope-1",
      method: "tools/call",
      params: { name: "execute_workflow", arguments: { workflowId: wf.id } },
    },
  });
  assert.equal(scopeDeniedRes.statusCode, 200);
  const scopeDeniedBody = JSON.parse(scopeDeniedRes.body);
  assert.equal(scopeDeniedBody.result.isError, true);
  assert.ok(scopeDeniedBody.result.content[0].text.includes("Insufficient scope"));

  // 6. Test MOCK_MCP=false enforcement
  process.env.MOCK_MCP = "false";
  const mockCallRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: {
      jsonrpc: "2.0",
      id: "mock-1",
      method: "tools/call",
      params: { name: "mock_ai_generate", arguments: { prompt: "hello" } },
    },
  });
  assert.equal(mockCallRes.statusCode, 200);
  const mockCallBody = JSON.parse(mockCallRes.body);
  assert.equal(mockCallBody.result.isError, true);
  assert.ok(mockCallBody.result.content[0].text.includes("MOCK_MCP=false"));
  delete process.env.MOCK_MCP;
});

test("MCP resources and prompts work as expected", async () => {
  // Resources list
  const resList = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: { jsonrpc: "2.0", id: "res-1", method: "resources/list" },
  });
  assert.equal(resList.statusCode, 200);
  const resListBody = JSON.parse(resList.body);
  assert.ok(resListBody.result.resources.length > 0);

  // Resources read
  const resRead = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: { jsonrpc: "2.0", id: "res-2", method: "resources/read", params: { uri: "agentflow://system/status" } },
  });
  assert.equal(resRead.statusCode, 200);
  const resReadBody = JSON.parse(resRead.body);
  assert.ok(resReadBody.result.contents[0].text.includes("AgentFlow MCP Server"));

  // Prompts list
  const promptList = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer af_token_123" },
    payload: { jsonrpc: "2.0", id: "p-1", method: "prompts/list" },
  });
  assert.equal(promptList.statusCode, 200);
  const promptListBody = JSON.parse(promptList.body);
  assert.ok(promptListBody.result.prompts.length > 0);
});

test("MCP token generation and status endpoint", async () => {
  // Token generation
  const tokRes = await app.inject({
    method: "POST",
    url: "/mcp/token",
  });
  assert.equal(tokRes.statusCode, 200);
  const tokBody = JSON.parse(tokRes.body);
  assert.ok(tokBody.token.startsWith("af_"));

  // Status check
  const statusRes = await app.inject({
    method: "GET",
    url: "/mcp/status",
  });
  assert.equal(statusRes.statusCode, 200);
  const statusBody = JSON.parse(statusRes.body);
  assert.equal(statusBody.server, "agentflow-mcp");
  assert.ok(statusBody.toolsCount >= 10);
});

