import assert from "node:assert/strict";
import test from "node:test";
import {
  NodeItemSchema,
  NodeItemsSchema,
  type NodeItem,
  type BinaryPayloadMeta,
} from "@agentflow/shared";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [{ prisma }, { resetStore }, { createWorkflowExecution, runExecution }] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/services/executor.js"),
]);

test.beforeEach(() => resetStore());

async function createFixtureWorkflow(data: {
  nodes: Array<{ id: string; type: string; label?: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; sourceHandle?: string; label?: string }>;
}) {
  const org = await prisma.organization.create({
    data: { name: "Items Contract Org", slug: `items-org-${Date.now()}-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: { email: `items-${Date.now()}-${Math.random()}@test.local`, passwordHash: "hash", name: "Items Test User" },
  });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  return prisma.workflow.create({
    data: {
      name: "Node Items Contract Fixture",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: data.nodes.map((node) => ({ ...node, config: node.config ?? {} })) },
      edges: { create: data.edges },
    },
  });
}

test("WF-ENG-03 (1): Normalizes and wraps flat node outputs into canonical NodeItem[] in executor", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "step1", type: "set_fields", config: { service: "auth-svc", status: "active", count: 42 } },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "step1" },
    ],
  });

  const execution = await createWorkflowExecution(
    workflow.id,
    { requestId: "req-123" },
    { trigger: "webhook" }
  );

  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  const nodeExecutions = await prisma.nodeExecution.findMany({
    where: { executionId: execution.id },
  });
  const step1Execution = nodeExecutions.find((ne: any) => ne.nodeId === "step1");
  assert.ok(step1Execution);

  // The output stored in the database must be an enveloped NodeItem[]
  const output = step1Execution.output as NodeItem[];
  assert.ok(Array.isArray(output), "Output must be an array");
  assert.equal(output.length, 1);

  // Validate that it conforms strictly to NodeItemsSchema
  const parseResult = NodeItemsSchema.safeParse(output);
  assert.equal(parseResult.success, true, "Output must strictly conform to NodeItemsSchema");

  assert.equal(output[0].json.service, "auth-svc");
  assert.equal(output[0].json.count, 42);
  assert.equal(output[0].json.requestId, "req-123");
  assert.deepEqual(output[0].pairedItem, { item: 0 });
});

test("WF-ENG-03 (2): Rejects malformed node outputs violating NodeItemsSchema with typed validation error", async () => {
  // We configure a code node that produces a malformed binary payload (invalid checksumSha256)
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      {
        id: "code_bad_binary",
        type: "code",
        config: {
          parameters: {
            mode: "runOnceForAllItems",
            jsCode: `
              return [{
                json: { id: "doc-1" },
                binary: {
                  file: {
                    mimeType: "application/pdf",
                    fileName: "test.pdf",
                    fileSize: 1024,
                    storageKey: "storage-key-1",
                    checksumSha256: "not-a-valid-64-hex-sha256" // invalid!
                  }
                }
              }];
            `,
          },
        },
      },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "code_bad_binary" },
    ],
  });

  const execution = await createWorkflowExecution(
    workflow.id,
    { init: true },
    { trigger: "webhook" }
  );

  const result = await runExecution(execution.id);
  assert.equal(result.status, "FAILED");
  assert.ok(result.error?.includes("Node output contract validation failed for node"));
  assert.ok(result.error?.includes("64-character hex SHA-256 digest"));
});

test("WF-ENG-03 (3): Preserves data provenance and lineage tracking via PairedItemRef across node executions", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      {
        id: "code_paired",
        type: "code",
        config: {
          parameters: {
            mode: "runOnceForAllItems",
            jsCode: `
              return [
                {
                  json: { itemCode: "ITEM-A" },
                  pairedItem: { item: 0, subIndex: 1, sourceNodeId: "trigger_1" }
                },
                {
                  json: { itemCode: "ITEM-B" },
                  pairedItem: { item: 1, subIndex: 2, sourceNodeId: "trigger_1" }
                }
              ];
            `,
          },
        },
      },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "code_paired" },
    ],
  });

  const execution = await createWorkflowExecution(
    workflow.id,
    { source: "batch" },
    { trigger: "webhook" }
  );

  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  const nodeExecutions = await prisma.nodeExecution.findMany({
    where: { executionId: execution.id, nodeId: "code_paired" },
  });
  const output = nodeExecutions[0].output as NodeItem[];
  assert.equal(output.length, 2);

  assert.deepEqual(output[0].pairedItem, { item: 0, subIndex: 1, sourceNodeId: "trigger_1" });
  assert.deepEqual(output[1].pairedItem, { item: 1, subIndex: 2, sourceNodeId: "trigger_1" });

  const validation = NodeItemsSchema.safeParse(output);
  assert.equal(validation.success, true);
});

test("WF-ENG-03 (4): Condition edge routing unpacks NodeItem[] output without truthy array collapse", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "condition_node", type: "condition", config: { field: "isApproved", operator: "equals", value: true } },
      { id: "approved_branch", type: "set_fields", config: { outcome: "APPROVED" } },
      { id: "rejected_branch", type: "set_fields", config: { outcome: "REJECTED" } },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "condition_node" },
      { id: "e2", sourceNodeId: "condition_node", targetNodeId: "approved_branch", sourceHandle: "true" },
      { id: "e3", sourceNodeId: "condition_node", targetNodeId: "rejected_branch", sourceHandle: "false" },
    ],
  });

  // Test Case 4A: When condition evaluates to false, must take false branch (rejected_branch)
  // Even though condition output is wrapped in NodeItem[] ([{ json: { value: false } }]),
  // it must NOT evaluate as truthy due to being a non-empty array!
  const falseExecution = await createWorkflowExecution(
    workflow.id,
    { isApproved: false },
    { trigger: "webhook" }
  );
  const falseResult = await runExecution(falseExecution.id);
  assert.equal(falseResult.status, "SUCCESS");

  const falseNodeExecs = await prisma.nodeExecution.findMany({
    where: { executionId: falseExecution.id },
  });
  assert.equal(falseNodeExecs.find((ne: any) => ne.nodeId === "approved_branch")?.status, "CANCELLED");
  assert.equal(falseNodeExecs.find((ne: any) => ne.nodeId === "rejected_branch")?.status, "SUCCESS");

  // Test Case 4B: When condition evaluates to true, must take true branch (approved_branch)
  const trueExecution = await createWorkflowExecution(
    workflow.id,
    { isApproved: true },
    { trigger: "webhook" }
  );
  const trueResult = await runExecution(trueExecution.id);
  assert.equal(trueResult.status, "SUCCESS");

  const trueNodeExecs = await prisma.nodeExecution.findMany({
    where: { executionId: trueExecution.id },
  });
  assert.equal(trueNodeExecs.find((ne: any) => ne.nodeId === "approved_branch")?.status, "SUCCESS");
  assert.equal(trueNodeExecs.find((ne: any) => ne.nodeId === "rejected_branch")?.status, "CANCELLED");
});

test("WF-ENG-03 (5): set_fields correctly merges fields into item.json on multi-item arrays without array index pollution", async () => {
  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      {
        id: "produce_multi",
        type: "code",
        config: {
          parameters: {
            mode: "runOnceForAllItems",
            jsCode: `
              return [
                { json: { sku: "SKU-1", price: 100 } },
                { json: { sku: "SKU-2", price: 200 } }
              ];
            `,
          },
        },
      },
      {
        id: "enrich_items",
        type: "set_fields",
        config: {
          currency: "USD",
          taxRate: 0.1,
        },
      },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "produce_multi" },
      { id: "e2", sourceNodeId: "produce_multi", targetNodeId: "enrich_items" },
    ],
  });

  const execution = await createWorkflowExecution(
    workflow.id,
    { batchId: "b-999" },
    { trigger: "webhook" }
  );

  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  const nodeExecutions = await prisma.nodeExecution.findMany({
    where: { executionId: execution.id, nodeId: "enrich_items" },
  });
  const output = nodeExecutions[0].output as NodeItem[];
  assert.equal(output.length, 2);

  // Verify item 0
  assert.equal(output[0].json.sku, "SKU-1");
  assert.equal(output[0].json.price, 100);
  assert.equal(output[0].json.currency, "USD");
  assert.equal(output[0].json.taxRate, 0.1);

  // Verify item 1
  assert.equal(output[1].json.sku, "SKU-2");
  assert.equal(output[1].json.price, 200);
  assert.equal(output[1].json.currency, "USD");
  assert.equal(output[1].json.taxRate, 0.1);

  // Verify NO array indices are polluted into json object keys
  assert.equal("0" in output[0].json, false);
  assert.equal("1" in output[0].json, false);
  assert.equal("0" in output[1].json, false);
  assert.equal("1" in output[1].json, false);

  const parsed = NodeItemsSchema.safeParse(output);
  assert.equal(parsed.success, true);
});
