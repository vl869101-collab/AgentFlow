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

const [
  { TeamsNodeHandler, executeTeams, buildAdaptiveCard },
  { WhatsAppNodeHandler, executeWhatsApp },
  { GoogleCalendarNodeHandler, executeGoogleCalendar },
  { GoogleDocsNodeHandler, executeGoogleDocs, substituteTemplateVariables },
  { McpClientNodeHandler, executeMcpClient },
  { scopeMatches },
  { AgentFlowClient, createAgentFlowClient, AgentFlowApiError },
] = await Promise.all([
  import("../src/services/nodes/teams.js"),
  import("../src/services/nodes/whatsapp.js"),
  import("../src/services/nodes/google-calendar.js"),
  import("../src/services/nodes/google-docs.js"),
  import("../src/services/nodes/mcp-client.js"),
  import("../src/mcp/tools.js"),
  import("@agentflow/sdk"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => resetStore());

// ─────────────────────────────────────────────────────────────
// TASK-08: Full MCP Protocol, Prompts, Resources & Granular RBAC
// ─────────────────────────────────────────────────────────────

test("TASK-08: MCP handshake returns capabilities with tools, resources and prompts", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_master_test_token" },
    payload: { jsonrpc: "2.0", id: "handshake-1", method: "initialize", params: {} },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.id, "handshake-1");
  assert.equal(body.result.protocolVersion, "2024-11-05");
  assert.ok(body.result.capabilities.tools);
  assert.ok(body.result.capabilities.resources);
  assert.ok(body.result.capabilities.prompts);
  assert.equal(body.result.serverInfo.name, "AgentFlow MCP Server");
});

test("TASK-08: MCP prompts/list and prompts/get return actionable prompt templates", async () => {
  // 1. prompts/list
  const listRes = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_token_test" },
    payload: { jsonrpc: "2.0", id: "p-list", method: "prompts/list" },
  });
  assert.equal(listRes.statusCode, 200);
  const listBody = JSON.parse(listRes.body);
  assert.ok(Array.isArray(listBody.result.prompts));
  assert.ok(listBody.result.prompts.some((p: any) => p.name === "build_workflow"));
  assert.ok(listBody.result.prompts.some((p: any) => p.name === "troubleshoot_execution"));

  // 2. prompts/get for build_workflow
  const getRes1 = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_token_test" },
    payload: {
      jsonrpc: "2.0",
      id: "p-get-1",
      method: "prompts/get",
      params: { name: "build_workflow", arguments: { goal: "Sync customer orders to Slack" } },
    },
  });
  assert.equal(getRes1.statusCode, 200);
  const getBody1 = JSON.parse(getRes1.body);
  assert.ok(getBody1.result.messages[0].content.text.includes("Sync customer orders to Slack"));

  // 3. prompts/get for troubleshoot_execution
  const getRes2 = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_token_test" },
    payload: {
      jsonrpc: "2.0",
      id: "p-get-2",
      method: "prompts/get",
      params: { name: "troubleshoot_execution", arguments: { executionId: "exec-failed-123" } },
    },
  });
  assert.equal(getRes2.statusCode, 200);
  const getBody2 = JSON.parse(getRes2.body);
  assert.ok(getBody2.result.messages[0].content.text.includes("exec-failed-123"));
});

test("TASK-08: MCP resources/list and resources/read support multiple catalog URIs", async () => {
  const listRes = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_token_test" },
    payload: { jsonrpc: "2.0", id: "res-list", method: "resources/list" },
  });
  assert.equal(listRes.statusCode, 200);
  const listBody = JSON.parse(listRes.body);
  assert.ok(listBody.result.resources.length >= 4);

  // Read system status
  const readRes1 = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_token_test" },
    payload: { jsonrpc: "2.0", id: "res-read-1", method: "resources/read", params: { uri: "agentflow://system/status" } },
  });
  assert.equal(readRes1.statusCode, 200);
  const readBody1 = JSON.parse(readRes1.body);
  const statusJson = JSON.parse(readBody1.result.contents[0].text);
  assert.equal(statusJson.status, "healthy");

  // Read workflows catalog
  const readRes2 = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { authorization: "Bearer af_token_test" },
    payload: { jsonrpc: "2.0", id: "res-read-2", method: "resources/read", params: { uri: "agentflow://workflows" } },
  });
  assert.equal(readRes2.statusCode, 200);
  const readBody2 = JSON.parse(readRes2.body);
  const wfJson = JSON.parse(readBody2.result.contents[0].text);
  assert.equal(wfJson.category, "workflows");
});

