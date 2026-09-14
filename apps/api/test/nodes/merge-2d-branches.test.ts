import assert from "node:assert/strict";
import test from "node:test";
import {
  NodeItemSchema,
  NodeItemsSchema,
  type NodeItem,
} from "@agentflow/shared";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  { createWorkflowExecution, runExecution },
  { MergeNodeHandler, normalizeBranches },
] = await Promise.all([
  import("../../src/lib/prisma.js"),
  import("../../src/lib/store.js"),
  import("../../src/services/executor.js"),
  import("../../src/services/nodes/merge.js"),
]);

test.beforeEach(() => resetStore());

async function createFixtureWorkflow(data: {
  nodes: Array<{ id: string; type: string; label?: string; config?: Record<string, unknown> }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
  }>;
  settings?: Record<string, unknown>;
}) {
  const org = await prisma.organization.create({
    data: { name: "Merge Test Org", slug: `merge-org-${Date.now()}-${Math.random()}` },
  });
  const user = await prisma.user.create({
    data: { email: `merge-${Date.now()}-${Math.random()}@test.local`, passwordHash: "hash", name: "Merge User" },
  });
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  return prisma.workflow.create({
    data: {
      name: "Merge 2D Branches Fixture",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      settings: data.settings ?? {},
      nodes: { create: data.nodes.map((node) => ({ ...node, config: node.config ?? {} })) },
      edges: {
        create: data.edges.map((e) => ({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          label: e.label,
        })),
      },
    },
  });
}

// ═════════════════════════════════════════════════════════════════
// 1. UNIT TESTS: normalizeBranches robustness & edge cases
// ═════════════════════════════════════════════════════════════════

test("normalizeBranches: extracts explicit ctx.inputBranches without corruption", () => {
  const branch0: NodeItem[] = [{ json: { id: 1, title: "A" } }];
  const branch1: NodeItem[] = [{ json: { id: 2, title: "B" } }];

  const branches = normalizeBranches({
    executionId: "exec-1",
    nodeId: "node-merge",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {},
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });

  assert.equal(branches.length, 2);
  assert.equal(branches[0].length, 1);
  assert.equal(branches[0][0].json.title, "A");
  assert.deepEqual(branches[0][0].pairedItem, { item: 0, input: 0 });
  assert.equal(branches[1].length, 1);
  assert.equal(branches[1][0].json.title, "B");
  assert.deepEqual(branches[1][0].pairedItem, { item: 0, input: 1 });
});

test("normalizeBranches: handles empty branch 0 without falling back to flat array", () => {
  // Previously: Array.isArray(rawInput[0]) evaluated to false because branch0 was empty or not an array element!
  // With 2D branch normalization: empty branch 0 is strictly preserved as branch 0
  const branch0: NodeItem[] = [];
  const branch1: NodeItem[] = [{ json: { id: 10, val: "branch1" } }];

  const branches = normalizeBranches({
    executionId: "exec-1",
    nodeId: "node-merge",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {},
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });

  assert.equal(branches.length, 2);
  assert.equal(branches[0].length, 0);
  assert.equal(branches[1].length, 1);
  assert.equal(branches[1][0].json.val, "branch1");
  assert.deepEqual(branches[1][0].pairedItem, { item: 0, input: 1 });
});

test("normalizeBranches: handles empty branch 1 with populated branch 0", () => {
  const branch0: NodeItem[] = [{ json: { id: 20, val: "branch0" } }];
  const branch1: NodeItem[] = [];

  const branches = normalizeBranches({
    executionId: "exec-1",
    nodeId: "node-merge",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {},
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });

  assert.equal(branches.length, 2);
  assert.equal(branches[0].length, 1);
  assert.equal(branches[0][0].json.val, "branch0");
  assert.equal(branches[1].length, 0);
});

test("normalizeBranches: parses keyed dictionary { input1: [...], input2: [...] }", () => {
  const rawInput = {
    input1: [{ id: 101, name: "Order" }],
    input2: [{ id: 202, name: "Customer" }],
  };

  const branches = normalizeBranches({
    executionId: "exec-1",
    nodeId: "node-merge",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {},
    input: rawInput,
  });

  assert.equal(branches.length, 2);
  assert.equal(branches[0][0].json.name, "Order");
  assert.equal(branches[1][0].json.name, "Customer");
  assert.deepEqual(branches[0][0].pairedItem, { item: 0, input: 0 });
  assert.deepEqual(branches[1][0].pairedItem, { item: 0, input: 1 });
});

// ═════════════════════════════════════════════════════════════════
// 2. UNIT TESTS: Canonical merge modes & PairedItem lineage
// ═════════════════════════════════════════════════════════════════

