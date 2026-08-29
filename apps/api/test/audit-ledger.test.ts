import assert from "node:assert/strict";
import test from "node:test";
import {
  GENESIS_HASH,
  computeAuditHash,
  canonicalJson,
  recordAuditEvent,
  verifyAuditLedgerIntegrity,
  exportSignedAuditReport,
  listAuditLedger,
} from "../src/services/audit-ledger.js";
import { computeWorkflowDiff } from "../src/services/workflow-diff.js";

// Ensure environment for test runner
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";

const { prisma } = await import("../src/lib/prisma.js");
const { resetStore } = await import("../src/lib/store.js");

test("Canonical JSON serialization is deterministic and handles nested keys", () => {
  const objA = { z: 1, a: 2, m: { y: "test", b: 42 } };
  const objB = { a: 2, m: { b: 42, y: "test" }, z: 1 };

  const jsonA = canonicalJson(objA);
  const jsonB = canonicalJson(objB);

  assert.equal(jsonA, jsonB, "Canonical JSON must sort keys identically regardless of insertion order");
  assert.equal(jsonA, '{"a":2,"m":{"b":42,"y":"test"},"z":1}');
});

test("computeAuditHash generates consistent SHA-256 Merkle hashes", () => {
  const hash1 = computeAuditHash({
    previousHash: GENESIS_HASH,
    orgId: "org-test-1",
    userId: "user-1",
    action: "workflow.create",
    resource: "workflow",
    resourceId: "wf-100",
    metadata: { name: "Test Workflow", active: true },
    timestamp: "2026-08-29T12:00:00.000Z",
  });

  const hash2 = computeAuditHash({
    previousHash: GENESIS_HASH,
    orgId: "org-test-1",
    userId: "user-1",
    action: "workflow.create",
    resource: "workflow",
    resourceId: "wf-100",
    metadata: { active: true, name: "Test Workflow" }, // different key order
    timestamp: "2026-08-29T12:00:00.000Z",
  });

  assert.equal(hash1, hash2, "Hash must be identical for logically equal metadata");
  assert.match(hash1, /^[a-f0-9]{64}$/, "Hash must be 64-character SHA-256 hex string");
});

test("Merkle Audit Ledger records linked hash chain from GENESIS_HASH and validates integrity", async () => {
  resetStore();
  const orgId = "org-audit-chain-1";

  // 1. First event (Root block)
  const entry1 = await recordAuditEvent({
    orgId,
    userId: "usr-admin",
    action: "user.login",
    resource: "auth",
    metadata: { ip: "127.0.0.1" },
    timestamp: "2026-08-29T10:00:00.000Z",
  });

  assert.equal(entry1.previousHash, GENESIS_HASH, "Root block previousHash must equal GENESIS_HASH");
  assert.ok(entry1.hash, "Block 1 must have a valid hash");

  // 2. Second event
  const entry2 = await recordAuditEvent({
    orgId,
    userId: "usr-admin",
    action: "workflow.create",
    resource: "workflow",
    resourceId: "wf-1",
    metadata: { title: "Automated Deploy" },
    timestamp: "2026-08-29T10:01:00.000Z",
  });

  assert.equal(entry2.previousHash, entry1.hash, "Block 2 previousHash must link to Block 1 hash");

  // 3. Third event
  const entry3 = await recordAuditEvent({
    orgId,
    userId: "usr-admin",
    action: "workflow.execute",
    resource: "execution",
    resourceId: "exec-1",
    metadata: { status: "SUCCESS" },
    timestamp: "2026-08-29T10:02:00.000Z",
  });

  assert.equal(entry3.previousHash, entry2.hash, "Block 3 previousHash must link to Block 2 hash");

  // 4. Verify integrity of untampered chain
  const integrity = await verifyAuditLedgerIntegrity(orgId);
  assert.equal(integrity.valid, true, "Ledger integrity must be valid");
  assert.equal(integrity.totalEntries, 3, "Total entries must match 3");
  assert.equal(integrity.rootHash, entry1.hash, "Root hash must match Block 1");
  assert.equal(integrity.latestHash, entry3.hash, "Latest hash must match Block 3");

  // 5. Query list
  const list = await listAuditLedger(orgId);
  assert.equal(list.length, 3);
});

test("verifyAuditLedgerIntegrity detects payload tampering in historical blocks", async () => {
  resetStore();
  const orgId = "org-tamper-test";

  const entry1 = await recordAuditEvent({
    orgId,
    userId: "user-1",
    action: "credential.create",
    resource: "credential",
    resourceId: "cred-1",
    metadata: { type: "AWS_KMS" },
  });

  const entry2 = await recordAuditEvent({
    orgId,
    userId: "user-1",
    action: "credential.update",
    resource: "credential",
    resourceId: "cred-1",
    metadata: { type: "AWS_KMS", version: 2 },
  });

  // Verify before tamper
  const initialCheck = await verifyAuditLedgerIntegrity(orgId);
  assert.equal(initialCheck.valid, true);

  // Tamper with entry1 metadata in database
  const rawEntries = await prisma.auditLog.findMany({ where: { orgId } });
  const target = rawEntries.find((e: any) => e.id === entry1.id);
  assert.ok(target);

  // Tamper: alter payload while leaving __hash intact
  const targetMeta = typeof target.metadata === "string" ? JSON.parse(target.metadata) : target.metadata;
  targetMeta.type = "UNAUTHORIZED_MODIFICATION";

  await prisma.auditLog.update({
    where: { id: entry1.id },
    data: { metadata: targetMeta },
  });

  // Check integrity after payload tampering
  const tamperedCheck = await verifyAuditLedgerIntegrity(orgId);
  assert.equal(tamperedCheck.valid, false, "Tampered block must fail validation");
  assert.equal(tamperedCheck.brokenAtIndex, 0, "Tampering must point to block index 0");
  assert.equal(tamperedCheck.brokenEntryId, entry1.id);
  assert.match(tamperedCheck.error || "", /Tamper detected at block 0/);
});

