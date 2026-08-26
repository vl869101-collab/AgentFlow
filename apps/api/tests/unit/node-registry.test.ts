import { describe, it, expect } from "vitest";
import { NodeRegistry, evaluateCondition } from "../../src/services/executor/registry.js";

describe("NodeRegistry", () => {
  it("registers and retrieves built-in node handlers", () => {
    const registry = new NodeRegistry();

    expect(registry.has("http")).toBe(true);
    expect(registry.has("code")).toBe(true);
    expect(registry.has("condition")).toBe(true);
    expect(registry.has("trigger")).toBe(true);
    expect(registry.has("evaluationTrigger")).toBe(true);

    const httpHandler = registry.get("http");
    expect(httpHandler?.category).toBe("network");
    expect(httpHandler?.defaultTimeoutMs).toBe(30000);
  });

  it("lists and filters handlers by category", () => {
    const registry = new NodeRegistry();
    const triggers = registry.getByCategory("trigger");
    expect(triggers.some((t) => t.type === "trigger")).toBe(true);
    expect(triggers.some((t) => t.type === "evaluationTrigger")).toBe(true);

    const actions = registry.getByCategory("action");
    expect(actions.some((a) => a.type === "googleDrive")).toBe(true);
  });

  it("allows custom node handler registration", async () => {
    const registry = new NodeRegistry();
    registry.register({
      type: "custom-math",
      category: "custom",
      execute: async (ctx) => {
        const a = Number((ctx.nodeConfig as any).a ?? 0);
        const b = Number((ctx.nodeConfig as any).b ?? 0);
        return { result: a + b };
      },
    });

    expect(registry.has("custom-math")).toBe(true);
    const handler = registry.get("custom-math");
    const output = await handler?.execute({
      executionId: "1",
      nodeId: "node-1",
      workflowId: "wf-1",
      orgId: "org-1",
      nodeConfig: { a: 10, b: 20 },
      input: {},
    });
    expect(output).toEqual({ result: 30 });
  });

  describe("evaluateCondition", () => {
    it("evaluates eq, neq, gt, gte, lt, lte, contains, exists", () => {
      expect(evaluateCondition({ score: 100 }, { field: "score", operator: "eq", value: 100 })).toBe(true);
      expect(evaluateCondition({ score: 100 }, { field: "score", operator: "eq", value: 50 })).toBe(false);
      expect(evaluateCondition({ score: 100 }, { field: "score", operator: "neq", value: 50 })).toBe(true);
      expect(evaluateCondition({ score: 100 }, { field: "score", operator: "gt", value: 50 })).toBe(true);
      expect(evaluateCondition({ score: 100 }, { field: "score", operator: "lt", value: 200 })).toBe(true);
      expect(evaluateCondition({ name: "agentflow" }, { field: "name", operator: "contains", value: "flow" })).toBe(true);
      expect(evaluateCondition({ tags: ["ai", "automation"] }, { field: "tags", operator: "contains", value: "ai" })).toBe(true);
      expect(evaluateCondition({ status: "active" }, { field: "status", operator: "exists" })).toBe(true);
      expect(evaluateCondition({}, { field: "status", operator: "exists" })).toBe(false);
    });
  });
});