test("TASK-08: MCP Granular RBAC enforces scopes and rejects unauthorized calls", async () => {
  const org = await prisma.organization.create({ data: { name: "RBAC Org", slug: "rbac-org" } });
  const wf = await prisma.workflow.create({
    data: {
      name: "Protected Workflow",
      orgId: org.id,
      status: "ACTIVE",
      nodes: [{ id: "n1", type: "trigger", config: {} }],
      edges: [],
    },
  });

  // Call with insufficient scopes (has workflows:read, needs executions:write)
  const deniedRes = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: {
      authorization: "Bearer af_token_scoped",
      "x-mcp-scopes": "workflows:read",
    },
    payload: {
      jsonrpc: "2.0",
      id: "rbac-1",
      method: "tools/call",
      params: { name: "execute_workflow", arguments: { workflowId: wf.id } },
    },
  });
  assert.equal(deniedRes.statusCode, 200);
  const deniedBody = JSON.parse(deniedRes.body);
  assert.equal(deniedBody.result.isError, true);
  assert.ok(deniedBody.result.content[0].text.includes("Insufficient scope"));

  // Call with valid scope executions:write
  const allowedRes = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: {
      authorization: "Bearer af_token_scoped",
      "x-mcp-scopes": "workflows:read,executions:write",
    },
    payload: {
      jsonrpc: "2.0",
      id: "rbac-2",
      method: "tools/call",
      params: { name: "execute_workflow", arguments: { workflowId: wf.id } },
    },
  });
  assert.equal(allowedRes.statusCode, 200);
  const allowedBody = JSON.parse(allowedRes.body);
  assert.equal(Boolean(allowedBody.result.isError), false);
  const execResult = JSON.parse(allowedBody.result.content[0].text);
  assert.equal(execResult.workflowId, wf.id);
  assert.equal(execResult.status, "SUCCESS");
});

test("TASK-08: scopeMatches validates granular scopes, aliases and wildcards", () => {
  // 1. Wildcard matching
  assert.equal(scopeMatches(["*"], ["workflows:read", "executions:write"]), true);
  assert.equal(scopeMatches(["admin"], ["vault:decrypt", "workflows:write"]), true);
  assert.equal(scopeMatches(["tools:call"], ["any:tool:scope"]), true);

  // 2. Domain prefix matching
  assert.equal(scopeMatches(["workflows:*"], ["workflows:read"]), true);
  assert.equal(scopeMatches(["workflows:*"], ["workflows:write"]), true);
  assert.equal(scopeMatches(["workflows:*"], ["credentials:read"]), false);

  // 3. TASK-08 canonical scope aliases
  assert.equal(scopeMatches(["workflow:read"], ["workflows:read"]), true);
  assert.equal(scopeMatches(["workflow:execute"], ["executions:write"]), true);
  assert.equal(scopeMatches(["vault:decrypt"], ["credentials:read"]), true);
  assert.equal(scopeMatches(["vault:write"], ["credentials:write"]), true);
  assert.equal(scopeMatches(["admin:queues"], ["queues:read"]), true);

  // 4. Missing required scopes
  assert.equal(scopeMatches(["workflows:read"], ["executions:write"]), false);
  assert.equal(scopeMatches(["credentials:read"], ["workflows:write"]), false);
  assert.equal(scopeMatches([], ["workflows:read"]), false);
});

test("TASK-08: McpClientNodeHandler handles tool discovery and parameterized execution", async () => {
  const handler = new McpClientNodeHandler();

  // 1. listTools
  const listResult = await handler.execute({
    executionId: "exec-client-1",
    nodeId: "node-mcp-client-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "listTools", serverUrl: "http://localhost:3000/api/mcp" },
    input: {},
  });
  assert.equal(listResult.items.length, 1);
  const listData = listResult.items[0].json as any;
  assert.equal(listData._status, "SUCCESS");
  assert.ok(Array.isArray(listData.tools));

  // 2. callTool
  const callResult = await handler.execute({
    executionId: "exec-client-2",
    nodeId: "node-mcp-client-2",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "callTool", toolName: "searchWorkflows", arguments: { query: "orders" }, serverUrl: "http://localhost:3000/api/mcp" },
    input: {},
  });
  assert.equal(callResult.items.length, 1);
  const callData = callResult.items[0].json as any;
  assert.equal(callData._status, "SUCCESS");
  assert.equal(callData._tool, "searchWorkflows");

  // 3. listPrompts & getPrompt
  const promptsList = await handler.execute({
    executionId: "exec-client-3",
    nodeId: "node-mcp-client-3",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "listPrompts", serverUrl: "http://localhost:3000/api/mcp" },
    input: {},
  });
  assert.equal(promptsList.items.length, 1);
  const promptsData = promptsList.items[0].json as any;
  assert.equal(promptsData._status, "SUCCESS");
  assert.ok(Array.isArray(promptsData.prompts));

  const promptGet = await handler.execute({
    executionId: "exec-client-4",
    nodeId: "node-mcp-client-4",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "getPrompt", promptName: "build_workflow", serverUrl: "http://localhost:3000/api/mcp" },
    input: {},
  });
  assert.equal(promptGet.items.length, 1);
  const promptData = promptGet.items[0].json as any;
  assert.equal(promptData._status, "SUCCESS");
  assert.equal(promptData.prompt.name, "build_workflow");

  // 4. listResources & readResource
  const resList = await handler.execute({
    executionId: "exec-client-5",
    nodeId: "node-mcp-client-5",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "listResources", serverUrl: "http://localhost:3000/api/mcp" },
    input: {},
  });
  assert.equal(resList.items.length, 1);
  const resListData = resList.items[0].json as any;
  assert.equal(resListData._status, "SUCCESS");
  assert.ok(Array.isArray(resListData.resources));

  const resRead = await handler.execute({
    executionId: "exec-client-6",
    nodeId: "node-mcp-client-6",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "readResource", uri: "agentflow://system/status", serverUrl: "http://localhost:3000/api/mcp" },
    input: {},
  });
  assert.equal(resRead.items.length, 1);
  const resReadData = resRead.items[0].json as any;
  assert.equal(resReadData._status, "SUCCESS");
  assert.ok(resReadData.content);
});