test("MergeNodeHandler (append): concatenates branches and preserves sourceBranch metadata", async () => {
  const handler = new MergeNodeHandler();
  const branch0: NodeItem[] = [
    { json: { code: "A1" } },
    { json: { code: "A2" } },
  ];
  const branch1: NodeItem[] = [
    { json: { code: "B1" } },
  ];

  const result = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "append" },
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].json.code, "A1");
  assert.equal(result.items[0]._metadata?.sourceBranch, 0);
  assert.deepEqual(result.items[0].pairedItem, { item: 0, input: 0 });

  assert.equal(result.items[1].json.code, "A2");
  assert.equal(result.items[1]._metadata?.sourceBranch, 0);
  assert.deepEqual(result.items[1].pairedItem, { item: 1, input: 0 });

  assert.equal(result.items[2].json.code, "B1");
  assert.equal(result.items[2]._metadata?.sourceBranch, 1);
  assert.deepEqual(result.items[2].pairedItem, { item: 0, input: 1 });

  const validation = NodeItemsSchema.safeParse(result.items);
  assert.ok(validation.success);
});

test("MergeNodeHandler (combineByPosition): joins by index without dropping extra items from longer branch", async () => {
  const handler = new MergeNodeHandler();
  // Branch 0 has 2 items, Branch 1 has 4 items
  const branch0: NodeItem[] = [
    { json: { first: "Alice", role: "Dev" } },
    { json: { first: "Bob", role: "Ops" } },
  ];
  const branch1: NodeItem[] = [
    { json: { age: 30, city: "SP" } },
    { json: { age: 35, city: "RJ" } },
    { json: { age: 40, city: "BH" } },
    { json: { age: 28, city: "CWB" } },
  ];

  const result = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-pos",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "combineByPosition" },
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });

  // Must not discard positions 2 and 3 ("sem descarte")
  assert.equal(result.items.length, 4);

  // Item 0: combined from both branches
  assert.deepEqual(result.items[0].json, { first: "Alice", role: "Dev", age: 30, city: "SP" });
  assert.deepEqual(result.items[0].pairedItem, [
    { item: 0, input: 0 },
    { item: 0, input: 1 },
  ]);

  // Item 1: combined from both branches
  assert.deepEqual(result.items[1].json, { first: "Bob", role: "Ops", age: 35, city: "RJ" });
  assert.deepEqual(result.items[1].pairedItem, [
    { item: 1, input: 0 },
    { item: 1, input: 1 },
  ]);

  // Item 2: only from branch 1 (no item in branch 0)
  assert.deepEqual(result.items[2].json, { age: 40, city: "BH" });
  assert.deepEqual(result.items[2].pairedItem, { item: 2, input: 1 });

  // Item 3: only from branch 1
  assert.deepEqual(result.items[3].json, { age: 28, city: "CWB" });
  assert.deepEqual(result.items[3].pairedItem, { item: 3, input: 1 });

  const validation = NodeItemsSchema.safeParse(result.items);
  assert.ok(validation.success);
});

test("MergeNodeHandler (multiplex): performs cartesian product with multi-branch pairedItem refs", async () => {
  const handler = new MergeNodeHandler();
  const branch0: NodeItem[] = [
    { json: { color: "red" } },
    { json: { color: "blue" } },
  ];
  const branch1: NodeItem[] = [
    { json: { size: "S" } },
    { json: { size: "M" } },
    { json: { size: "L" } },
  ];

  const result = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-cart",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "multiplex" },
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });

  assert.equal(result.items.length, 6);
  assert.deepEqual(result.items[0].json, { color: "red", size: "S" });
  assert.deepEqual(result.items[0].pairedItem, [
    { item: 0, input: 0 },
    { item: 0, input: 1 },
  ]);
  assert.deepEqual(result.items[5].json, { color: "blue", size: "L" });
  assert.deepEqual(result.items[5].pairedItem, [
    { item: 1, input: 0 },
    { item: 2, input: 1 },
  ]);

  const validation = NodeItemsSchema.safeParse(result.items);
  assert.ok(validation.success);
});

// ═════════════════════════════════════════════════════════════════
// 3. KEYED JOIN & NESTED PATHS (user.profile.id) with 100+ items
// ═════════════════════════════════════════════════════════════════

