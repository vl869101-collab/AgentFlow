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
  normalizePath,
  type NodeItem,
  type BinaryData,
} from "../src/items.js";

describe("Normalized Multi-Item Contract Engine (@agentflow/shared)", () => {
  describe("1. wrapItems and ensureNodeItem normalization", () => {
    it("handles undefined and null inputs by returning a single empty item", () => {
      expect(wrapItems(undefined)).toEqual([{ json: {} }]);
      expect(wrapItems(null)).toEqual([{ json: {} }]);
    });

    it("wraps single plain objects into NodeItem[]", () => {
      const input = { id: 1, name: "Alice", active: true };
      const items = wrapItems(input);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        json: { id: 1, name: "Alice", active: true },
        pairedItem: { item: 0 },
      });
    });

    it("wraps array of plain objects into standardized NodeItem[] with paired indexes", () => {
      const input = [
        { id: 101, title: "Item 1" },
        { id: 102, title: "Item 2" },
      ];
      const items = wrapItems(input);
      expect(items).toHaveLength(2);
      expect(items[0].json).toEqual({ id: 101, title: "Item 1" });
      expect(items[0].pairedItem).toEqual({ item: 0 });
      expect(items[1].json).toEqual({ id: 102, title: "Item 2" });
      expect(items[1].pairedItem).toEqual({ item: 1 });
    });

    it("preserves already well-formed NodeItems including binary data", () => {
      const binaryPayload: BinaryData = {
        data: "aGVsbG8=",
        mimeType: "text/plain",
        fileName: "test.txt",
      };
      const input: NodeItem = {
        json: { orderId: "ORD-999" },
        binary: { file: binaryPayload },
        pairedItem: { item: 5, source: "trigger" },
      };
      const items = wrapItems(input);
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(input);
      expect(isNodeItem(items[0])).toBe(true);
    });

    it("handles legacy wrapped { items: [...] } payloads seamlessly", () => {
      const legacy = {
        items: [
          { sku: "A1", qty: 10 },
          { sku: "B2", qty: 20 },
        ],
      };
      const items = wrapItems(legacy);
      expect(items).toHaveLength(2);
      expect(items[0].json).toEqual({ sku: "A1", qty: 10 });
      expect(items[1].json).toEqual({ sku: "B2", qty: 20 });
    });

    it("handles primitive values (numbers, strings, booleans)", () => {
      expect(wrapItems(42)).toEqual([{ json: { value: 42 }, pairedItem: { item: 0 } }]);
      expect(wrapItems("hello")).toEqual([{ json: { value: "hello" }, pairedItem: { item: 0 } }]);
      expect(wrapItems(true)).toEqual([{ json: { value: true }, pairedItem: { item: 0 } }]);
    });
  });

  describe("2. unwrapItems and adapter modes", () => {
    it("unwraps a single item to plain JSON for legacy ergonomics", () => {
      const items: NodeItem[] = [{ json: { status: "OK", count: 1 } }];
      const unwrapped = unwrapItems(items, { singleObjectIfOne: true });
      expect(unwrapped).toEqual({ status: "OK", count: 1 });
    });

    it("unwraps multi-item arrays into clean array format", () => {
      const items: NodeItem[] = [
        { json: { id: 1 } },
        { json: { id: 2 } },
      ];
      const unwrapped = unwrapItems(items);
      expect(unwrapped).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("preserves binary properties when requested", () => {
      const items: NodeItem[] = [
        {
          json: { id: 1 },
          binary: { doc: { data: "xyz", mimeType: "application/pdf" } },
        },
      ];
      const unwrapped = unwrapItems(items, { singleObjectIfOne: false, preserveBinary: true });
      expect(unwrapped).toEqual([
        {
          json: { id: 1 },
          binary: { doc: { data: "xyz", mimeType: "application/pdf" } },
        },
      ]);
    });

    it("bidirectional normalizeToItemsContract and normalizeFromItemsContract", () => {
      const raw = [{ a: 1 }, { b: 2 }];
      const normalized = normalizeToItemsContract(raw);
      expect(normalized).toHaveLength(2);
      expect(normalized[0].json).toEqual({ a: 1 });

      const backToLegacy = normalizeFromItemsContract(normalized, "legacy");
      expect(backToLegacy).toEqual([{ a: 1 }, { b: 2 }]);
    });
  });

  describe("3. Dot-Notation & JSONPath Field Extraction (extractFieldByPath & setFieldByPath)", () => {
    const dataset = {
      user: {
        profile: {
          name: "John Doe",
          emails: ["john@example.com", "j.doe@work.com"],
          address: {
            city: "San Francisco",
            geo: { lat: 37.7749, lng: -122.4194 },
          },
        },
        roles: ["admin", "developer"],
      },
      orders: [
        { id: "o1", total: 100, items: [{ name: "Widget", price: 50 }, { name: "Gadget", price: 50 }] },
        { id: "o2", total: 250, items: [{ name: "Tool", price: 250 }] },
      ],
    };

    it("extracts nested fields using dot notation", () => {
      expect(extractFieldByPath(dataset, "user.profile.name")).toBe("John Doe");
      expect(extractFieldByPath(dataset, "user.profile.address.geo.lat")).toBe(37.7749);
    });

    it("extracts fields using bracket notation and array indices", () => {
      expect(extractFieldByPath(dataset, "user.profile.emails[0]")).toBe("john@example.com");
      expect(extractFieldByPath(dataset, "user.profile.emails[1]")).toBe("j.doe@work.com");
      expect(extractFieldByPath(dataset, "user['profile']['name']")).toBe("John Doe");
      expect(extractFieldByPath(dataset, "orders[0].items[1].name")).toBe("Gadget");
    });

    it("supports wildcard array mappings (e.g. orders[*].id or orders.*.total)", () => {
      expect(extractFieldByPath(dataset, "orders[*].id")).toEqual(["o1", "o2"]);
      expect(extractFieldByPath(dataset, "orders.*.total")).toEqual([100, 250]);
    });

    it("returns fallback for non-existent paths", () => {
      expect(extractFieldByPath(dataset, "user.nonExistent", "DEFAULT")).toBe("DEFAULT");
      expect(extractFieldByPath(dataset, "orders[99].id", null)).toBeNull();
    });

    it("immutably sets deep fields using setFieldByPath", () => {
      const updated = setFieldByPath(dataset, "user.profile.name", "Jane Doe");
      expect(updated.user.profile.name).toBe("Jane Doe");
      expect(dataset.user.profile.name).toBe("John Doe"); // original unchanged

      const withNewDeepProp = setFieldByPath({}, "a.b.c[0].d", "value");
      expect(withNewDeepProp).toEqual({
        a: { b: { c: [{ d: "value" }] } },
      });
    });

    it("normalizes diverse path formats correctly", () => {
      expect(normalizePath("user.name")).toEqual(["user", "name"]);
      expect(normalizePath("users[0]['address'].city")).toEqual(["users", "0", "address", "city"]);
      expect(normalizePath(".deep.path[1]")).toEqual(["deep", "path", "1"]);
    });
  });

  describe("4. Batching, Mapping and Pipeline Utilities", () => {
    it("batches items into chunks with precise batch context", () => {
      const items: NodeItem[] = Array.from({ length: 25 }, (_, i) => ({
        json: { id: i + 1, value: `Item ${i + 1}` },
      }));

      const batches = batchItems(items, 10);
      expect(batches).toHaveLength(3); // 10, 10, 5

      // Batch 1
      expect(batches[0].items).toHaveLength(10);
      expect(batches[0].context.batchIndex).toBe(0);
      expect(batches[0].context.totalBatches).toBe(3);
      expect(batches[0].context.isFirstBatch).toBe(true);
      expect(batches[0].context.isLastBatch).toBe(false);
      expect(batches[0].items[0].json._batchContext.itemIndex).toBe(0);

      // Batch 3
      expect(batches[2].items).toHaveLength(5);
      expect(batches[2].context.batchIndex).toBe(2);
      expect(batches[2].context.isFirstBatch).toBe(false);
      expect(batches[2].context.isLastBatch).toBe(true);
      expect(batches[2].items[4].json.id).toBe(25);
    });

    it("maps items maintaining pairedItem references", async () => {
      const source = wrapItems([{ num: 2 }, { num: 4 }, { num: 6 }]);
      const mapped = await mapItems(source, (item) => ({
        json: { doubled: item.json.num * 2 },
      }));

      expect(mapped).toHaveLength(3);
      expect(mapped[0].json).toEqual({ doubled: 4 });
      expect(mapped[0].pairedItem).toEqual({ item: 0 });
      expect(mapped[1].json).toEqual({ doubled: 8 });
      expect(mapped[1].pairedItem).toEqual({ item: 1 });
      expect(mapped[2].json).toEqual({ doubled: 12 });
      expect(mapped[2].pairedItem).toEqual({ item: 2 });
    });

    it("filters items correctly", async () => {
      const source = wrapItems([
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ]);
      const filtered = await filterItems(source, (item) => item.json.active === true);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].json.id).toBe(1);
      expect(filtered[1].json.id).toBe(3);
      expect(filtered[1].pairedItem).toEqual({ item: 2 });
    });

    it("merges item batches back into flat list", () => {
      const batch1 = [{ json: { id: 1 } }, { json: { id: 2 } }];
      const batch2 = [{ json: { id: 3 } }];
      const merged = mergeItemBatches([batch1, batch2]);
      expect(merged).toHaveLength(3);
      expect(merged.map((i) => i.json.id)).toEqual([1, 2, 3]);
    });

    it("links paired items across fan-out and multi-node execution", () => {
      const source = wrapItems([{ org: "ACME" }, { org: "Globex" }]);
      const output = [{ json: { result: "R1" } }, { json: { result: "R2" } }];

      const linked = linkPairedItems(source, output, "httpNode");
      expect(linked).toHaveLength(2);
      expect(linked[0].pairedItem).toEqual({ item: 0, input: 0, source: "httpNode" });
      expect(linked[1].pairedItem).toEqual({ item: 1, input: 0, source: "httpNode" });
    });
  });
});
