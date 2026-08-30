import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

// Ensure in-memory database test mode
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

const [{ buildApp }, { resetStore }, { prisma }, { verifyAuditLedgerIntegrity, GENESIS_HASH }] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/services/audit-ledger.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(async () => {
  await resetStore();
});

test("MCP Security - Rejects unauthenticated requests and invalid API key tokens", async () => {
  // 1. Missing Authorization header and x-api-key
  const resNoAuth = await app.inject({
    method: "POST",
    url: "/mcp/http",
    payload: { jsonrpc: "2.0", id: 1, method: "ping" },
  });
  assert.equal(resNoAuth.statusCode, 401);
  const bodyNoAuth = JSON.parse(resNoAuth.body);
  assert.equal(bodyNoAuth.code, "AUTH_FAILED");

  // 2. Invalid non-existent token format
  const resInvalid = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: "Bearer invalid_non_af_token" },
    payload: { jsonrpc: "2.0", id: 2, method: "ping" },
  });
  assert.equal(resInvalid.statusCode, 401);
  const bodyInvalid = JSON.parse(resInvalid.body);
  assert.equal(bodyInvalid.code, "AUTH_FAILED");
});

test("MCP Security - Authenticates cryptographic SHA-256 API key and checks expiration", async () => {
  const org = await prisma.organization.create({ data: { name: "Security Org" } });
  const user = await prisma.user.create({
    data: { email: "mcp-user@example.com", name: "MCP User", password: "hashed_password" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "ADMIN" },
  });

  const rawKey = "af_secure_token_1234567890abcdef";
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  // Create valid API key in DB
  const validKey = await prisma.apiKey.create({
    data: {
      name: "MCP Production Key",
      key: keyHash,
      userId: user.id,
      orgId: org.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours future
    },
  });

  // Call MCP endpoint with the raw token
  const resValid = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${rawKey}` },
    payload: { jsonrpc: "2.0", id: "init-sec-1", method: "initialize", params: {} },
  });
  assert.equal(resValid.statusCode, 200);
  const bodyValid = JSON.parse(resValid.body);
  assert.equal(bodyValid.result.serverInfo.name, "AgentFlow MCP Server");

  // Verify lastUsed was updated
  const updatedKey = await prisma.apiKey.findUnique({ where: { id: validKey.id } });
  assert.ok(updatedKey?.lastUsed);

  // Expire key and verify rejection
  await prisma.apiKey.update({
    where: { id: validKey.id },
    data: { expiresAt: new Date(Date.now() - 1000 * 60) }, // 1 minute past
  });

  const resExpired = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${rawKey}` },
    payload: { jsonrpc: "2.0", id: "init-sec-2", method: "initialize", params: {} },
  });
  assert.equal(resExpired.statusCode, 401);
  const bodyExpired = JSON.parse(resExpired.body);
  assert.equal(bodyExpired.code, "AUTH_FAILED");
  assert.equal(bodyExpired.error, "API key has expired");
});

test("MCP Security - Server-side RBAC scope derivation rejects client header spoofing", async () => {
  const org = await prisma.organization.create({ data: { name: "RBAC Org" } });
  const viewerUser = await prisma.user.create({
    data: { email: "viewer@example.com", name: "Viewer User", password: "hashed_password" },
  });
  await prisma.organizationMember.create({
    data: { userId: viewerUser.id, orgId: org.id, role: "VIEWER" },
  });

  const rawKey = "af_viewer_key_9876543210fedcba";
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  await prisma.apiKey.create({
    data: {
      name: "Viewer Key",
      key: keyHash,
      userId: viewerUser.id,
      orgId: org.id,
    },
  });

  // Client attempts to spoof ADMIN / execute scopes via header
  const resSpoof = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: {
      authorization: `Bearer ${rawKey}`,
      "x-mcp-scopes": "*", // Spoofed header
    },
    payload: {
      jsonrpc: "2.0",
      id: "call-write-1",
      method: "tools/call",
      params: {
        name: "create_workflow",
        arguments: { name: "Unauthorized Workflow" },
      },
    },
  });

  assert.equal(resSpoof.statusCode, 200);
  const bodySpoof = JSON.parse(resSpoof.body);
  // Should fail because VIEWER has only ["workflows:read", "executions:read", "tools:list"] and create_workflow requires workflows:write
  assert.ok(bodySpoof.result.isError);
  assert.match(bodySpoof.result.content[0].text, /Insufficient scope/);
});

