import { describe, it, expect } from "vitest";
import {
  importN8nWorkflow,
  createAgentFlowFromN8n,
  validateN8nWorkflow,
  N8N_SDK_CATALOG,
} from "@agentflow/shared";

describe("Upstream n8n SDK Reference, Validator & Converter", () => {
  describe("SDK Reference Catalog", () => {
    it("catalogs data nodes (postgres, redis, mongo, http)", () => {
      expect(N8N_SDK_CATALOG["n8n-nodes-base.postgres"]).toBeDefined();
      expect(N8N_SDK_CATALOG["n8n-nodes-base.postgres"].agentFlowType).toBe("postgres");
      expect(N8N_SDK_CATALOG["n8n-nodes-base.redis"].agentFlowType).toBe("redis");
      expect(N8N_SDK_CATALOG["n8n-nodes-base.mongoDb"].agentFlowType).toBe("mongo");
      expect(N8N_SDK_CATALOG["n8n-nodes-base.httpRequest"].agentFlowType).toBe("http");
    });

    it("catalogs logic nodes (if, switch, merge, set, code)", () => {
      expect(N8N_SDK_CATALOG["n8n-nodes-base.if"].agentFlowType).toBe("condition");
      expect(N8N_SDK_CATALOG["n8n-nodes-base.merge"].agentFlowType).toBe("merge");
      expect(N8N_SDK_CATALOG["n8n-nodes-base.set"].agentFlowType).toBe("set_fields");
      expect(N8N_SDK_CATALOG["n8n-nodes-base.code"].agentFlowType).toBe("code");
    });
  });

  describe("Workflow Validator", () => {
    it("validates valid n8n workflow export", () => {
      const workflow = {
        name: "Test Sync Workflow",
        nodes: [
          { name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 0] },
          { name: "Query DB", type: "n8n-nodes-base.postgres", typeVersion: 2, position: [200, 0] },
          { name: "Set Cache", type: "n8n-nodes-base.redis", typeVersion: 1, position: [400, 0] },
        ],
        connections: {
          Webhook: { main: [[{ node: "Query DB", type: "main", index: 0 }]] },
          "Query DB": { main: [[{ node: "Set Cache", type: "main", index: 0 }]] },
        },
      };

      const result = validateN8nWorkflow(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.totalNodes).toBe(3);
      expect(result.stats.totalConnections).toBe(2);
      expect(result.stats.recognizedNodes).toBe(3);
    });

    it("detects invalid JSON and missing nodes", () => {
      const invalidJson = "{ not json }";
      const res1 = validateN8nWorkflow(invalidJson);
      expect(res1.valid).toBe(false);
      expect(res1.errors[0].code).toBe("INVALID_JSON");

      const missingNodes = { name: "No nodes" };
      const res2 = validateN8nWorkflow(missingNodes);
      expect(res2.valid).toBe(false);
      expect(res2.errors[0].code).toBe("MISSING_NODES");
    });

    it("warns about unknown nodes and broken connections", () => {
      const workflow = {
        nodes: [
          { name: "Node A", type: "custom.unknown.type", typeVersion: 1, position: [0, 0] },
        ],
        connections: {
          "Node A": { main: [[{ node: "Ghost Node", type: "main", index: 0 }]] },
        },
      };

      const result = validateN8nWorkflow(workflow);
      expect(result.warnings.some((w) => w.includes("uncatalogued"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("Ghost Node"))).toBe(true);
    });
  });

  describe("Workflow Converter (n8n → AgentFlow)", () => {
    it("converts complete n8n workflow with data & logic nodes to AgentFlow model", () => {
      const n8nWorkflow = {
        name: "Order Ingestion Flow",
        active: true,
        nodes: [
          {
            id: "node-1",
            name: "HTTP Webhook",
            type: "n8n-nodes-base.webhook",
            typeVersion: 1.1,
            position: [100, 200] as [number, number],
            parameters: { path: "order-hook", httpMethod: "POST" },
          },
          {
            id: "node-2",
            name: "Insert Postgres",
            type: "n8n-nodes-base.postgres",
            typeVersion: 2.2,
            position: [300, 200] as [number, number],
            parameters: { operation: "insert", table: "orders" },
            credentials: { postgres: "cred-pg-1" },
          },
          {
            id: "node-3",
            name: "Check Amount",
            type: "n8n-nodes-base.if",
            typeVersion: 2,
            position: [500, 200] as [number, number],
            parameters: { conditions: { number: [{ value1: "={{ $json.total }}", operation: "gt", value2: 100 }] } },
          },
          {
            id: "node-4",
            name: "Cache Redis",
            type: "n8n-nodes-base.redis",
            typeVersion: 1,
            position: [700, 100] as [number, number],
            parameters: { operation: "set", key: "order:recent" },
          },
        ],
        connections: {
          "HTTP Webhook": { main: [[{ node: "Insert Postgres", type: "main", index: 0 }]] },
          "Insert Postgres": { main: [[{ node: "Check Amount", type: "main", index: 0 }]] },
          "Check Amount": { main: [[{ node: "Cache Redis", type: "main", index: 0 }]] },
        },
      };

      const result = createAgentFlowFromN8n(n8nWorkflow);
      expect(result.workflow.name).toBe("Order Ingestion Flow");
      expect(result.workflow.status).toBe("ACTIVE");
      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(3);

      const pgNode = result.nodes.find((n) => n.label === "Insert Postgres")!;
      expect(pgNode.type).toBe("postgres");
      expect(pgNode.config.originalN8nType).toBe("n8n-nodes-base.postgres");
      expect(pgNode.position).toEqual({ x: 300, y: 200 });

      const ifNode = result.nodes.find((n) => n.label === "Check Amount")!;
      expect(ifNode.type).toBe("condition");

      const redisNode = result.nodes.find((n) => n.label === "Cache Redis")!;
      expect(redisNode.type).toBe("redis");

      expect(result.credentialsRequired).toContain("postgres");
    });
  });
});
