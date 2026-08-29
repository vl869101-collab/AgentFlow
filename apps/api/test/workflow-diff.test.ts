import assert from "node:assert/strict";
import test from "node:test";
import {
  computeWorkflowDiff,
  normalizeSnapshotNodes,
  normalizeSnapshotEdges,
  deepEqual,
  type WorkflowSnapshot,
} from "../src/services/workflow-diff.js";

test("deepEqual correctly compares primitives, arrays, and nested objects", () => {
  assert.equal(deepEqual(1, 1), true);
  assert.equal(deepEqual("hello", "hello"), true);
  assert.equal(deepEqual(null, null), true);
  assert.equal(deepEqual(undefined, undefined), true);
  assert.equal(deepEqual(null, undefined), false);
  assert.equal(deepEqual(1, "1"), false);

  assert.equal(deepEqual([1, 2, { a: "b" }], [1, 2, { a: "b" }]), true);
  assert.equal(deepEqual([1, 2], [1, 2, 3]), false);

  assert.equal(
    deepEqual(
      { a: 1, nested: { x: [10, 20], y: true } },
      { nested: { y: true, x: [10, 20] }, a: 1 }
    ),
    true
  );
  assert.equal(
    deepEqual(
      { a: 1, nested: { x: [10, 20] } },
      { a: 1, nested: { x: [10, 21] } }
    ),
    false
  );
});

test("normalizeSnapshotNodes handles undefined or heterogeneous node definitions", () => {
  assert.deepEqual(normalizeSnapshotNodes(undefined), []);
  assert.deepEqual(normalizeSnapshotNodes({} as WorkflowSnapshot), []);

  const normalized = normalizeSnapshotNodes({
    nodes: [
      { id: "node-1", type: "webhook", label: "Webhook In", config: { path: "/test" } },
      { nodeId: "node-2", data: { type: "code", label: "JS Sandbox", config: { code: "return 1;" } } } as any,
    ],
  });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]?.id, "node-1");
  assert.equal(normalized[0]?.type, "webhook");
  assert.equal(normalized[1]?.id, "node-2");
  assert.equal(normalized[1]?.type, "code");
  assert.equal(normalized[1]?.label, "JS Sandbox");
});

test("normalizeSnapshotEdges standardizes edges with source/target aliases", () => {
  assert.deepEqual(normalizeSnapshotEdges(undefined), []);

  const normalized = normalizeSnapshotEdges({
    edges: [
      { id: "e1", source: "n1", target: "n2", condition: { op: "equals" } },
      { sourceNodeId: "n2", targetNodeId: "n3", label: "onSuccess" } as any,
    ],
  });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]?.id, "e1");
  assert.equal(normalized[0]?.source, "n1");
  assert.equal(normalized[0]?.target, "n2");
  assert.equal(normalized[1]?.source, "n2");
  assert.equal(normalized[1]?.target, "n3");
  assert.equal(normalized[1]?.label, "onSuccess");
});