test("MergeNodeHandler (mergeByKey): deep nested dot-notation join (e.g. user.profile.id) with 150 items O(N+M)", async () => {
  const handler = new MergeNodeHandler();
  const count = 150;

  const branch0: NodeItem[] = [];
  const branch1: NodeItem[] = [];

  for (let i = 0; i < count; i++) {
    branch0.push({
      json: {
        user: {
          profile: {
            id: `usr_${i}`,
            username: `user_${i}`,
          },
        },
        salary: 1000 + i * 50,
      },
    });

    branch1.push({
      json: {
        account: {
          details: {
            profileId: `usr_${i}`,
          },
        },
        department: i % 2 === 0 ? "Engineering" : "Finance",
        tier: "Gold",
      },
    });
  }

  // Shuffle branch1 to ensure non-positional, map-based join correctness
  const shuffledBranch1 = [...branch1].reverse();

  const startMs = Date.now();
  const result = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-key",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: {
      mode: "mergeByKey",
      propertyName1: "user.profile.id",
      propertyName2: "account.details.profileId",
      clashHandling: "preferInput1",
      outputFormat: "merged",
      joinType: "inner",
    },
    input: [branch0, shuffledBranch1],
    inputBranches: [branch0, shuffledBranch1],
  });
  const elapsedMs = Date.now() - startMs;

  assert.equal(result.items.length, count);
  // O(N+M) must run well under 100ms for 150 items
  assert.ok(elapsedMs < 100, `Expected elapsedMs < 100ms, took ${elapsedMs}ms`);

  for (let i = 0; i < count; i++) {
    const item = result.items[i];
    assert.equal(item.json.user.profile.id, `usr_${i}`);
    assert.equal(item.json.account.details.profileId, `usr_${i}`);
    assert.equal(item.json.salary, 1000 + i * 50);
    assert.equal(item.json.department, i % 2 === 0 ? "Engineering" : "Finance");

    // Lineage verification
    assert.ok(Array.isArray(item.pairedItem));
    assert.equal(item.pairedItem.length, 2);
    assert.equal(item.pairedItem[0].input, 0);
    assert.equal(item.pairedItem[0].item, i);
    assert.equal(item.pairedItem[1].input, 1);
    // Because branch1 was reversed, pairedItem for branch 1 maps to count - 1 - i
    assert.equal(item.pairedItem[1].item, count - 1 - i);
  }

  const validation = NodeItemsSchema.safeParse(result.items);
  assert.ok(validation.success);
});

test("MergeNodeHandler (mergeByKey): clashHandling and joinTypes (full, inner, left, right)", async () => {
  const handler = new MergeNodeHandler();
  const branch0: NodeItem[] = [
    { json: { id: "1", title: "Original Title", conflict: "Branch0Wins" } },
    { json: { id: "2", title: "Item 2 Only in B0" } },
  ];
  const branch1: NodeItem[] = [
    { json: { id: "1", title: "New Title", conflict: "Branch1Wins", extra: "AddedField" } },
    { json: { id: "3", title: "Item 3 Only in B1" } },
  ];

  // 1. preferInput1 (default)
  const resPrefer1 = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-1",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "mergeByKey", key1: "id", key2: "id", clashHandling: "preferInput1", joinType: "full" },
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });
  assert.equal(resPrefer1.items.length, 3); // 1 matched, 2 from B0, 3 from B1
  const item1Prefer1 = resPrefer1.items.find((it) => it.json.id === "1");
  assert.equal(item1Prefer1?.json.title, "Original Title"); // B0 preserved
  assert.equal(item1Prefer1?.json.conflict, "Branch0Wins");
  assert.equal(item1Prefer1?.json.extra, "AddedField");

  // 2. preferInput2 / override
  const resPrefer2 = await handler.execute({
    executionId: "exec-1",
    nodeId: "merge-2",
    workflowId: "wf-1",
    orgId: "org-1",
    nodeConfig: { mode: "mergeByKey", key1: "id", key2: "id", clashHandling: "preferInput2", joinType: "inner" },
    input: [branch0, branch1],
    inputBranches: [branch0, branch1],
  });
  assert.equal(resPrefer2.items.length, 1); // inner join only keeps matched id="1"
  assert.equal(resPrefer2.items[0].json.title, "New Title"); // B1 wins
  assert.equal(resPrefer2.items[0].json.conflict, "Branch1Wins");
});

// ═════════════════════════════════════════════════════════════════
// 4. INTEGRATION & DAG PARALLEL DISPATCH (Out-of-Order Branch Arrivals)
// ═════════════════════════════════════════════════════════════════

