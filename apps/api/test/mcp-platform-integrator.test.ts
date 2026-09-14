import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

// Ensure test environment uses deterministic in-memory store
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

test.beforeEach(async () => {
  resetStore();
});

test("Platform Integrator: Client connection configurations and handshake across CLI, Web, and IDE clients", async () => {
  // 1. Setup User & API Key
  const user = await prisma.user.create({
    data: {
      email: "integrator@agentflow.io",
      name: "Platform Integrator",
      passwordHash: "test-hash",
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: "Integrations Org",
    },
  });

  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      orgId: org.id,
      role: "ADMIN",
    },
  });

  const rawKey = "af_platform_integrator_test_token_2026";
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");

  await prisma.apiKey.create({
    data: {
      name: "Cursor / Claude Key",
      key: hashedKey,
      userId: user.id,
      orgId: org.id,
    },
  });

  // 2. Test Streamable HTTP Handshake (/mcp/http and /mcp)
  const initRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: "init-platform-1",
      method: "initialize",
      params: {
        clientInfo: {
          name: "cursor-ide",
          version: "0.45.0",
        },
      },
    },
  });

  assert.equal(initRes.statusCode, 200);
  const initBody = JSON.parse(initRes.body);
  assert.equal(initBody.id, "init-platform-1");
  assert.equal(initBody.result.protocolVersion, "2024-11-05");
  assert.equal(initBody.result.serverInfo.name, "AgentFlow MCP Server");
  assert.ok(initBody.result.capabilities.tools);
  assert.ok(initBody.result.capabilities.resources);
  assert.ok(initBody.result.capabilities.prompts);

  // 3. Test Tools Discovery
  const toolsRes = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: "tools-platform-1",
      method: "tools/list",
    },
  });

  assert.equal(toolsRes.statusCode, 200);
  const toolsBody = JSON.parse(toolsRes.body);
  assert.ok(Array.isArray(toolsBody.result.tools));
  assert.ok(toolsBody.result.tools.length >= 15);

  const toolNames = new Set(toolsBody.result.tools.map((t: { name: string }) => t.name));
  assert.ok(toolNames.has("search_workflows"));
  assert.ok(toolNames.has("execute_workflow"));
  assert.ok(toolNames.has("trigger_workflow"));
  assert.ok(toolNames.has("validate_workflow"));
  assert.ok(toolNames.has("list_credentials"));
});

test("Platform Integrator: Cross-platform workflow execution and trigger flow via MCP tool calls", async () => {
  const user = await prisma.user.create({
    data: {
      email: "executor@agentflow.io",
      name: "Executor User",
      passwordHash: "test-hash",
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: "Execution Org",
    },
  });

  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      orgId: org.id,
      role: "ADMIN",
    },
  });

  const rawKey = "af_executor_token_123456";
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");

  await prisma.apiKey.create({
    data: {
      name: "Execution Key",
      key: hashedKey,
      userId: user.id,
      orgId: org.id,
    },
  });

  // Create workflow in the org
  const wf = await prisma.workflow.create({
    data: {
      name: "Lead Qualification Pipeline",
      description: "Auto-qualifies incoming CRM leads",
      orgId: org.id,
      status: "ACTIVE",
      nodes: [
        { id: "trigger", type: "webhook", config: {} },
        { id: "ai_scoring", type: "ai-agent", config: { model: "nvidia/llama-3.1-nemotron-70b-instruct" } },
        { id: "slack_notify", type: "slack", config: { channel: "#sales-alerts" } },
      ],
      edges: [
        { id: "e1", source: "trigger", target: "ai_scoring" },
        { id: "e2", source: "ai_scoring", target: "slack_notify" },
      ],
    },
  });

  // Call search_workflows tool via MCP
  const searchCall = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: "call-search-1",
      method: "tools/call",
      params: {
        name: "search_workflows",
        arguments: {
          query: "Lead",
        },
      },
    },
  });

  assert.equal(searchCall.statusCode, 200);
  const searchResult = JSON.parse(searchCall.body);
  assert.equal(searchResult.result.isError, false);
  const searchParsed = JSON.parse(searchResult.result.content[0].text);
  assert.equal(searchParsed.total, 1);
  assert.equal(searchParsed.workflows[0].id, wf.id);

  // Call execute_workflow tool via MCP
  const execCall = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: "call-exec-1",
      method: "tools/call",
      params: {
        name: "execute_workflow",
        arguments: {
          workflowId: wf.id,
          input: {
            leadName: "Acme Corp",
            leadScore: 95,
          },
        },
      },
    },
  });

  assert.equal(execCall.statusCode, 200);
  const execResult = JSON.parse(execCall.body);
  assert.equal(execResult.result.isError, false);
  const execParsed = JSON.parse(execResult.result.content[0].text);
  assert.ok(execParsed.id);
  assert.ok(typeof execParsed.status === "string");

  // Call trigger_workflow tool (BullMQ async queuing)
  const triggerCall = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: `Bearer ${rawKey}`,
    },
    payload: {
      jsonrpc: "2.0",
      id: "call-trigger-1",
      method: "tools/call",
      params: {
        name: "trigger_workflow",
        arguments: {
          workflowId: wf.id,
          input: { event: "new_signup" },
        },
      },
    },
  });

  assert.equal(triggerCall.statusCode, 200);
  const triggerResult = JSON.parse(triggerCall.body);
  assert.equal(triggerResult.result.isError, false);
  const triggerParsed = JSON.parse(triggerResult.result.content[0].text);
  assert.ok(triggerParsed.executionId);
  assert.equal(triggerParsed.workflowId, wf.id);
});

test("Platform Integrator: Token generation, status inspection and client configurations", async () => {
  const tokenRes = await app.inject({
    method: "POST",
    url: "/mcp/token",
  });
  assert.equal(tokenRes.statusCode, 200);
  const tokenBody = JSON.parse(tokenRes.body);
  assert.equal(tokenBody.success, true);
  assert.ok(tokenBody.token.startsWith("af_"));

  const user = await prisma.user.create({
    data: { email: "status-test@agentflow.io", name: "Status Tester", passwordHash: "test" },
  });
  const org = await prisma.organization.create({ data: { name: "Status Org" } });
  await prisma.organizationMember.create({ data: { userId: user.id, orgId: org.id, role: "ADMIN" } });
  const rawKey = "af_status_key_12345";
  await prisma.apiKey.create({
    data: { name: "Status Key", key: createHash("sha256").update(rawKey).digest("hex"), userId: user.id, orgId: org.id },
  });

  const statusRes = await app.inject({
    method: "GET",
    url: "/mcp/status",
    headers: { authorization: `Bearer ${rawKey}` },
  });
  assert.equal(statusRes.statusCode, 200);
  const statusBody = JSON.parse(statusRes.body);
  assert.equal(typeof statusBody.enabled, "boolean");
  assert.equal(typeof statusBody.toolsCount, "number");
  assert.ok(statusBody.toolsCount >= 15);
});
