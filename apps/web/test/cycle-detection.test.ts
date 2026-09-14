import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectCycle, wouldCreateCycle } from "../src/lib/workflow";

describe("Workflow Canvas Cycle Detection (GAP-07)", () => {
  it("rejects direct self-loop connection (source === target)", () => {
    const edges = [
      { source: "node-1", target: "node-2" },
      { source: "node-2", target: "node-3" },
    ];

    const result = detectCycle("node-2", "node-2", edges);
    assert.equal(result.hasCycle, true);
    assert.deepEqual(result.cyclePath, ["node-2", "node-2"]);
    assert.match(result.reason || "", /Auto-referência/);
    assert.equal(wouldCreateCycle("node-2", "node-2", edges), true);
  });

  it("rejects immediate 2-node cycle (A -> B, attempt B -> A)", () => {
    const edges = [{ source: "node-a", target: "node-b" }];

    const result = detectCycle("node-b", "node-a", edges);
    assert.equal(result.hasCycle, true);
    assert.deepEqual(result.cyclePath, ["node-a", "node-b"]);
    assert.match(result.reason || "", /Ciclo detectado/);
    assert.equal(wouldCreateCycle("node-b", "node-a", edges), true);
  });

  it("rejects transitive multi-node cycle (A -> B -> C -> D, attempt D -> A)", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
    ];

    const result = detectCycle("D", "A", edges);
    assert.equal(result.hasCycle, true);
    assert.deepEqual(result.cyclePath, ["A", "B", "C", "D"]);
    assert.match(result.reason || "", /A -> B -> C -> D/);
    assert.equal(wouldCreateCycle("D", "A", edges), true);
  });

  it("rejects cycle into an intermediate branch node (A -> B -> C -> D, attempt D -> B)", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
    ];

    const result = detectCycle("D", "B", edges);
    assert.equal(result.hasCycle, true);
    assert.deepEqual(result.cyclePath, ["B", "C", "D"]);
    assert.equal(wouldCreateCycle("D", "B", edges), true);
  });

  it("allows valid downstream forward connections (linear shortcut / diamond)", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ];

    // Connecting A -> C is a valid shortcut in a DAG
    const result = detectCycle("A", "C", edges);
    assert.equal(result.hasCycle, false);
    assert.equal(result.cyclePath, undefined);
    assert.equal(wouldCreateCycle("A", "C", edges), false);
  });

  it("allows valid cross-branch connection between parallel branches", () => {
    // Diamond structure: A -> B -> D, A -> C -> D
    const edges = [
      { source: "A", target: "B" },
      { source: "A", target: "C" },
      { source: "B", target: "D" },
      { source: "C", target: "D" },
    ];

    // Connecting B -> C creates no cycle (A -> B -> C -> D is still a DAG)
    const result = detectCycle("B", "C", edges);
    assert.equal(result.hasCycle, false);
    assert.equal(wouldCreateCycle("B", "C", edges), false);
  });

  it("detects cycle in diamond DAG when connecting sink to root (D -> A)", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "A", target: "C" },
      { source: "B", target: "D" },
      { source: "C", target: "D" },
    ];

    const result = detectCycle("D", "A", edges);
    assert.equal(result.hasCycle, true);
    assert.equal(wouldCreateCycle("D", "A", edges), true);
  });

  it("allows valid connections across disconnected subgraphs", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "X", target: "Y" },
    ];

    // Connecting B -> X joins two components into a single DAG
    const result = detectCycle("B", "X", edges);
    assert.equal(result.hasCycle, false);
    assert.equal(wouldCreateCycle("B", "X", edges), false);
  });

  it("handles empty graphs and missing/empty node IDs gracefully", () => {
    assert.equal(detectCycle("A", "B", []).hasCycle, false);
    assert.equal(detectCycle("", "B", [{ source: "A", target: "B" }]).hasCycle, false);
    assert.equal(detectCycle("A", "", [{ source: "A", target: "B" }]).hasCycle, false);
    assert.equal(detectCycle("", "", [{ source: "A", target: "B" }]).hasCycle, false);
  });
});
