import assert from "node:assert/strict";
import test from "node:test";
import {
  wrapItems,
  unwrapItems,
  extractFieldByPath,
  setFieldByPath,
  batchItems,
  type NodeItem,
} from "@agentflow/shared";
import { SplitInBatchesNodeHandler } from "../src/services/nodes/split-in-batches.js";
import { MergeNodeHandler } from "../src/services/nodes/merge.js";
import { CodeNodeHandler } from "../src/services/nodes/code.js";
import { SwitchNodeHandler } from "../src/services/nodes/switch.js";
import type { NodeExecutionContext } from "../src/services/nodes/types.js";

// Helper function to build execution context
function makeContext(
  type: string,
  nodeConfig: Record<string, unknown>,
  input: unknown = []
): NodeExecutionContext {
  return {
    executionId: "exec-flow-test",
    nodeId: `node-${type}-1`,
    workflowId: "wf-flow-test",
    orgId: "org-flow-test",
    nodeConfig: { type, ...nodeConfig },
    input,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Split In Batches / Loop Node Tests
// ─────────────────────────────────────────────────────────────────────────────

test("SplitInBatches: chunks multi-item input with accurate batch context and done flags", async () => {
  const handler = new SplitInBatchesNodeHandler();
  const inputItems: NodeItem[] = Array.from({ length: 5 }, (_, i) => ({
    json: { id: i + 1, name: `Record ${i + 1}` },
  }));

  // Batch 0 (size 2)
  const ctx0 = makeContext("splitInBatches", { batchSize: 2, batchIndex: 0 }, inputItems);
  const res0 = await handler.execute(ctx0);

  assert.strictEqual(res0.items.length, 2);
  assert.strictEqual(res0.items[0].json.id, 1);
  assert.strictEqual(res0.items[1].json.id, 2);
  assert.strictEqual(res0.items[0].json._batchContext.batchIndex, 0);
  assert.strictEqual(res0.items[0].json._batchContext.totalBatches, 3);
  assert.strictEqual(res0.items[0].json._batchContext.isFirstBatch, true);
  assert.strictEqual(res0.items[0].json._batchContext.isLastBatch, false);
  assert.strictEqual(res0.items[0].json._batchContext.done, false);
  assert.strictEqual(res0.items[0].json._batchContext.hasMore, true);

  // Batch 1 (size 2)
  const ctx1 = makeContext("splitInBatches", { batchSize: 2, batchIndex: 1 }, inputItems);
  const res1 = await handler.execute(ctx1);
  assert.strictEqual(res1.items.length, 2);
  assert.strictEqual(res1.items[0].json.id, 3);
  assert.strictEqual(res1.items[1].json.id, 4);
  assert.strictEqual(res1.items[0].json._batchContext.isFirstBatch, false);
  assert.strictEqual(res1.items[0].json._batchContext.isLastBatch, false);
  assert.strictEqual(res1.items[0].json._batchContext.done, false);

  // Batch 2 (last batch, 1 item left)
  const ctx2 = makeContext("splitInBatches", { batchSize: 2, batchIndex: 2 }, inputItems);
  const res2 = await handler.execute(ctx2);
  assert.strictEqual(res2.items.length, 1);
  assert.strictEqual(res2.items[0].json.id, 5);
  assert.strictEqual(res2.items[0].json._batchContext.isLastBatch, true);
  assert.strictEqual(res2.items[0].json._batchContext.done, true);
  assert.strictEqual(res2.items[0].json._batchContext.hasMore, false);
});

test("SplitInBatches: loop-back auto-increments batchIndex from previous batch context", async () => {
  const handler = new SplitInBatchesNodeHandler();
  const inputWithContext: NodeItem[] = [
    { json: { id: 1, _batchContext: { batchIndex: 0, done: false, batchSize: 2, totalBatches: 2 } } },
    { json: { id: 2 } },
    { json: { id: 3 } },
  ];

  const ctx = makeContext("splitInBatches", { batchSize: 2 }, inputWithContext);
  const res = await handler.execute(ctx);

  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.items[0].json.id, 3);
  assert.strictEqual(res.items[0].json._batchContext.batchIndex, 1);
  assert.strictEqual(res.items[0].json._batchContext.isLastBatch, true);
  assert.strictEqual(res.items[0].json._batchContext.done, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Merge Node Tests (Append, Combine by Index, Merge by Key)
// ─────────────────────────────────────────────────────────────────────────────

test("Merge: Append mode combines branch items sequentially", async () => {
  const handler = new MergeNodeHandler();
  const branchA: NodeItem[] = [{ json: { id: "a1", type: "order" } }];
  const branchB: NodeItem[] = [{ json: { id: "b1", type: "invoice" } }, { json: { id: "b2", type: "receipt" } }];

  const ctx = makeContext("merge", { mode: "append" }, [branchA, branchB]);
  const res = await handler.execute(ctx);

  assert.strictEqual(res.items.length, 3);
  assert.deepStrictEqual(
    res.items.map((i) => i.json.id),
    ["a1", "b1", "b2"]
  );
});

test("Merge: Combine by Index / Position zips corresponding items", async () => {
  const handler = new MergeNodeHandler();
  const branch1: NodeItem[] = [
    { json: { userId: 101, username: "alice" } },
    { json: { userId: 102, username: "bob" } },
  ];
  const branch2: NodeItem[] = [
    { json: { score: 95, tier: "gold" } },
    { json: { score: 80, tier: "silver" } },
    { json: { score: 70, tier: "bronze" } }, // Extra item
  ];

  const ctx = makeContext("merge", { mode: "combineByPosition" }, [branch1, branch2]);
  const res = await handler.execute(ctx);

  assert.strictEqual(res.items.length, 3);
  assert.deepStrictEqual(res.items[0].json, { userId: 101, username: "alice", score: 95, tier: "gold" });
  assert.deepStrictEqual(res.items[1].json, { userId: 102, username: "bob", score: 80, tier: "silver" });
  assert.deepStrictEqual(res.items[2].json, { score: 70, tier: "bronze" });
});

test("Merge: Merge by Key matches items using dot notation keys", async () => {
  const handler = new MergeNodeHandler();
  const branchCustomers: NodeItem[] = [
    { json: { customer: { code: "CUST-001" }, name: "Acme Corp" } },
    { json: { customer: { code: "CUST-002" }, name: "Globex" } },
    { json: { customer: { code: "CUST-003" }, name: "Initech" } },
  ];

  const branchBilling: NodeItem[] = [
    { json: { clientCode: "CUST-002", balance: 500.0, status: "PAID" } },
    { json: { clientCode: "CUST-001", balance: 1250.5, status: "OVERDUE" } },
  ];

  const ctx = makeContext(
    "merge",
    {
      mode: "mergeByKey",
      propertyName1: "customer.code",
      propertyName2: "clientCode",
    },
    [branchCustomers, branchBilling]
  );

  const res = await handler.execute(ctx);
  assert.strictEqual(res.items.length, 3);

  // Find merged Acme Corp
  const acme = res.items.find((i) => i.json.name === "Acme Corp");
  assert.ok(acme);
  assert.strictEqual(acme.json.balance, 1250.5);
  assert.strictEqual(acme.json.status, "OVERDUE");

  // Find merged Globex
  const globex = res.items.find((i) => i.json.name === "Globex");
  assert.ok(globex);
  assert.strictEqual(globex.json.balance, 500.0);
  assert.strictEqual(globex.json.status, "PAID");

  // Find Initech (unmatched in billing)
  const initech = res.items.find((i) => i.json.name === "Initech");
  assert.ok(initech);
  assert.strictEqual(initech.json.balance, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Code Node Sandbox Multi-Item Tests ($input.all, $input.item, $json, $binary)
// ─────────────────────────────────────────────────────────────────────────────

test("Code: runOnceForEachItem provides $json, $input.item, and $binary to each iteration", async () => {
  const handler = new CodeNodeHandler();
  const inputItems: NodeItem[] = [
    {
      json: { qty: 3, unitPrice: 15 },
      binary: { fileA: { data: "base64-data-1", mimeType: "text/plain" } },
    },
    {
      json: { qty: 5, unitPrice: 20 },
      binary: { fileB: { data: "base64-data-2", mimeType: "image/png" } },
    },
  ];

  const ctx = makeContext(
    "code",
    {
      parameters: {
        mode: "runOnceForEachItem",
        jsCode: `
          const subtotal = $json.qty * $json.unitPrice;
          const hasBinary = Object.keys($binary).length > 0;
          return {
            json: {
              ...$json,
              subtotal,
              hasAttachment: hasBinary,
              index: $itemIndex
            }
          };
        `,
      },
    },
    inputItems
  );

  const res = await handler.execute(ctx);
  assert.strictEqual(res.items.length, 2);
  assert.strictEqual(res.items[0].json.subtotal, 45);
  assert.strictEqual(res.items[0].json.hasAttachment, true);
  assert.strictEqual(res.items[0].json.index, 0);

  assert.strictEqual(res.items[1].json.subtotal, 100);
  assert.strictEqual(res.items[1].json.hasAttachment, true);
  assert.strictEqual(res.items[1].json.index, 1);
});

test("Code: runOnceForAllItems supports $input.all(), $input.first(), aggregation and filtering", async () => {
  const handler = new CodeNodeHandler();
  const inputItems: NodeItem[] = [
    { json: { category: "hardware", amount: 120 } },
    { json: { category: "software", amount: 350 } },
    { json: { category: "hardware", amount: 80 } },
  ];

  const ctx = makeContext(
    "code",
    {
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: `
          const all = $input.all();
          const first = $input.first();
          const totalAmount = all.reduce((sum, it) => sum + it.json.amount, 0);

          // Return summary and filtered hardware items
          const hardware = all.filter(it => it.json.category === 'hardware');
          return [
            { json: { type: 'summary', totalAmount, totalRecords: all.length, firstCategory: first.json.category } },
            ...hardware.map(h => ({ json: { ...h.json, discounted: h.json.amount * 0.9 } }))
          ];
        `,
      },
    },
    inputItems
  );

  const res = await handler.execute(ctx);
  assert.strictEqual(res.items.length, 3);
  assert.strictEqual(res.items[0].json.type, "summary");
  assert.strictEqual(res.items[0].json.totalAmount, 550);
  assert.strictEqual(res.items[0].json.totalRecords, 3);
  assert.strictEqual(res.items[0].json.firstCategory, "hardware");

  assert.strictEqual(res.items[1].json.category, "hardware");
  assert.strictEqual(res.items[1].json.discounted, 108);

  assert.strictEqual(res.items[2].json.category, "hardware");
  assert.strictEqual(res.items[2].json.discounted, 72);
});