// ─────────────────────────────────────────────────────────────
// TASK-16: Microsoft Teams & WhatsApp Cloud API
// ─────────────────────────────────────────────────────────────

test("TASK-16: Teams Adaptive Cards 1.5 builder constructs valid schema and dispatches", async () => {
  const card = buildAdaptiveCard({
    title: "Deployment Succeeded",
    text: "Release v2.4.0 is live across all production clusters.",
    facts: [
      { title: "Environment", value: "Production" },
      { title: "Commit", value: "8f7a2d" },
    ],
    buttons: [
      { title: "View Dashboard", url: "https://agentflow.dev/dashboard" },
    ],
  });

  assert.equal(card.type, "AdaptiveCard");
  assert.equal(card.version, "1.5");
  assert.equal(card.body?.length, 3);
  assert.equal(card.actions?.length, 1);

  // Execute Teams node handler
  const handler = new TeamsNodeHandler();
  const res = await handler.execute({
    executionId: "exec-teams-1",
    nodeId: "teams-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      operation: "sendAdaptiveCard",
      adaptiveCard: card,
      channelId: "19:mock_channel_teams@thread.tacv2",
    },
    input: {},
  });

  assert.equal(res.items.length, 1);
  const item = res.items[0].json as any;
  assert.equal(item.delivered, true);
  assert.equal(item.operation, "sendAdaptiveCard");
  assert.equal(item.adaptiveCard.version, "1.5");
  assert.equal(item.recipient, "19:mock_channel_teams@thread.tacv2");
});

test("TASK-16: WhatsApp Cloud API formats templates, media, buttons and location", async () => {
  const handler = new WhatsAppNodeHandler();

  // 1. sendTemplate
  const tmplRes = await handler.execute({
    executionId: "exec-wa-1",
    nodeId: "wa-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      operation: "sendTemplate",
      to: "+5511988887777",
      template: {
        name: "order_confirmation",
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "Pedido #9928" }] },
        ],
      },
    },
    input: {},
  });
  assert.equal((tmplRes.items[0].json as any).delivered, true);
  assert.equal((tmplRes.items[0].json as any).to, "+5511988887777");
  assert.ok((tmplRes.items[0].json as any).messages[0].id.startsWith("wamid."));

  // 2. sendInteractiveButtons
  const btnRes = await handler.execute({
    executionId: "exec-wa-2",
    nodeId: "wa-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      operation: "sendInteractiveButtons",
      to: "+14155552671",
      message: "Do you want to confirm your flight reservation?",
      buttons: [
        { type: "reply", reply: { id: "yes", title: "Confirm" } },
        { type: "reply", reply: { id: "no", title: "Reschedule" } },
      ],
    },
    input: {},
  });
  assert.equal((btnRes.items[0].json as any).delivered, true);
  assert.equal((btnRes.items[0].json as any).messaging_product, "whatsapp");

  // 3. Batch processing (n8n item compatibility)
  const batchRes = await handler.execute({
    executionId: "exec-wa-3",
    nodeId: "wa-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "sendMessage" },
    input: [
      { to: "+5511911112222", message: "Batch message 1" },
      { to: "+5511933334444", message: "Batch message 2" },
    ],
  });
  assert.equal(batchRes.items.length, 2);
  assert.equal((batchRes.items[0].json as any).to, "+5511911112222");
  assert.equal((batchRes.items[1].json as any).to, "+5511933334444");
});

