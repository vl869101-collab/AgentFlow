process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wrapItems,
  unwrapItems,
  ensureNodeItem,
  isNodeItem,
  extractFieldByPath,
  setFieldByPath,
  batchItems,
  mapItems,
  filterItems,
  mergeItemBatches,
  createPairedItem,
  linkPairedItems,
  normalizeToItemsContract,
  normalizeFromItemsContract,
  type NodeItem,
} from "@agentflow/shared";
import { SplitInBatchesNodeHandler } from "../src/services/nodes/split-in-batches.js";
import { MergeNodeHandler } from "../src/services/nodes/merge.js";
import { CodeNodeHandler } from "../src/services/nodes/code.js";
import { SwitchNodeHandler } from "../src/services/nodes/switch.js";
import type { NodeExecutionContext } from "../src/services/nodes/types.js";

const createTestContext = (
  type: string,
  config: Record<string, unknown>,
  input: unknown = {}
): NodeExecutionContext => ({
  executionId: "exec-items-test",
  nodeId: `node-${type}-unit`,
  workflowId: "wf-items-test",
  orgId: "org-items-test",
  nodeConfig: { type, ...config },
  input,
});

test("TASK-01: SplitInBatchesNodeHandler slices items into chunks with context", async () => {
  const handler = new SplitInBatchesNodeHandler();
  const inputItems: NodeItem[] = Array.from({ length: 7 }, (_, i) => ({
    json: { id: i + 1, itemCode: `CODE-${i + 1}` },
  }));

  const ctx = createTestContext(
    "splitInBatches",
    {
      batchSize: 3,
    },
    inputItems
  );

  const result = await handler.execute(ctx);
  assert.strictEqual(result.items.length, 3);
  assert.strictEqual(result.items[0].json._batchContext.batchSize, 3);
  assert.strictEqual(result.items[0].json._batchContext.totalBatches, 3);
  assert.strictEqual(result.items[0].json._batchContext.isLastBatch, false);
});

test("TASK-02: MergeNodeHandler combines multiple input item branches correctly", async () => {
  const handler = new MergeNodeHandler();
  const input1: NodeItem[] = [
    { json: { id: 1, name: "Alpha" } },
    { json: { id: 2, name: "Beta" } },
  ];
  const input2: NodeItem[] = [
    { json: { id: 3, name: "Gamma" } },
  ];

  const ctx = createTestContext(
    "merge",
    {
      mode: "append",
    },
    [input1, input2]
  );

  const result = await handler.execute(ctx);
  assert.strictEqual(result.items.length, 3);
  assert.deepStrictEqual(result.items.map((it) => it.json.id), [1, 2, 3]);
});

test("TASK-03: CodeNodeHandler operates natively on $items array in sandbox", async () => {
  const handler = new CodeNodeHandler();
  const inputItems: NodeItem[] = [
    { json: { price: 10, qty: 2 } },
    { json: { price: 25, qty: 4 } },
  ];

  const ctx = createTestContext(
    "code",
    {
      parameters: {
        jsCode: `
          const items = $input.all();
          return items.map(item => ({
            json: {
              total: item.json.price * item.json.qty,
              formatted: '$' + (item.json.price * item.json.qty)
            }
          }));
        `,
        mode: "runOnceForAllItems",
      },
    },
    inputItems
  );

  const result = await handler.execute(ctx);
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.items[0].json.total, 20);
  assert.strictEqual(result.items[0].json.formatted, "$20");
  assert.strictEqual(result.items[1].json.total, 100);
  assert.strictEqual(result.items[1].json.formatted, "$100");
});

test("TASK-04: SwitchNodeHandler routes multi-item records using expression/rules", async () => {
  const handler = new SwitchNodeHandler();
  const inputItems: NodeItem[] = [
    { json: { score: 95, name: "UserA" } },
    { json: { score: 40, name: "UserB" } },
  ];

  const ctx = createTestContext(
    "switch",
    {
      rules: [
        { field: "score", operator: "greaterthan", value: 80, outputIndex: 1 },
        { field: "score", operator: "lessthan", value: 50, outputIndex: 2 },
      ],
      fallbackOutput: 0,
    },
    inputItems
  );

  const result = await handler.execute(ctx);
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.items[0].json._matchedOutput, 1);
  assert.strictEqual(result.items[1].json._matchedOutput, 2);
});

test("TASK-05: Advanced Expression & Nested Field Extraction with array wildcards", () => {
  const payload = {
    data: {
      customers: [
        { id: "c1", tier: "gold", contacts: [{ type: "email", val: "c1@test.com" }] },
        { id: "c2", tier: "silver", contacts: [{ type: "email", val: "c2@test.com" }] },
      ],
    },
  };

  const ids = extractFieldByPath(payload, "data.customers[*].id");
  assert.deepStrictEqual(ids, ["c1", "c2"]);

  const tiers = extractFieldByPath(payload, "data.customers.*.tier");
  assert.deepStrictEqual(tiers, ["gold", "silver"]);

  const firstEmail = extractFieldByPath(payload, "data.customers[0].contacts[0].val");
  assert.strictEqual(firstEmail, "c1@test.com");
});

test("TASK-06: Bidirectional Normalization Adapters", () => {
  const legacyObj = { result: "ok", count: 5 };
  const normalized = normalizeToItemsContract(legacyObj);
  assert.strictEqual(normalized.length, 1);
  assert.deepStrictEqual(normalized[0].json, legacyObj);

  const backToLegacy = normalizeFromItemsContract(normalized, "legacy");
  assert.deepStrictEqual(backToLegacy, legacyObj);
});
