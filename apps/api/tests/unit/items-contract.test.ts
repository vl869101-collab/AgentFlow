import { describe, it, expect } from "vitest";
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
  type BinaryData,
} from "@agentflow/shared";
import {
  SetNodeHandler,
  FilterNodeHandler,
  SplitInBatchesNodeHandler,
  MergeNodeHandler,
  CodeNodeHandler,
  nodeDispatcher,
  type NodeExecutionContext,
} from "../../src/services/nodes/index.js";

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

describe("Items Contract Engine & Adapters (apps/api)", () => {
  describe("1. Data Normalization at Node Boundary", () => {
    it("SetNodeHandler maps and sets fields across multiple items", async () => {
      const handler = new SetNodeHandler();
      const inputItems: NodeItem[] = [
        { json: { id: 1, firstName: "Alice", active: true } },
        { json: { id: 2, firstName: "Bob", active: false } },
      ];

      const ctx = createTestContext(
        "set_fields",
        {
          fields: {
            app: "AgentFlow",
            userTag: "user-{{ $json.id }}",
          },
          keepOnlySet: false,
        },
        inputItems
      );

      const result = await handler.execute(ctx);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].json.firstName).toBe("Alice");
      expect(result.items[0].json.app).toBe("AgentFlow");
      expect(result.items[0].json.userTag).toBe("user-1");

      expect(result.items[1].json.firstName).toBe("Bob");
      expect(result.items[1].json.userTag).toBe("user-2");
    });

    it("FilterNodeHandler filters multi-item records correctly", async () => {
      const handler = new FilterNodeHandler();
      const inputItems: NodeItem[] = [
        { json: { id: 10, role: "admin", verified: true } },
        { json: { id: 20, role: "guest", verified: false } },
        { json: { id: 30, role: "admin", verified: false } },
      ];

      const ctx = createTestContext(
        "filter",
        {
          conditions: [
            { field: "role", operator: "equals", value: "admin" },
          ],
          combineOperation: "all",
        },
        inputItems
      );

      const result = await handler.execute(ctx);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].json.id).toBe(10);
      expect(result.items[1].json.id).toBe(30);
    });

    it("SplitInBatchesNodeHandler slices items into chunks with context", async () => {
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
      expect(result.items).toHaveLength(3);
      expect(result.items[0].json._batchContext.batchSize).toBe(3);
      expect(result.items[0].json._batchContext.totalBatches).toBe(3);
      expect(result.items[0].json._batchContext.isFirstBatch).toBe(true);
    });

    it("MergeNodeHandler combines multiple input item branches correctly", async () => {
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
        {
          input1,
          input2,
        }
      );

      const result = await handler.execute(ctx);
      expect(result.items).toHaveLength(3);
      expect(result.items.map((it) => it.json.id)).toEqual([1, 2, 3]);
    });

    it("CodeNodeHandler operates natively on $items array in sandbox", async () => {
      const handler = new CodeNodeHandler();
      const inputItems: NodeItem[] = [
        { json: { price: 10, qty: 2 } },
        { json: { price: 25, qty: 4 } },
      ];

      const ctx = createTestContext(
        "code",
        {
          code: `
            return $items.map(item => ({
              json: {
                total: item.json.price * item.json.qty,
                formatted: '$' + (item.json.price * item.json.qty)
              }
            }));
          `,
        },
        inputItems
      );

      const result = await handler.execute(ctx);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].json.total).toBe(20);
      expect(result.items[0].json.formatted).toBe("$20");
      expect(result.items[1].json.total).toBe(100);
      expect(result.items[1].json.formatted).toBe("$100");
    });
  });

  describe("2. NodeDispatcher transparent multi-item handling", () => {
    it("dispatches nodes and wraps legacy single record objects to items contract", async () => {
      const ctx = createTestContext(
        "transform",
        {
          mapping: {
            fullName: "{{ $json.first }} {{ $json.last }}",
          },
        },
        { first: "Ada", last: "Lovelace" } // legacy plain object
      );

      const result = await nodeDispatcher.dispatch(ctx);
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].json.fullName).toBe("Ada Lovelace");
    });
  });

  describe("3. Advanced Expression & Nested Field Extraction", () => {
    it("extracts values across deep structures with array wildcards", () => {
      const payload = {
        data: {
          customers: [
            { id: "c1", tier: "gold", contacts: [{ type: "email", val: "c1@test.com" }] },
            { id: "c2", tier: "silver", contacts: [{ type: "email", val: "c2@test.com" }] },
          ],
        },
      };

      const ids = extractFieldByPath(payload, "data.customers[*].id");
      expect(ids).toEqual(["c1", "c2"]);

      const tiers = extractFieldByPath(payload, "data.customers.*.tier");
      expect(tiers).toEqual(["gold", "silver"]);

      const firstEmail = extractFieldByPath(payload, "data.customers[0].contacts[0].val");
      expect(firstEmail).toBe("c1@test.com");
    });

    it("performs safe fallback on unresolvable paths", () => {
      const payload = { a: { b: 1 } };
      expect(extractFieldByPath(payload, "a.b.c.d", "N/A")).toBe("N/A");
      expect(extractFieldByPath(payload, "non.existent[0]", null)).toBeNull();
    });
  });
});
