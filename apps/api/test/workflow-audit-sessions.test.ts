import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore, workflowAuditLogs, browserSessions },
  {
    GENESIS_HASH,
    computeWorkflowAuditHash,
    recordWorkflowAuditEvent,
    verifyWorkflowAuditIntegrity,
    getExecutionAuditTrail,
  },
  { buildApp },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/audit-ledger.js"),
  import("../src/server.js"),
]);

test.beforeEach(() => {
  resetStore();
});

test("recordWorkflowAuditEvent establishes cryptographic SHA-256 hash chain anchored to GENESIS_HASH", async () => {
  const executionId = "exec-hash-chain-1";

  // 1. First event (execution.start)
  const entry1 = await recordWorkflowAuditEvent({
    executionId,
    actor: "user-123",
    action: "execution.start",
    decision: "STARTED",
    payload: { workflowId: "wf-1", trigger: "manual" },
  });

  assert.equal(entry1.prevHash, GENESIS_HASH, "Root block prevHash must equal GENESIS_HASH");
  const expectedHash1 = computeWorkflowAuditHash(GENESIS_HASH, { workflowId: "wf-1", trigger: "manual" });
  assert.equal(entry1.hash, expectedHash1, "Block 1 hash must match SHA-256 of prevHash + canonical payload");

  // 2. Second event (node.decision)
  const entry2 = await recordWorkflowAuditEvent({
    executionId,
    nodeId: "node-filter-1",
    actor: "system",
    action: "node.decision",
    decision: "APPROVED",
    payload: { nodeType: "condition", score: 98 },
  });

  assert.equal(entry2.prevHash, entry1.hash, "Block 2 prevHash must link to Block 1 hash");
  const expectedHash2 = computeWorkflowAuditHash(entry1.hash, { nodeType: "condition", score: 98 });
  assert.equal(entry2.hash, expectedHash2, "Block 2 hash must match SHA-256 of block1.hash + payload");

  // 3. Third event (execution.finish)
  const entry3 = await recordWorkflowAuditEvent({
    executionId,
    actor: "system",
    action: "execution.finish",
    decision: "SUCCESS",
    payload: { durationMs: 342, resultCount: 5 },
  });

  assert.equal(entry3.prevHash, entry2.hash, "Block 3 prevHash must link to Block 2 hash");
  const expectedHash3 = computeWorkflowAuditHash(entry2.hash, { durationMs: 342, resultCount: 5 });
  assert.equal(entry3.hash, expectedHash3, "Block 3 hash must match SHA-256 of block2.hash + payload");

  // 4. Verify full chain integrity
  const integrity = await verifyWorkflowAuditIntegrity(executionId);
  assert.equal(integrity.valid, true, "Untampered chain must pass verification");
  assert.equal(integrity.totalEntries, 3, "Total entries must be 3");
  assert.equal(integrity.rootHash, entry1.hash, "Root hash must match Block 1");
  assert.equal(integrity.latestHash, entry3.hash, "Latest hash must match Block 3");
});

test("verifyWorkflowAuditIntegrity detects payload tampering in historical blocks", async () => {
  const executionId = "exec-tamper-test";

  const entry1 = await recordWorkflowAuditEvent({
    executionId,
    actor: "user-1",
    action: "node.decision",
    decision: "ALLOW",
    payload: { role: "admin", granted: true },
  });

  await recordWorkflowAuditEvent({
    executionId,
    actor: "user-1",
    action: "execution.finish",
    decision: "SUCCESS",
    payload: { completed: true },
  });

  // Verify untampered state
  const beforeTamper = await verifyWorkflowAuditIntegrity(executionId);
  assert.equal(beforeTamper.valid, true);

  // Directly tamper entry1 payload in storage
  const storedEntry1 = workflowAuditLogs.get(entry1.id);
  assert.ok(storedEntry1);
  storedEntry1.payload = { role: "admin", granted: false }; // Unauthorized modification

  // Check integrity
  const tamperedCheck = await verifyWorkflowAuditIntegrity(executionId);
  assert.equal(tamperedCheck.valid, false, "Tampered payload must fail validation");
  assert.equal(tamperedCheck.brokenAtIndex, 0, "Tamper detected at block index 0");
  assert.equal(tamperedCheck.brokenEntryId, entry1.id);
  assert.match(tamperedCheck.error || "", /Tamper detected at block 0/);
});

test("verifyWorkflowAuditIntegrity detects broken prevHash linkage", async () => {
  const executionId = "exec-broken-linkage";

  await recordWorkflowAuditEvent({
    executionId,
    actor: "user-1",
    action: "execution.start",
    payload: { step: 1 },
  });

  const entry2 = await recordWorkflowAuditEvent({
    executionId,
    actor: "user-1",
    action: "execution.finish",
    payload: { step: 2 },
  });

  // Tamper with entry2's prevHash
  const storedEntry2 = workflowAuditLogs.get(entry2.id);
  assert.ok(storedEntry2);
  storedEntry2.prevHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  const check = await verifyWorkflowAuditIntegrity(executionId);
  assert.equal(check.valid, false, "Broken link must fail validation");
  assert.equal(check.brokenAtIndex, 1, "Link break detected at block index 1");
  assert.match(check.error || "", /Chain broken at index 1/);
});

