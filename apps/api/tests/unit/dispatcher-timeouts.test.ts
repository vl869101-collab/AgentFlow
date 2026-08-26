import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeNode,
  withTimeout,
  normalizeNodes,
  normalizeEdges,
  followsConditionEdge,
  EXECUTION_TIMEOUT_MS,
  NODE_TIMEOUT_MS,
} from "../../src/services/executor/dispatcher.js";
import { NodeRegistry } from "../../src/services/executor/registry.js";
import { CircuitBreaker, CircuitBreakerOpenError } from "../../src/services/executor/circuit-breaker.js";

describe("Dispatcher & Execution Engine", () => {
  it("defaults to 30s node timeout and 5m workflow timeout constants", () => {
    expect(NODE_TIMEOUT_MS).toBe(30_000);
    expect(EXECUTION_TIMEOUT_MS).toBe(300_000);
  });

  it("withTimeout rejects with timeout error when promise takes too long", async () => {
    const slowTask = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(slowTask, 50, "Task timed out")).rejects.toThrow("Task timed out");
  });

  it("withTimeout resolves when promise completes in time", async () => {
    const fastTask = Promise.resolve("done");
    const result = await withTimeout(fastTask, 500, "Should not timeout");
    expect(result).toBe("done");
  });

  it("normalizes and validates workflow nodes and edges", () => {
    const rawNodes = [
      { id: "1", type: "trigger", config: {} },
      { id: "2", type: "set_fields", config: { score: 10 } },
    ];
    const nodes = normalizeNodes(rawNodes);
    expect(nodes.length).toBe(2);
    expect(nodes[0].id).toBe("1");

    const rawEdges = [{ source: "1", target: "2" }];
    const edges = normalizeEdges(rawEdges);
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe("1");
    expect(edges[0].target).toBe("2");
  });

  it("follows condition edge correctly based on output and condition rules", () => {
    // Boolean handle
    expect(followsConditionEdge({ source: "c", target: "t", sourceHandle: "true" }, true)).toBe(true);
    expect(followsConditionEdge({ source: "c", target: "t", sourceHandle: "true" }, false)).toBe(false);
    expect(followsConditionEdge({ source: "c", target: "f", sourceHandle: "false" }, false)).toBe(true);

    // Condition object
    const edge = {
      source: "c",
      target: "t",
      condition: { field: "age", operator: "gte", value: 18 },
    };
    expect(followsConditionEdge(edge, { age: 21 })).toBe(true);
    expect(followsConditionEdge(edge, { age: 16 })).toBe(false);
  });

  it("executes node with custom registry and circuit breaker protection", async () => {
    const registry = new NodeRegistry();
    const circuitBreaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 100 });

    let callCount = 0;
    registry.register({
      type: "unstable-api",
      category: "action",
      circuitBreakerKey: () => "api:unstable",
      execute: async () => {
        callCount++;
        throw new Error("503 Service Unavailable");
      },
    });

    const node = { id: "n1", type: "unstable-api", config: {} };

    // 1st failure
    await expect(
      executeNode(node, {}, "org-1", { registry, circuitBreaker }),
    ).rejects.toThrow("503 Service Unavailable");

    // 2nd failure -> trips circuit
    await expect(
      executeNode(node, {}, "org-1", { registry, circuitBreaker }),
    ).rejects.toThrow("503 Service Unavailable");

    // 3rd call -> rejected by CircuitBreaker immediately without executing handler
    await expect(
      executeNode(node, {}, "org-1", { registry, circuitBreaker }),
    ).rejects.toThrow(CircuitBreakerOpenError);

    expect(callCount).toBe(2);
  });
});