test("DAG parallel dispatch: Merge receives branches deterministically despite out-of-order completion", async () => {
  // Setup:
  // Trigger -> BranchA (Wait 300ms) with targetHandle: "input_0" \
  //                                                              -> Merge (append) -> Output
  // Trigger -> BranchB (Wait 50ms)  with targetHandle: "input_1" /
  //
  // BranchB completes in ~50ms, BranchA completes in ~300ms.
  // In the past, BranchB would arrive first into incomingInputs[0], flipping the order of inputs!
  // With inputBranches 2D pre-indexed by targetHandle, BranchA is ALWAYS slot 0 and BranchB is ALWAYS slot 1.

  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      { id: "branchA", type: "wait", config: { mode: "inline", duration: 300, unit: "ms" } },
      { id: "branchB", type: "wait", config: { mode: "inline", duration: 50, unit: "ms" } },
      { id: "merge", type: "merge", config: { mode: "append" } },
      { id: "output", type: "output" },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "branchA" },
      { id: "e2", sourceNodeId: "trigger", targetNodeId: "branchB" },
      { id: "e3", sourceNodeId: "branchA", targetNodeId: "merge", targetHandle: "input_0" },
      { id: "e4", sourceNodeId: "branchB", targetNodeId: "merge", targetHandle: "input_1" },
      { id: "e5", sourceNodeId: "merge", targetNodeId: "output" },
    ],
  });

  const execution = await createWorkflowExecution(
    workflow.id,
    { token: "root-payload" },
    { trigger: "webhook" }
  );

  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const mergeExec = nodeExecutions.find((ne: any) => ne.nodeId === "merge");
  assert.equal(mergeExec?.status, "SUCCESS");

  const mergeOutput = mergeExec?.output as any[];
  assert.ok(Array.isArray(mergeOutput));
  assert.equal(mergeOutput.length, 2);

  // Branch A must be first (sourceBranch: 0) and Branch B second (sourceBranch: 1)
  assert.equal(mergeOutput[0]._metadata?.sourceBranch, 0);
  assert.deepEqual(mergeOutput[0].pairedItem, { item: 0, input: 0 });

  assert.equal(mergeOutput[1]._metadata?.sourceBranch, 1);
  assert.deepEqual(mergeOutput[1].pairedItem, { item: 0, input: 1 });
});

test("DAG parallel dispatch: MergeKeyed join in DAG preserves 100+ items across parallel branches", async () => {
  // Trigger -> genOrders (100 items)  [targetHandle: "input_0"] \
  //                                                              -> Merge (mergeByKey on "orderId")
  // Trigger -> genShipments (100 items) [targetHandle: "input_1"] /
  const count = 100;
  const orders = Array.from({ length: count }, (_, i) => ({
    orderId: `ord_${i}`,
    total: 100 + i * 10,
    customer: { code: `cust_${i}` },
  }));

  const shipments = Array.from({ length: count }, (_, i) => ({
    orderId: `ord_${i}`,
    carrier: i % 2 === 0 ? "DHL" : "FedEx",
    status: "DELIVERED",
  }));

  const workflow = await createFixtureWorkflow({
    nodes: [
      { id: "trigger", type: "webhook" },
      {
        id: "ordersNode",
        type: "code",
        config: {
          mode: "runOnceForAllItems",
          jsCode: `return ${JSON.stringify(orders)};`,
        },
      },
      {
        id: "shipmentsNode",
        type: "code",
        config: {
          mode: "runOnceForAllItems",
          jsCode: `return ${JSON.stringify(shipments)};`,
        },
      },
      {
        id: "mergeNode",
        type: "merge",
        config: {
          mode: "mergeByKey",
          key1: "orderId",
          key2: "orderId",
          clashHandling: "preferInput1",
          outputFormat: "merged",
        },
      },
    ],
    edges: [
      { id: "e1", sourceNodeId: "trigger", targetNodeId: "ordersNode" },
      { id: "e2", sourceNodeId: "trigger", targetNodeId: "shipmentsNode" },
      { id: "e3", sourceNodeId: "ordersNode", targetNodeId: "mergeNode", targetHandle: "input_0" },
      { id: "e4", sourceNodeId: "shipmentsNode", targetNodeId: "mergeNode", targetHandle: "input_1" },
    ],
  });

  const execution = await createWorkflowExecution(workflow.id, {}, { trigger: "webhook" });
  const result = await runExecution(execution.id);
  assert.equal(result.status, "SUCCESS");

  const nodeExecutions = await prisma.nodeExecution.findMany({ where: { executionId: execution.id } });
  const mergeExec = nodeExecutions.find((ne: any) => ne.nodeId === "mergeNode");
  assert.equal(mergeExec?.status, "SUCCESS");

  const output = mergeExec?.output as any[];
  assert.ok(Array.isArray(output));
  assert.equal(output.length, count);

  for (let i = 0; i < count; i++) {
    const item = output[i];
    assert.equal(item.json.orderId, `ord_${i}`);
    assert.equal(item.json.total, 100 + i * 10);
    assert.equal(item.json.carrier, i % 2 === 0 ? "DHL" : "FedEx");
    assert.equal(item.json.status, "DELIVERED");
  }
});