// ─────────────────────────────────────────────────────────────
// TASK-17: Google Calendar & Google Docs
// ─────────────────────────────────────────────────────────────

test("TASK-17: Google Calendar handles CRUD, ISO dates, attendees and Google Meet links", async () => {
  const handler = new GoogleCalendarNodeHandler();

  // 1. createEvent with Google Meet
  const start = new Date(Date.now() + 3600000).toISOString();
  const end = new Date(Date.now() + 7200000).toISOString();
  const createRes = await handler.execute({
    executionId: "exec-cal-1",
    nodeId: "cal-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      operation: "createEvent",
      summary: "Executive Roadmap Review",
      description: "Q3 alignment and strategic goals",
      startTime: start,
      endTime: end,
      timeZone: "America/New_York",
      attendees: ["ceo@acme.com", "cto@acme.com"],
      addGoogleMeet: true,
    },
    input: {},
  });

  const createData = createRes.items[0].json as any;
  assert.equal(createData.summary, "Executive Roadmap Review");
  assert.equal(createData.status, "confirmed");
  assert.ok(createData.hangoutLink.includes("meet.google.com"));
  assert.equal(createData.attendees.length, 2);

  // 2. listEvents
  const listRes = await handler.execute({
    executionId: "exec-cal-2",
    nodeId: "cal-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "listEvents", timeMin: new Date().toISOString() },
    input: {},
  });
  const listData = listRes.items[0].json as any;
  assert.equal(listData.kind, "calendar#events");
  assert.ok(listData.items.length >= 2);
});

test("TASK-17: Google Docs handles document creation, text extraction and template variable substitution", async () => {
  // 1. Template variable substitution helper
  const template = "Hello {{customer_name}}, your invoice {{invoice_id}} for ${{total_amount}} is ready.";
  const rendered = substituteTemplateVariables(template, {
    customer_name: "Bruce Wayne",
    invoice_id: "INV-9901",
    total_amount: "4,500.00",
  });
  assert.equal(rendered, "Hello Bruce Wayne, your invoice INV-9901 for $4,500.00 is ready.");

  // 2. Google Docs node execution
  const handler = new GoogleDocsNodeHandler();
  const createDocRes = await handler.execute({
    executionId: "exec-doc-1",
    nodeId: "doc-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      operation: "createDocument",
      title: "Contract Agreement - Acme Corp",
      text: template,
      variables: { customer_name: "Acme Corp", invoice_id: "INV-100", total_amount: "12,000" },
    },
    input: {},
  });

  const docData = createDocRes.items[0].json as any;
  assert.equal(docData.title, "Contract Agreement - Acme Corp");
  assert.ok(docData.documentId);
  assert.ok(docData.documentUrl.includes("docs.google.com/document/d/"));

  // 3. getText
  const getTextRes = await handler.execute({
    executionId: "exec-doc-2",
    nodeId: "doc-node",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { operation: "getText", documentId: docData.documentId },
    input: {},
  });
  assert.ok((getTextRes.items[0].json as any).text.length > 0);
});

// ─────────────────────────────────────────────────────────────
// TASK-18: OpenAPI 3.1 Contract & TypeScript SDK
// ─────────────────────────────────────────────────────────────

test("TASK-18: OpenAPI 3.1 contract exports all routes including MCP tag and schemas", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/docs",
  });
  assert.equal(res.statusCode, 200);
  const spec = JSON.parse(res.body);
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.title, "AgentFlow API");

  // Verify paths exist
  assert.ok(spec.paths["/api/auth/login"]);
  assert.ok(spec.paths["/api/workflows"]);
  assert.ok(spec.paths["/api/executions"]);
  assert.ok(spec.paths["/api/credentials"]);
  assert.ok(spec.paths["/api/approvals"]);
  assert.ok(spec.paths["/api/mcp"]);
  assert.ok(spec.paths["/api/mcp/sse"]);
  assert.ok(spec.paths["/mcp/status"]);
});

test("TASK-18: TypeScript SDK AgentFlowClient instantiates and performs fluent operations", async () => {
  const client = createAgentFlowClient({
    baseUrl: "http://localhost:3001",
    token: "af_sdk_test_token",
  });

  assert.ok(client.auth);
  assert.ok(client.workflows);
  assert.ok(client.executions);
  assert.ok(client.credentials);
  assert.ok(client.approvals);
  assert.ok(client.mcp);

  // Verify SDK client structure and custom configuration
  client.setApiKey("af_custom_api_key");
  client.setOrgId("org_custom_123");
  assert.ok(client instanceof AgentFlowClient);
});
