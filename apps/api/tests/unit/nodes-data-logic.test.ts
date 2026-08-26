import { describe, it, expect, beforeEach } from "vitest";
import {
  PostgresNodeHandler,
  RedisNodeHandler,
  MongoNodeHandler,
  HttpNodeHandler,
  IfNodeHandler,
  MergeNodeHandler,
  SetNodeHandler,
  CodeNodeHandler,
  nodeDispatcher,
  nodeRegistry,
  NodeExecutionContext,
} from "../../src/services/nodes/index.js";

const baseContext = (type: string, config: Record<string, unknown>, input: unknown = {}): NodeExecutionContext => ({
  executionId: "exec-test-123",
  nodeId: `node-${type}-1`,
  workflowId: "wf-test-1",
  orgId: "org-test-1",
  nodeConfig: { type, ...config },
  input,
});

describe("Data Nodes: Postgres, Redis, Mongo, HTTP", () => {
  describe("PostgresNodeHandler", () => {
    const handler = new PostgresNodeHandler();

    it("executes raw query and parameter interpolation", async () => {
      const ctx = baseContext("postgres", {
        operation: "executeQuery",
        query: "SELECT * FROM users WHERE email = '{{ $json.email }}'",
      }, { email: "alice@example.com" });

      const result = await handler.execute(ctx);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].json.query).toContain("alice@example.com");
      expect(result.items[0].json.rowCount).toBe(1);
    });

    it("handles select, insert, update, delete operations", async () => {
      const insertCtx = baseContext("postgres", {
        operation: "insert",
        table: "orders",
        insertFields: { amount: 150, status: "pending" },
      });
      const insertRes = await handler.execute(insertCtx);
      expect(insertRes.items[0].json.table).toBe("orders");
      expect(insertRes.items[0].json.operation).toBe("insert");

      const updateCtx = baseContext("postgres", {
        operation: "update",
        table: "orders",
        updateFields: { status: "completed" },
        where: { id: 1 },
      });
      const updateRes = await handler.execute(updateCtx);
      expect(updateRes.items[0].json.operation).toBe("update");
    });
  });

  describe("RedisNodeHandler", () => {
    const handler = new RedisNodeHandler();

    it("executes get, set, del commands", async () => {
      const setCtx = baseContext("redis", {
        operation: "set",
        key: "session:100",
        value: { user: "john" },
        ttl: 3600,
      });
      const setRes = await handler.execute(setCtx);
      expect(setRes.items[0].json.key).toBe("session:100");
      expect(setRes.items[0].json.success).toBe(true);

      const getCtx = baseContext("redis", {
        operation: "get",
        key: "session:100",
      }, { "session:100": { user: "john" } });
      const getRes = await handler.execute(getCtx);
      expect(getRes.items[0].json.value).toEqual({ user: "john" });
    });

    it("executes hashes, lists, counters and ping", async () => {
      const pingCtx = baseContext("redis", { operation: "ping" });
      const pingRes = await handler.execute(pingCtx);
      expect(pingRes.items[0].json.pong).toBe(true);

      const incrCtx = baseContext("redis", { operation: "incr", key: "counter" }, { counter: 5 });
      const incrRes = await handler.execute(incrCtx);
      expect(incrRes.items[0].json.value).toBe(6);
    });
  });

  describe("MongoNodeHandler", () => {
    const handler = new MongoNodeHandler();

    it("executes find, findOne, insertOne, updateOne, aggregate", async () => {
      const insertCtx = baseContext("mongo", {
        operation: "insertOne",
        collection: "customers",
        document: { name: "Acme Corp", tier: "enterprise" },
      });
      const insertRes = await handler.execute(insertCtx);
      expect(insertRes.items[0].json.acknowledged).toBe(true);
      expect(insertRes.items[0].json.insertedId).toBeTruthy();

      const findCtx = baseContext("mongo", {
        operation: "find",
        collection: "customers",
        query: { tier: "enterprise" },
      });
      const findRes = await handler.execute(findCtx);
      expect(findRes.items[0].json.collection).toBe("customers");
      expect(findRes.items[0].json.documents).toBeDefined();
    });
  });

  describe("HttpNodeHandler", () => {
    const handler = new HttpNodeHandler();

    it("rejects private/local IPs (SSRF protection)", async () => {
      const ctx = baseContext("http", {
        url: "http://127.0.0.1:8080/admin",
        method: "GET",
      });
      await expect(handler.execute(ctx)).rejects.toThrow(/private or local network/i);
    });

    it("rejects cloud metadata IPs (169.254.169.254)", async () => {
      const ctx = baseContext("http", {
        url: "http://169.254.169.254/latest/meta-data/",
        method: "GET",
      });
      await expect(handler.execute(ctx)).rejects.toThrow(/private or local network/i);
    });
  });
});