test("computeWorkflowDiff detects added, removed, and modified nodes", () => {
  const v1: WorkflowSnapshot = {
    nodes: [
      { id: "n1", type: "webhook", label: "Initial Trigger", config: { url: "https://a.com" }, position: { x: 0, y: 0 } },
      { id: "n2", type: "http", label: "Call API", config: { timeout: 5000 }, position: { x: 100, y: 0 } },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  };

  const v2: WorkflowSnapshot = {
    nodes: [
      // n1 modified in label, config, position
      { id: "n1", type: "webhook", label: "Updated Trigger", config: { url: "https://b.com" }, position: { x: 10, y: 20 } },
      // n2 removed, n3 added
      { id: "n3", type: "ai_agent", label: "AI Processor", config: { model: "claude-sonnet-4-6" }, position: { x: 200, y: 50 } },
    ],
    edges: [{ id: "e2", source: "n1", target: "n3" }],
  };

  const diff = computeWorkflowDiff(v1, v2);

  // Nodes summary
  assert.equal(diff.nodesAdded.length, 1);
  assert.equal(diff.nodesAdded[0]?.id, "n3");
  assert.equal(diff.nodesRemoved.length, 1);
  assert.equal(diff.nodesRemoved[0]?.id, "n2");

  assert.equal(diff.nodesModified.length, 1);
  assert.equal(diff.nodesModified[0]?.nodeId, "n1");
  const changedFields = diff.nodesModified[0]?.changes.map((c) => c.field).sort();
  assert.deepEqual(changedFields, ["config", "label", "position"]);

  // Edges summary
  assert.equal(diff.edgesAdded.length, 1);
  assert.equal(diff.edgesAdded[0]?.id, "e2");
  assert.equal(diff.edgesRemoved.length, 1);
  assert.equal(diff.edgesRemoved[0]?.id, "e1");

  // Summary counts
  assert.equal(diff.summary.nodesAddedCount, 1);
  assert.equal(diff.summary.nodesRemovedCount, 1);
  assert.equal(diff.summary.nodesModifiedCount, 1);
  assert.equal(diff.summary.edgesAddedCount, 1);
  assert.equal(diff.summary.edgesRemovedCount, 1);
  assert.equal(diff.summary.totalChanges, 5);
  assert.equal(diff.summary.hasBreakingChanges, true);
});

test("computeWorkflowDiff generates visual comparison markers and maps", () => {
  const v1: WorkflowSnapshot = {
    nodes: [
      { id: "node-keep", type: "condition", config: { rule: "1 > 0" } },
      { id: "node-delete", type: "email", config: { to: "user@test.com" } },
    ],
    edges: [
      { id: "edge-keep", source: "node-keep", target: "node-delete", condition: { val: 1 } },
    ],
  };

  const v2: WorkflowSnapshot = {
    nodes: [
      { id: "node-keep", type: "condition", config: { rule: "1 > 2" } }, // modified config
      { id: "node-new", type: "slack", config: { channel: "#general" } }, // added
    ],
    edges: [
      { id: "edge-keep", source: "node-keep", target: "node-delete", condition: { val: 2 } }, // modified condition
      { id: "edge-new", source: "node-keep", target: "node-new" }, // added
    ],
  };

  const diff = computeWorkflowDiff(v1, v2);

  // Visual Node Map
  assert.ok(diff.visualMap.nodes["node-new"]);
  assert.equal(diff.visualMap.nodes["node-new"]?.status, "added");
  assert.equal(diff.visualMap.nodes["node-new"]?.badgeLabel, "+ ADDED");
  assert.match(diff.visualMap.nodes["node-new"]?.styleClass ?? "", /emerald/);

  assert.ok(diff.visualMap.nodes["node-delete"]);
  assert.equal(diff.visualMap.nodes["node-delete"]?.status, "removed");
  assert.equal(diff.visualMap.nodes["node-delete"]?.badgeLabel, "− REMOVED");
  assert.match(diff.visualMap.nodes["node-delete"]?.styleClass ?? "", /rose/);

  assert.ok(diff.visualMap.nodes["node-keep"]);
  assert.equal(diff.visualMap.nodes["node-keep"]?.status, "modified");
  assert.equal(diff.visualMap.nodes["node-keep"]?.badgeLabel, "~ MODIFIED");
  assert.deepEqual(diff.visualMap.nodes["node-keep"]?.changedFields, ["config"]);
  assert.match(diff.visualMap.nodes["node-keep"]?.styleClass ?? "", /amber/);

  // Visual Edge Map
  assert.ok(diff.visualMap.edges["edge-new"]);
  assert.equal(diff.visualMap.edges["edge-new"]?.status, "added");
  assert.equal(diff.visualMap.edges["edge-new"]?.strokeColor, "#10b981");

  assert.ok(diff.visualMap.edges["edge-keep"]);
  assert.equal(diff.visualMap.edges["edge-keep"]?.status, "modified");
  assert.equal(diff.visualMap.edges["edge-keep"]?.strokeColor, "#f59e0b");
  assert.deepEqual(diff.visualMap.edges["edge-keep"]?.changedFields, ["condition"]);
});

test("computeWorkflowDiff accurately detects breaking changes vs non-breaking edits", () => {
  // Non-breaking edit: only label & config changed, no removals, no node type changes
  const base: WorkflowSnapshot = {
    nodes: [{ id: "n1", type: "http", label: "v1", config: { retry: 1 } }],
    edges: [{ id: "e1", source: "n1", target: "n1" }],
  };

  const nonBreaking: WorkflowSnapshot = {
    nodes: [{ id: "n1", type: "http", label: "v2", config: { retry: 3 } }],
    edges: [{ id: "e1", source: "n1", target: "n1" }],
  };

  const diffNonBreaking = computeWorkflowDiff(base, nonBreaking);
  assert.equal(diffNonBreaking.summary.hasBreakingChanges, false);
  assert.equal(diffNonBreaking.summary.totalChanges, 1); // 1 node modified

  // Breaking edit: node type modified
  const breakingType: WorkflowSnapshot = {
    nodes: [{ id: "n1", type: "code", label: "v1", config: { retry: 1 } }],
    edges: [{ id: "e1", source: "n1", target: "n1" }],
  };
  const diffBreakingType = computeWorkflowDiff(base, breakingType);
  assert.equal(diffBreakingType.summary.hasBreakingChanges, true);
});