test("WorkflowAuditLog enforces append-only immutability: updates and deletes are rejected", async () => {
  const executionId = "exec-append-only";

  const entry = await recordWorkflowAuditEvent({
    executionId,
    actor: "user-audit",
    action: "execution.start",
    payload: { immutabilityTest: true },
  });

  // Attempt update
  await assert.rejects(
    async () => {
      await prisma.workflowAuditLog.update({
        where: { id: entry.id },
        data: { actor: "malicious-actor" } as any,
      });
    },
    { message: "WorkflowAuditLog is append-only: updates are prohibited" }
  );

  // Attempt updateMany
  await assert.rejects(
    async () => {
      await prisma.workflowAuditLog.updateMany({
        where: { executionId },
        data: { actor: "malicious-actor" } as any,
      });
    },
    { message: "WorkflowAuditLog is append-only: updates are prohibited" }
  );

  // Attempt delete
  await assert.rejects(
    async () => {
      await prisma.workflowAuditLog.delete({
        where: { id: entry.id },
      });
    },
    { message: "WorkflowAuditLog is append-only: deletes are prohibited" }
  );

  // Attempt deleteMany
  await assert.rejects(
    async () => {
      await prisma.workflowAuditLog.deleteMany({
        where: { executionId },
      });
    },
    { message: "WorkflowAuditLog is append-only: deletes are prohibited" }
  );
});