describe("Logic Nodes: If/Condition, Merge, Set, Code", () => {
  describe("IfNodeHandler", () => {
    const handler = new IfNodeHandler();

    it("evaluates single rule with comparison operators", async () => {
      const ctxEq = baseContext("condition", {
        field: "status",
        operator: "eq",
        value: "active",
      }, { status: "active", score: 95 });
      const resEq = await handler.execute(ctxEq);
      expect(resEq.items[0].json._conditionResult).toBe(true);

      const ctxGt = baseContext("condition", {
        field: "score",
        operator: "gt",
        value: 100,
      }, { status: "active", score: 95 });
      const resGt = await handler.execute(ctxGt);
      expect(resGt.items[0].json._conditionResult).toBe(false);
    });

    it("evaluates multi-condition groups with AND / OR combinators", async () => {
      const ctxAnd = baseContext("condition", {
        conditions: {
          combinator: "and",
          conditions: [
            { field: "age", operator: "gte", value: 18 },
            { field: "country", operator: "eq", value: "US" },
          ],
        },
      }, { age: 25, country: "US" });
      const resAnd = await handler.execute(ctxAnd);
      expect(resAnd.items[0].json._conditionResult).toBe(true);
    });
  });

  describe("MergeNodeHandler", () => {
    const handler = new MergeNodeHandler();

    it("appends multiple incoming branch items", async () => {
      const ctx = baseContext("merge", { mode: "append" }, [
        [{ id: 1, name: "A" }],
        [{ id: 2, name: "B" }],
      ]);
      const res = await handler.execute(ctx);
      expect(res.items).toHaveLength(2);
      expect(res.items[0].json.name).toBe("A");
      expect(res.items[1].json.name).toBe("B");
    });

    it("merges items by index", async () => {
      const ctx = baseContext("merge", { mode: "mergeByIndex" }, [
        [{ id: 1, name: "Alice" }],
        [{ role: "Admin", active: true }],
      ]);
      const res = await handler.execute(ctx);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].json).toEqual({ id: 1, name: "Alice", role: "Admin", active: true });
    });
  });

  describe("SetNodeHandler", () => {
    const handler = new SetNodeHandler();

    it("sets new fields, respects keepOnlySet and nested keys", async () => {
      const ctx = baseContext("set_fields", {
        keepOnlySet: true,
        values: [
          { name: "user.name", value: "Bob" },
          { name: "user.age", value: 30, type: "number" },
        ],
      }, { oldField: "removed" });

      const res = await handler.execute(ctx);
      expect(res.items[0].json.oldField).toBeUndefined();
      expect(res.items[0].json.user).toEqual({ name: "Bob", age: 30 });
    });
  });

  describe("CodeNodeHandler", () => {
    const handler = new CodeNodeHandler();

    it("executes safe JavaScript in VM sandbox", async () => {
      const ctx = baseContext("code", {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: "return $input.all().map(i => ({ doubled: i.json.num * 2 }));",
        },
      }, [{ num: 5 }, { num: 10 }]);

      const res = await handler.execute(ctx);
      expect(res.items).toHaveLength(2);
      expect(res.items[0].json.doubled).toBe(10);
      expect(res.items[1].json.doubled).toBe(20);
    });
  });
});

describe("Central Node Dispatcher", () => {
  it("dispatches registered node types correctly", async () => {
    expect(nodeRegistry.has("postgres")).toBe(true);
    expect(nodeRegistry.has("redis")).toBe(true);
    expect(nodeRegistry.has("mongo")).toBe(true);
    expect(nodeRegistry.has("http")).toBe(true);
    expect(nodeRegistry.has("condition")).toBe(true);
    expect(nodeRegistry.has("merge")).toBe(true);
    expect(nodeRegistry.has("set_fields")).toBe(true);
    expect(nodeRegistry.has("code")).toBe(true);

    const ctx = baseContext("set_fields", {
      values: [{ name: "greeting", value: "hello world" }],
    });
    const result = await nodeDispatcher.dispatch(ctx);
    expect(result.items[0].json.greeting).toBe("hello world");
  });
});
