import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createWorkflowHistory,
  canUndo,
  canRedo,
  pushSnapshot,
  undoHistory,
  redoHistory,
  MAX_WORKFLOW_HISTORY,
  isEditableElement,
  type CanvasSnapshot,
} from "../src/lib/workflow-history";
import type { WorkflowCanvasNode } from "../src/lib/workflow";

function createMockNode(id: string, label: string, x = 0, y = 0): WorkflowCanvasNode {
  return {
    id,
    type: "action",
    position: { x, y },
    data: {
      type: "http",
      label,
      description: "Mock node description",
      status: "PENDING",
      config: { url: `https://api.test/${id}` },
    },
  };
}

describe("Workflow Editor History & Undo/Redo Engine (GAP-10)", () => {
  it("initializes with empty past and future stacks", () => {
    const history = createWorkflowHistory();
    assert.equal(history.past.length, 0);
    assert.equal(history.future.length, 0);
    assert.equal(canUndo(history), false);
    assert.equal(canRedo(history), false);
  });

  it("pushes snapshots to past and clears future branch", () => {
    const history = createWorkflowHistory();
    const snap1: CanvasSnapshot = {
      nodes: [createMockNode("node-1", "Step 1")],
      edges: [],
    };

    const h1 = pushSnapshot(history, snap1);
    assert.equal(h1.past.length, 1);
    assert.equal(h1.future.length, 0);
    assert.equal(canUndo(h1), true);
    assert.equal(canRedo(h1), false);
    assert.equal(h1.past[0].nodes[0].id, "node-1");
  });

  it("enforces memory limit of 50 snapshots on past stack", () => {
    let history = createWorkflowHistory();
    const totalPushes = 65;

    for (let i = 1; i <= totalPushes; i++) {
      const snap: CanvasSnapshot = {
        nodes: [createMockNode(`node-${i}`, `Step ${i}`)],
        edges: [],
      };
      history = pushSnapshot(history, snap, MAX_WORKFLOW_HISTORY);
    }

    assert.equal(history.past.length, MAX_WORKFLOW_HISTORY);
    assert.equal(MAX_WORKFLOW_HISTORY, 50);
    // Oldest 15 snapshots should have been trimmed; first element should be node-16
    assert.equal(history.past[0].nodes[0].id, "node-16");
    // Most recent element should be node-65
    assert.equal(history.past[history.past.length - 1].nodes[0].id, "node-65");
  });

  it("handles single undo and redo cycle correctly", () => {
    const history0 = createWorkflowHistory();

    const state0: CanvasSnapshot = {
      nodes: [createMockNode("node-0", "Initial")],
      edges: [],
    };

    const state1: CanvasSnapshot = {
      nodes: [
        createMockNode("node-0", "Initial"),
        createMockNode("node-1", "Added Node"),
      ],
      edges: [{ id: "e1", source: "node-0", target: "node-1" }],
    };

    // User is at state0, performs action that leads to state1
    const history1 = pushSnapshot(history0, state0);
    assert.equal(history1.past.length, 1);
    assert.equal(canUndo(history1), true);

    // User triggers Undo from state1
    const undoResult = undoHistory(history1, state1);
    assert.notEqual(undoResult, null);
    const { newHistory: historyAfterUndo, restored: restoredState0 } = undoResult!;

    assert.equal(historyAfterUndo.past.length, 0);
    assert.equal(historyAfterUndo.future.length, 1);
    assert.equal(canUndo(historyAfterUndo), false);
    assert.equal(canRedo(historyAfterUndo), true);
    assert.equal(restoredState0.nodes.length, 1);
    assert.equal(restoredState0.nodes[0].id, "node-0");
    assert.equal(restoredState0.edges.length, 0);

    // User triggers Redo from restoredState0
    const redoResult = redoHistory(historyAfterUndo, restoredState0);
    assert.notEqual(redoResult, null);
    const { newHistory: historyAfterRedo, restored: restoredState1 } = redoResult!;

    assert.equal(historyAfterRedo.past.length, 1);
    assert.equal(historyAfterRedo.future.length, 0);
    assert.equal(canUndo(historyAfterRedo), true);
    assert.equal(canRedo(historyAfterRedo), false);
    assert.equal(restoredState1.nodes.length, 2);
    assert.equal(restoredState1.nodes[1].id, "node-1");
    assert.equal(restoredState1.edges.length, 1);
  });

  it("supports multi-step sequential undo and redo across several graph mutations", () => {
    let history = createWorkflowHistory();

    const s0: CanvasSnapshot = { nodes: [], edges: [] };
    const s1: CanvasSnapshot = { nodes: [createMockNode("A", "Node A")], edges: [] };
    const s2: CanvasSnapshot = {
      nodes: [createMockNode("A", "Node A"), createMockNode("B", "Node B")],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };
    const s3: CanvasSnapshot = {
      nodes: [
        createMockNode("A", "Node A"),
        createMockNode("B", "Node B"),
        createMockNode("C", "Node C"),
      ],
      edges: [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "C" },
      ],
    };

    history = pushSnapshot(history, s0);
    history = pushSnapshot(history, s1);
    history = pushSnapshot(history, s2);

    // Currently at s3
    assert.equal(history.past.length, 3);

    // Undo 1: s3 -> s2
    const u1 = undoHistory(history, s3)!;
    assert.equal(u1.restored.nodes.length, 2);
    assert.equal(u1.restored.nodes[1].id, "B");
    history = u1.newHistory;

    // Undo 2: s2 -> s1
    const u2 = undoHistory(history, u1.restored)!;
    assert.equal(u2.restored.nodes.length, 1);
    assert.equal(u2.restored.nodes[0].id, "A");
    history = u2.newHistory;

    // Undo 3: s1 -> s0
    const u3 = undoHistory(history, u2.restored)!;
    assert.equal(u3.restored.nodes.length, 0);
    history = u3.newHistory;

    // Further undo is blocked
    assert.equal(undoHistory(history, u3.restored), null);

    // Redo 1: s0 -> s1
    const r1 = redoHistory(history, u3.restored)!;
    assert.equal(r1.restored.nodes.length, 1);
    assert.equal(r1.restored.nodes[0].id, "A");
    history = r1.newHistory;

    // Redo 2: s1 -> s2
    const r2 = redoHistory(history, r1.restored)!;
    assert.equal(r2.restored.nodes.length, 2);
    assert.equal(r2.restored.nodes[1].id, "B");
    history = r2.newHistory;

    // Redo 3: s2 -> s3
    const r3 = redoHistory(history, r2.restored)!;
    assert.equal(r3.restored.nodes.length, 3);
    assert.equal(r3.restored.nodes[2].id, "C");
    history = r3.newHistory;

    // Further redo is blocked
    assert.equal(redoHistory(history, r3.restored), null);
  });

  it("clears redo future when a new mutation is performed after an undo", () => {
    let history = createWorkflowHistory();

    const s0: CanvasSnapshot = { nodes: [], edges: [] };
    const s1: CanvasSnapshot = { nodes: [createMockNode("A", "Node A")], edges: [] };
    const s2: CanvasSnapshot = {
      nodes: [createMockNode("A", "Node A"), createMockNode("B", "Node B")],
      edges: [],
    };

    history = pushSnapshot(history, s0);
    history = pushSnapshot(history, s1);

    // Currently at s2. Undo back to s1.
    const u1 = undoHistory(history, s2)!;
    history = u1.newHistory;
    assert.equal(history.future.length, 1);
    assert.equal(canRedo(history), true);

    // User makes an alternate mutation s3 from s1
    const s3: CanvasSnapshot = {
      nodes: [createMockNode("A", "Node A"), createMockNode("C", "Node C alternate")],
      edges: [],
    };

    history = pushSnapshot(history, u1.restored);
    // Future must be discarded
    assert.equal(history.future.length, 0);
    assert.equal(canRedo(history), false);
    assert.equal(canUndo(history), true);
  });

  it("deep clones snapshot data ensuring immutability across mutations", () => {
    const history = createWorkflowHistory();
    const liveNode = createMockNode("mutable", "Original", 100, 100);
    const snap: CanvasSnapshot = {
      nodes: [liveNode],
      edges: [{ id: "edge-1", source: "mutable", target: "target" }],
    };

    const h1 = pushSnapshot(history, snap);

    // Mutate live node in-place
    liveNode.position.x = 999;
    liveNode.data.label = "Corrupted";

    // Snapshot in past must remain pristine
    const stored = h1.past[0];
    assert.equal(stored.nodes[0].position.x, 100);
    assert.equal(stored.nodes[0].data.label, "Original");
  });

  it("correctly identifies editable HTML elements to prevent shortcut hijack", () => {
    assert.equal(isEditableElement({ tagName: "INPUT" }), true);
    assert.equal(isEditableElement({ tagName: "input" }), true);
    assert.equal(isEditableElement({ tagName: "TEXTAREA" }), true);
    assert.equal(isEditableElement({ isContentEditable: true }), true);
    assert.equal(
      isEditableElement({
        closest: (selector: string) => (selector.includes("input") ? {} : null),
      }),
      true
    );

    assert.equal(isEditableElement(null), false);
    assert.equal(isEditableElement(undefined), false);
    assert.equal(isEditableElement({ tagName: "DIV" }), false);
    assert.equal(isEditableElement({ tagName: "BUTTON" }), false);
    assert.equal(isEditableElement({ tagName: "SPAN" }), false);
  });
});