test("verifyAuditLedgerIntegrity detects broken previousHash linkage", async () => {
  resetStore();
  const orgId = "org-broken-linkage";

  await recordAuditEvent({
    orgId,
    userId: "user-1",
    action: "action-1",
  });

  const entry2 = await recordAuditEvent({
    orgId,
    userId: "user-1",
    action: "action-2",
  });

  // Alter entry2's previousHash
  const rawEntries = await prisma.auditLog.findMany({ where: { orgId } });
  const target = rawEntries.find((e: any) => e.id === entry2.id);
  assert.ok(target);

  const targetMeta = typeof target.metadata === "string" ? JSON.parse(target.metadata) : target.metadata;
  targetMeta.__previousHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  await prisma.auditLog.update({
    where: { id: entry2.id },
    data: { metadata: targetMeta },
  });

  const check = await verifyAuditLedgerIntegrity(orgId);
  assert.equal(check.valid, false, "Broken link must fail validation");
  assert.equal(check.brokenAtIndex, 1, "Chain broken must point to block index 1");
  assert.match(check.error || "", /Chain broken at index 1/);
});

test("exportSignedAuditReport generates HMAC-SHA256 signature over Merkle audit ledger snapshot", async () => {
  resetStore();
  const orgId = "org-signed-compliance";

  await recordAuditEvent({
    orgId,
    userId: "auditor",
    action: "compliance.scan.start",
    resource: "compliance",
  });

  await recordAuditEvent({
    orgId,
    userId: "auditor",
    action: "compliance.scan.complete",
    resource: "compliance",
    metadata: { score: 100, pass: true },
  });

  const report = await exportSignedAuditReport(orgId);

  assert.equal(report.orgId, orgId);
  assert.equal(report.totalEntries, 2);
  assert.equal(report.integrity, true);
  assert.ok(report.signature, "HMAC-SHA256 signature must be present");
  assert.match(report.signature, /^[a-f0-9]{64}$/, "Signature must be 64-char hex");
  assert.equal(report.entries.length, 2);
});

test("Workflow Visual Diff Helpers (TASK-15) accurately detect node & edge modifications, additions, and deletions", () => {
  const v1 = {
    nodes: [
      { id: "node-1", type: "webhook", label: "Start", config: { path: "/webhook" }, position: { x: 0, y: 0 } },
      { id: "node-2", type: "http", label: "Send Request", config: { url: "https://api.old.com" }, position: { x: 100, y: 100 } },
      { id: "node-3", type: "transform", label: "To Be Deleted", config: {}, position: { x: 200, y: 200 } },
    ],
    edges: [
      { id: "edge-1", source: "node-1", target: "node-2", sourceHandle: "out", targetHandle: "in" },
      { id: "edge-2", source: "node-2", target: "node-3", sourceHandle: "out", targetHandle: "in" },
    ],
  };

  const v2 = {
    nodes: [
      { id: "node-1", type: "webhook", label: "Start Trigger", config: { path: "/webhook/v2" }, position: { x: 0, y: 0 } }, // modified label + config
      { id: "node-2", type: "http", label: "Send Request", config: { url: "https://api.old.com" }, position: { x: 150, y: 100 } }, // modified position
      { id: "node-4", type: "ai-llm", label: "AI Analysis", config: { model: "claude-sonnet-4-6" }, position: { x: 300, y: 300 } }, // added
      // node-3 removed
    ],
    edges: [
      { id: "edge-1", source: "node-1", target: "node-2", sourceHandle: "out-2", targetHandle: "in" }, // modified sourceHandle
      { id: "edge-3", source: "node-2", target: "node-4", sourceHandle: "out", targetHandle: "in" }, // added
      // edge-2 removed
    ],
  };

  const diff = computeWorkflowDiff(v1, v2);

  assert.equal(diff.nodesAdded.length, 1);
  assert.equal(diff.nodesAdded[0].id, "node-4");

  assert.equal(diff.nodesRemoved.length, 1);
  assert.equal(diff.nodesRemoved[0].id, "node-3");

  assert.equal(diff.nodesModified.length, 2);
  const modNode1 = diff.nodesModified.find((m) => m.nodeId === "node-1");
  assert.ok(modNode1);
  assert.ok(modNode1.changes.some((c) => c.field === "label" && c.newValue === "Start Trigger"));
  assert.ok(modNode1.changes.some((c) => c.field === "config"));

  assert.equal(diff.edgesAdded.length, 1);
  assert.equal(diff.edgesAdded[0].id, "edge-3");

  assert.equal(diff.edgesRemoved.length, 1);
  assert.equal(diff.edgesRemoved[0].id, "edge-2");

  assert.equal(diff.edgesModified.length, 1);
  assert.equal(diff.edgesModified[0].edgeId, "edge-1");

  assert.equal(diff.summary.hasBreakingChanges, true, "Node removal must mark breaking change");
});