test("GET /api/executions/:id/audit returns verifiable audit trail with sensitive credentials masked", async () => {
  const app = await buildApp({ logger: false });

  const org = await prisma.organization.create({
    data: { name: "Audit Org", slug: `audit-org-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `audit-user-${Date.now()}@test.local`, passwordHash: "hash", name: "Audit User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Audit Test Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: [{ id: "n1", type: "webhook" }] },
      edges: { create: [] },
    },
  });

  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      userId: user.id,
      orgId: org.id,
      status: "SUCCESS",
      trigger: "manual",
    },
  });

  // Record audit events with sensitive keys (token, password, apiKey, privateKey)
  await recordWorkflowAuditEvent({
    executionId: execution.id,
    actor: user.id,
    action: "execution.start",
    decision: "STARTED",
    payload: {
      workflowId: workflow.id,
      password: "supersecretpassword",
      apiKey: "sk-live-1234567890abcdef",
      nested: {
        token: "bearer-token-1234",
        authorization: "Bearer secret-auth",
        safeParam: "allowed-value",
      },
    },
  });

  await recordWorkflowAuditEvent({
    executionId: execution.id,
    nodeId: "n1",
    actor: "system",
    action: "node.decision",
    decision: "SUCCESS",
    payload: {
      clientSecret: "very-secret-client-val",
      output: { ok: true, count: 42 },
    },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // Query audit endpoint
  const response = await app.inject({
    method: "GET",
    url: `/api/executions/${execution.id}/audit`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);

  assert.equal(body.executionId, execution.id);
  assert.equal(body.integrity.valid, true);
  assert.equal(body.totalEntries, 2);
  assert.equal(body.entries.length, 2);

  // Check masking in payload
  const entry1 = body.entries[0];
  assert.equal(entry1.payload.password, "***");
  assert.equal(entry1.payload.apiKey, "***");
  assert.equal(entry1.payload.nested.token, "***");
  assert.equal(entry1.payload.nested.authorization, "***");
  assert.equal(entry1.payload.nested.safeParam, "allowed-value");

  const entry2 = body.entries[1];
  assert.equal(entry2.payload.clientSecret, "***");
  assert.equal(entry2.payload.output.ok, true);
  assert.equal(entry2.payload.output.count, 42);

  // Cross-org check: unauthorized org cannot read audit trail
  const otherOrg = await prisma.organization.create({
    data: { name: "Other Org", slug: `other-org-${Date.now()}` },
  });
  const otherUser = await prisma.user.create({
    data: { email: `other-${Date.now()}@test.local`, passwordHash: "hash" },
  });
  await prisma.organizationMember.create({
    data: { orgId: otherOrg.id, userId: otherUser.id, role: "OWNER" },
  });
  const otherToken = (app as any).jwt.sign({ sub: otherUser.id, orgId: otherOrg.id });

  const forbiddenResponse = await app.inject({
    method: "GET",
    url: `/api/executions/${execution.id}/audit`,
    headers: {
      authorization: `Bearer ${otherToken}`,
    },
  });
  assert.equal(forbiddenResponse.statusCode, 404);
});

test("BrowserSession API: KMS AES-256-GCM envelope encryption roundtrip with zero plaintext at rest", async () => {
  const app = await buildApp({ logger: false });

  const org = await prisma.organization.create({
    data: { name: "Session Org", slug: `sess-org-${Date.now()}` },
  });
  const user = await prisma.user.create({
    data: { email: `sess-user-${Date.now()}@test.local`, passwordHash: "hash", name: "Session User" },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  const originalStorageState = {
    cookies: [
      {
        name: "agentflow_session",
        value: "secret_cookie_token_999",
        domain: "app.agentflow.ai",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
      },
    ],
    origins: [
      {
        origin: "https://app.agentflow.ai",
        localStorage: [
          { name: "supabase_auth_token", value: "secret_jwt_payload_xyz123" },
          { name: "theme", value: "dark" },
        ],
      },
    ],
  };

  // 1. Create session with encrypted state
  const createRes = await app.inject({
    method: "POST",
    url: "/api/sessions",
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      name: "Production Bot Session",
      workflowId: "wf-bot-1",
      executionId: "exec-bot-1",
      storageState: originalStorageState,
    },
  });

  assert.equal(createRes.statusCode, 201);
  const created = JSON.parse(createRes.body);
  assert.ok(created.id);
  assert.equal(created.name, "Production Bot Session");
  assert.equal(created.orgId, org.id);
  assert.equal(created.keyVersion, 1);
  // Metadata response must NOT expose storageState or encryptedState
  assert.equal(created.storageState, undefined);
  assert.equal(created.encryptedState, undefined);

  // 2. Verify encrypted data at rest in database
  const stored = browserSessions.get(created.id);
  assert.ok(stored, "Session must exist in storage");
  assert.ok(stored.encryptedState, "Must have encryptedState");

  // Validate KMS envelope format
  const envelope = JSON.parse(stored.encryptedState);
  assert.ok(envelope.ciphertext, "Envelope must have ciphertext");
  assert.ok(envelope.iv, "Envelope must have IV");
  assert.ok(envelope.tag, "Envelope must have GCM tag");
  assert.ok(envelope.wrappedKey, "Envelope must have wrapped KMS key");
  assert.ok(envelope.wrappedKey.ciphertext, "Wrapped key must have ciphertext");
  assert.equal(envelope.keyVersion, 1);

  // CRITICAL: Zero plaintext at rest
  assert.equal(stored.encryptedState.includes("secret_cookie_token_999"), false, "Plaintext cookie must not exist in storage");
  assert.equal(stored.encryptedState.includes("secret_jwt_payload_xyz123"), false, "Plaintext JWT must not exist in storage");

  // 3. List sessions (metadata only)
  const listRes = await app.inject({
    method: "GET",
    url: "/api/sessions",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(listRes.statusCode, 200);
  const list = JSON.parse(listRes.body);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
  assert.equal(list[0].storageState, undefined);
  assert.equal(list[0].encryptedState, undefined);

  // 4. Get session metadata by ID
  const getRes = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.id}`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(getRes.statusCode, 200);
  const sessionMeta = JSON.parse(getRes.body);
  assert.equal(sessionMeta.id, created.id);
  assert.equal(sessionMeta.storageState, undefined);

  // 5. Decrypt and retrieve state (roundtrip)
  const getStateRes = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.id}/state`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(getStateRes.statusCode, 200);
  const stateBody = JSON.parse(getStateRes.body);
  assert.equal(stateBody.id, created.id);
  assert.deepEqual(stateBody.storageState, originalStorageState, "Decrypted state must match original exactly");

  // 6. Update session state
  const updatedStorageState = {
    ...originalStorageState,
    origins: [
      {
        origin: "https://app.agentflow.ai",
        localStorage: [{ name: "session_counter", value: "100" }],
      },
    ],
  };

  const updateRes = await app.inject({
    method: "POST",
    url: `/api/sessions/${created.id}/state`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      storageState: updatedStorageState,
    },
  });
  assert.equal(updateRes.statusCode, 200);

  // Verify updated state decrypts properly
  const getUpdatedRes = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.id}/state`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(getUpdatedRes.statusCode, 200);
  const updatedBody = JSON.parse(getUpdatedRes.body);
  assert.deepEqual(updatedBody.storageState, updatedStorageState);

  // 7. Expiration handling: past date returns 410 GONE
  const pastDate = new Date(Date.now() - 60000).toISOString();
  await app.inject({
    method: "POST",
    url: `/api/sessions/${created.id}/state`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      storageState: updatedStorageState,
      expiresAt: pastDate,
    },
  });

  const expiredRes = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.id}/state`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(expiredRes.statusCode, 410);
  const expiredBody = JSON.parse(expiredRes.body);
  assert.equal(expiredBody.code, "SESSION_EXPIRED");

  // 8. Delete session
  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/api/sessions/${created.id}`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(deleteRes.statusCode, 200);

  // Verify deletion
  const getDeletedRes = await app.inject({
    method: "GET",
    url: `/api/sessions/${created.id}`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(getDeletedRes.statusCode, 404);
});
