import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
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
  binaryPayloadMetaSchema,
  BinaryPayloadMetaSchema,
  pairedItemRefSchema,
  PairedItemRefSchema,
  nodeItemSchema,
  NodeItemSchema,
  nodeItemsArraySchema,
  NodeItemsSchema,
  type NodeItem,
  type BinaryData,
  type BinaryPayloadMeta,
  type PairedItemRef,
} from "../src/items.js";

describe("Normalized Multi-Item Contract Engine (@agentflow/shared)", () => {
  describe("1. wrapItems and ensureNodeItem normalization", () => {
    it("handles undefined and null inputs by returning a single empty item", () => {
      assert.deepEqual(wrapItems(undefined), [{ json: {} }]);
      assert.deepEqual(wrapItems(null), [{ json: {} }]);
    });

    it("wraps single plain objects into NodeItem[]", () => {
      const input = { id: 1, name: "Alice", active: true };
      const items = wrapItems(input);
      assert.equal(items.length, 1);
      assert.deepEqual(items[0], {
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
      assert.equal(items.length, 2);
      assert.deepEqual(items[0].json, { id: 101, title: "Item 1" });
      assert.deepEqual(items[0].pairedItem, { item: 0 });
      assert.deepEqual(items[1].json, { id: 102, title: "Item 2" });
      assert.deepEqual(items[1].pairedItem, { item: 1 });
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
      assert.equal(items.length, 1);
      assert.deepEqual(items[0], input);
      assert.equal(isNodeItem(items[0]), true);
    });

    it("handles legacy wrapped { items: [...] } payloads seamlessly", () => {
      const legacy = {
        items: [
          { sku: "A1", qty: 10 },
          { sku: "B2", qty: 20 },
        ],
      };
      const items = wrapItems(legacy);
      assert.equal(items.length, 2);
      assert.deepEqual(items[0].json, { sku: "A1", qty: 10 });
      assert.deepEqual(items[1].json, { sku: "B2", qty: 20 });
    });

    it("handles primitive values (numbers, strings, booleans)", () => {
      assert.deepEqual(wrapItems(42), [{ json: { value: 42 }, pairedItem: { item: 0 } }]);
      assert.deepEqual(wrapItems("hello"), [{ json: { value: "hello" }, pairedItem: { item: 0 } }]);
      assert.deepEqual(wrapItems(true), [{ json: { value: true }, pairedItem: { item: 0 } }]);
    });

    it("preserves top-level pairedItem and binary if present on input objects", () => {
      const input = {
        orderId: 123,
        pairedItem: { item: 4, subIndex: 2, sourceNodeId: "node_1" },
        binary: { invoice: { storageKey: "inv_123", fileName: "inv.pdf" } },
      };
      const items = wrapItems(input);
      assert.equal(items.length, 1);
      assert.deepEqual(items[0].json, { orderId: 123 });
      assert.deepEqual(items[0].pairedItem, { item: 4, subIndex: 2, sourceNodeId: "node_1" });
      assert.deepEqual(items[0].binary, { invoice: { storageKey: "inv_123", fileName: "inv.pdf" } });
    });
  });

  describe("2. BinaryPayloadMeta and PairedItemRef Zod schemas", () => {
    it("validates BinaryPayloadMetaSchema with strict 64-char hex SHA-256", () => {
      const validMeta: BinaryPayloadMeta = {
        mimeType: "application/pdf",
        fileName: "report.pdf",
        fileSize: 1024,
        storageKey: "vault/documents/report-01.pdf",
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        fileExtension: "pdf",
      };

      const parsed = BinaryPayloadMetaSchema.parse(validMeta);
      assert.equal(parsed.checksumSha256, validMeta.checksumSha256);
      assert.equal(binaryPayloadMetaSchema.safeParse(validMeta).success, true);

      // Invalid SHA-256 (wrong length)
      const invalidShort = { ...validMeta, checksumSha256: "abcd" };
      assert.equal(BinaryPayloadMetaSchema.safeParse(invalidShort).success, false);

      // Invalid SHA-256 (non-hex character 'g')
      const invalidHex = {
        ...validMeta,
        checksumSha256: "g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      };
      assert.equal(BinaryPayloadMetaSchema.safeParse(invalidHex).success, false);

      // Missing required storageKey
      const missingKey = { ...validMeta, storageKey: "" };
      assert.equal(BinaryPayloadMetaSchema.safeParse(missingKey).success, false);
    });

    it("validates PairedItemRefSchema with subIndex and sourceNodeId", () => {
      const validRef: PairedItemRef = {
        item: 0,
        subIndex: 3,
        sourceNodeId: "http_1",
        input: 0,
        source: "http_1",
      };

      const parsed = PairedItemRefSchema.parse(validRef);
      assert.equal(parsed.item, 0);
      assert.equal(parsed.subIndex, 3);
      assert.equal(parsed.sourceNodeId, "http_1");
      assert.equal(pairedItemRefSchema.safeParse(validRef).success, true);

      // Negative item index must fail
      assert.equal(PairedItemRefSchema.safeParse({ item: -1 }).success, false);
      // Negative subIndex must fail
      assert.equal(PairedItemRefSchema.safeParse({ item: 0, subIndex: -1 }).success, false);
    });

    it("validates NodeItemSchema and NodeItemsSchema", () => {
      const item: NodeItem = {
        json: { id: "item-1" },
        binary: {
          file: {
            mimeType: "image/png",
            fileName: "logo.png",
            fileSize: 4096,
            storageKey: "assets/logo.png",
            checksumSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          },
        },
        pairedItem: { item: 0, subIndex: 1, sourceNodeId: "source-node" },
        _metadata: { executionTimeMs: 42, iterationIndex: 1 },
      };

      const parsed = NodeItemSchema.parse(item);
      assert.equal(parsed.json.id, "item-1");
      assert.ok(parsed.binary?.file);
      assert.deepEqual(parsed._metadata, { executionTimeMs: 42, iterationIndex: 1 });

      const arrayParsed = NodeItemsSchema.parse([item]);
      assert.equal(arrayParsed.length, 1);
      assert.equal(nodeItemsArraySchema.safeParse([item]).success, true);
    });
  });

  describe("3. unwrapItems and adapter modes", () => {
    it("unwraps a single item to plain JSON for legacy ergonomics", () => {
      const items: NodeItem[] = [{ json: { status: "OK", count: 1 } }];
      const unwrapped = unwrapItems(items, { singleObjectIfOne: true });
      assert.deepEqual(unwrapped, { status: "OK", count: 1 });
    });

    it("unwraps multi-item arrays into clean array format", () => {
      const items: NodeItem[] = [
        { json: { id: 1 } },
        { json: { id: 2 } },
      ];
      const unwrapped = unwrapItems(items);
      assert.deepEqual(unwrapped, [{ id: 1 }, { id: 2 }]);
    });

    it("preserves binary properties when requested", () => {
      const items: NodeItem[] = [
        {
          json: { id: 1 },
          binary: { doc: { data: "xyz", mimeType: "application/pdf" } },
        },
      ];
      const unwrapped = unwrapItems(items, { singleObjectIfOne: false, preserveBinary: true });
      assert.deepEqual(unwrapped, [
        {
          json: { id: 1 },
          binary: { doc: { data: "xyz", mimeType: "application/pdf" } },
        },
      ]);
    });

    it("bidirectional normalizeToItemsContract and normalizeFromItemsContract", () => {
      const raw = [{ a: 1 }, { b: 2 }];
      const normalized = normalizeToItemsContract(raw);
      assert.equal(normalized.length, 2);
      assert.deepEqual(normalized[0].json, { a: 1 });

      const backToLegacy = normalizeFromItemsContract(normalized, "legacy");
      assert.deepEqual(backToLegacy, [{ a: 1 }, { b: 2 }]);
    });
  });

  describe("4. Dot-Notation & JSONPath Field Extraction (extractFieldByPath & setFieldByPath)", () => {
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
      assert.equal(extractFieldByPath(dataset, "user.profile.name"), "John Doe");
      assert.equal(extractFieldByPath(dataset, "user.profile.address.geo.lat"), 37.7749);
    });

    it("extracts fields using bracket notation and array indices", () => {
      assert.equal(extractFieldByPath(dataset, "user.profile.emails[0]"), "john@example.com");
      assert.equal(extractFieldByPath(dataset, "user.profile.emails[1]"), "j.doe@work.com");
      assert.equal(extractFieldByPath(dataset, "user['profile']['name']"), "John Doe");
      assert.equal(extractFieldByPath(dataset, "orders[0].items[1].name"), "Gadget");
    });

    it("supports wildcard array mappings (e.g. orders[*].id or orders.*.total)", () => {
      assert.deepEqual(extractFieldByPath(dataset, "orders[*].id"), ["o1", "o2"]);
      assert.deepEqual(extractFieldByPath(dataset, "orders.*.total"), [100, 250]);
    });

    it("returns fallback for non-existent paths", () => {
      assert.equal(extractFieldByPath(dataset, "user.nonExistent", "DEFAULT"), "DEFAULT");
      assert.equal(extractFieldByPath(dataset, "orders[99].id", null), null);
    });

    it("immutably sets deep fields using setFieldByPath", () => {
      const updated = setFieldByPath(dataset, "user.profile.name", "Jane Doe");
      assert.equal(updated.user.profile.name, "Jane Doe");
      assert.equal(dataset.user.profile.name, "John Doe"); // original unchanged

      const withNewDeepProp = setFieldByPath({}, "a.b.c[0].d", "value");
      assert.deepEqual(withNewDeepProp, {
        a: { b: { c: [{ d: "value" }] } },
      });
    });

    it("normalizes diverse path formats correctly", () => {
      assert.deepEqual(normalizePath("user.name"), ["user", "name"]);
      assert.deepEqual(normalizePath("users[0]['address'].city"), ["users", "0", "address", "city"]);
      assert.deepEqual(normalizePath(".deep.path[1]"), ["deep", "path", "1"]);
    });
  });

  describe("5. Batching, Mapping and Pipeline Utilities", () => {
    it("batches items into chunks with precise batch context", () => {
      const items: NodeItem[] = Array.from({ length: 25 }, (_, i) => ({
        json: { id: i + 1, value: `Item ${i + 1}` },
      }));

      const batches = batchItems(items, 10);
      assert.equal(batches.length, 3); // 10, 10, 5

      // Batch 1
      assert.equal(batches[0].items.length, 10);
      assert.equal(batches[0].context.batchIndex, 0);
      assert.equal(batches[0].context.totalBatches, 3);
      assert.equal(batches[0].context.isFirstBatch, true);
      assert.equal(batches[0].context.isLastBatch, false);
      assert.equal((batches[0].items[0].json as any)._batchContext.itemIndex, 0);

      // Batch 3
      assert.equal(batches[2].items.length, 5);
      assert.equal(batches[2].context.batchIndex, 2);
      assert.equal(batches[2].context.isFirstBatch, false);
      assert.equal(batches[2].context.isLastBatch, true);
      assert.equal(batches[2].items[4].json.id, 25);
    });

    it("maps items maintaining pairedItem references", async () => {
      const source = wrapItems([{ num: 2 }, { num: 4 }, { num: 6 }]);
      const mapped = await mapItems(source, (item) => ({
        json: { doubled: item.json.num * 2 },
      }));

      assert.equal(mapped.length, 3);
      assert.deepEqual(mapped[0].json, { doubled: 4 });
      assert.deepEqual(mapped[0].pairedItem, { item: 0 });
      assert.deepEqual(mapped[1].json, { doubled: 8 });
      assert.deepEqual(mapped[1].pairedItem, { item: 1 });
      assert.deepEqual(mapped[2].json, { doubled: 12 });
      assert.deepEqual(mapped[2].pairedItem, { item: 2 });
    });

    it("filters items correctly", async () => {
      const source = wrapItems([
        { id: 1, active: true },
        { id: 2, active: false },
        { id: 3, active: true },
      ]);
      const filtered = await filterItems(source, (item) => item.json.active === true);
      assert.equal(filtered.length, 2);
      assert.equal(filtered[0].json.id, 1);
      assert.equal(filtered[1].json.id, 3);
      assert.deepEqual(filtered[1].pairedItem, { item: 2 });
    });

    it("merges item batches back into flat list", () => {
      const batch1 = [{ json: { id: 1 } }, { json: { id: 2 } }];
      const batch2 = [{ json: { id: 3 } }];
      const merged = mergeItemBatches([batch1, batch2]);
      assert.equal(merged.length, 3);
      assert.deepEqual(merged.map((i) => i.json.id), [1, 2, 3]);
    });

    it("links paired items across fan-out and multi-node execution", () => {
      const source = wrapItems([{ org: "ACME" }, { org: "Globex" }]);
      const output = [{ json: { result: "R1" } }, { json: { result: "R2" } }];

      const linked = linkPairedItems(source, output, "httpNode");
      assert.equal(linked.length, 2);
      assert.deepEqual(linked[0].pairedItem, { item: 0, input: 0, source: "httpNode", sourceNodeId: "httpNode" });
      assert.deepEqual(linked[1].pairedItem, { item: 1, input: 0, source: "httpNode", sourceNodeId: "httpNode" });
    });
  });
});