test("MCP Security - Multi-Tenant isolation & boundary confinement", async () => {
  const orgA = await prisma.organization.create({ data: { name: "Tenant Alpha" } });
  const userA = await prisma.user.create({
    data: { email: "alpha@example.com", name: "User Alpha", password: "hashed_password" },
  });
  await prisma.organizationMember.create({
    data: { userId: userA.id, orgId: orgA.id, role: "OWNER" },
  });
  const keyA = "af_tenant_a_key_1111111111111111";
  await prisma.apiKey.create({
    data: { name: "Key A", key: createHash("sha256").update(keyA).digest("hex"), userId: userA.id, orgId: orgA.id },
  });

  const orgB = await prisma.organization.create({ data: { name: "Tenant Beta" } });
  const userB = await prisma.user.create({
    data: { email: "beta@example.com", name: "User Beta", password: "hashed_password" },
  });
  await prisma.organizationMember.create({
    data: { userId: userB.id, orgId: orgB.id, role: "OWNER" },
  });
  const keyB = "af_tenant_b_key_2222222222222222";
  await prisma.apiKey.create({
    data: { name: "Key B", key: createHash("sha256").update(keyB).digest("hex"), userId: userB.id, orgId: orgB.id },
  });

  // Create workflow in Org A
  const wfA = await prisma.workflow.create({
    data: {
      name: "Alpha Secret Workflow",
      orgId: orgA.id,
      status: "ACTIVE",
      nodes: [{ id: "n1", type: "trigger", config: {} }],
    },
  });

  // Create workflow in Org B
  const wfB = await prisma.workflow.create({
    data: {
      name: "Beta Secret Workflow",
      orgId: orgB.id,
      status: "ACTIVE",
      nodes: [{ id: "n2", type: "trigger", config: {} }],
    },
  });

  // Tenant B searches workflows -> Must only see Beta Secret Workflow, never Alpha
  const resSearchB = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${keyB}` },
    payload: {
      jsonrpc: "2.0",
      id: "search-b",
      method: "tools/call",
      params: { name: "search_workflows", arguments: {} },
    },
  });
  const searchBBody = JSON.parse(resSearchB.body);
  const searchBData = JSON.parse(searchBBody.result.content[0].text);
  assert.equal(searchBData.total, 1);
  assert.equal(searchBData.workflows[0].id, wfB.id);

  // Tenant B attempts to fetch details of Org A workflow by direct ID -> Must be rejected with not found
  const resDetailsCross = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${keyB}` },
    payload: {
      jsonrpc: "2.0",
      id: "get-cross-tenant",
      method: "tools/call",
      params: { name: "get_workflow_details", arguments: { workflowId: wfA.id } },
    },
  });
  const detailsCrossBody = JSON.parse(resDetailsCross.body);
  assert.ok(detailsCrossBody.result.isError);
  assert.match(detailsCrossBody.result.content[0].text, /Workflow not found/);

  // Tenant B attempts to execute Org A workflow -> Must be rejected with not found
  const resExecCross = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${keyB}` },
    payload: {
      jsonrpc: "2.0",
      id: "exec-cross-tenant",
      method: "tools/call",
      params: { name: "execute_workflow", arguments: { workflowId: wfA.id } },
    },
  });
  const execCrossBody = JSON.parse(resExecCross.body);
  assert.ok(execCrossBody.result.isError);
  assert.match(execCrossBody.result.content[0].text, /Workflow not found/);
});

test("MCP Security - Records Merkle hash chained AuditLog and preserves cryptographic integrity", async () => {
  const org = await prisma.organization.create({ data: { name: "Audit Merkle Org" } });
  const user = await prisma.user.create({
    data: { email: "audit@example.com", name: "Audit User", password: "hashed_password" },
  });
  await prisma.organizationMember.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });

  const rawKey = "af_audit_key_3333333333333333";
  await prisma.apiKey.create({
    data: {
      name: "Audit Key",
      key: createHash("sha256").update(rawKey).digest("hex"),
      userId: user.id,
      orgId: org.id,
    },
  });

  // 1. Initialize MCP session (triggers mcp.session.open)
  const resInit = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${rawKey}` },
    payload: { jsonrpc: "2.0", id: "init-audit", method: "initialize", params: { client: "claude-desktop" } },
  });
  assert.equal(resInit.statusCode, 200);

  // 2. Call MCP tool (triggers mcp.tool.call)
  const resCall = await app.inject({
    method: "POST",
    url: "/mcp/http",
    headers: { authorization: `Bearer ${rawKey}` },
    payload: {
      jsonrpc: "2.0",
      id: "tool-audit",
      method: "tools/call",
      params: {
        name: "crypto_hash",
        arguments: { data: "test-payload", algorithm: "sha256" },
      },
    },
  });
  assert.equal(resCall.statusCode, 200);

  // 3. Verify audit log entries were created with Merkle hash chain
  const auditLogs = await prisma.auditLog.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "asc" },
  });

  assert.ok(auditLogs.length >= 2);
  const sessionLog = auditLogs.find((l: any) => l.action === "mcp.session.open");
  const toolLog = auditLogs.find((l: any) => l.action === "mcp.tool.call");

  assert.ok(sessionLog);
  assert.ok(toolLog);

  // 4. Verify end-to-end cryptographic Merkle chain integrity
  const integrity = await verifyAuditLedgerIntegrity(org.id);
  assert.equal(integrity.valid, true);
  assert.equal(integrity.totalEntries, auditLogs.length);
  assert.ok(integrity.latestHash);
  assert.notEqual(integrity.latestHash, GENESIS_HASH);
});
