export interface WorkflowNodeSnapshot {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface WorkflowEdgeSnapshot {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: unknown;
  [key: string]: unknown;
}

export interface WorkflowSnapshot {
  nodes?: WorkflowNodeSnapshot[];
  edges?: WorkflowEdgeSnapshot[];
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface NodeModificationDiff {
  nodeId: string;
  type: string;
  changes: FieldDiff[];
}

export interface EdgeModificationDiff {
  edgeId?: string;
  source: string;
  target: string;
  changes: FieldDiff[];
}

export interface VisualNodeDiffMarker {
  nodeId: string;
  status: "added" | "removed" | "modified" | "unchanged";
  styleClass: string;
  badgeLabel: string;
  changedFields: string[];
}

export interface VisualEdgeDiffMarker {
  edgeId?: string;
  source: string;
  target: string;
  status: "added" | "removed" | "modified" | "unchanged";
  styleClass: string;
  strokeColor: string;
  changedFields: string[];
}

export interface WorkflowVisualDiffMap {
  nodes: Record<string, VisualNodeDiffMarker>;
  edges: Record<string, VisualEdgeDiffMarker>;
}

export interface WorkflowDiffResult {
  nodesAdded: WorkflowNodeSnapshot[];
  nodesRemoved: WorkflowNodeSnapshot[];
  nodesModified: NodeModificationDiff[];
  edgesAdded: WorkflowEdgeSnapshot[];
  edgesRemoved: WorkflowEdgeSnapshot[];
  edgesModified: EdgeModificationDiff[];
  visualMap: WorkflowVisualDiffMap;
  summary: {
    totalChanges: number;
    nodesAddedCount: number;
    nodesRemovedCount: number;
    nodesModifiedCount: number;
    edgesAddedCount: number;
    edgesRemovedCount: number;
    edgesModifiedCount: number;
    hasBreakingChanges: boolean;
  };
}

export function normalizeSnapshotNodes(snapshot?: WorkflowSnapshot): WorkflowNodeSnapshot[] {
  if (!snapshot || !Array.isArray(snapshot.nodes)) return [];
  return snapshot.nodes.map((n: any) => ({
    id: String(n.id ?? n.nodeId ?? ""),
    type: String(n.type ?? n.data?.type ?? ""),
    label: n.label ?? n.data?.label,
    config: n.config ?? n.data?.config ?? {},
    position: n.position ?? { x: 0, y: 0 },
    width: n.width,
    height: n.height,
  }));
}

export function normalizeSnapshotEdges(snapshot?: WorkflowSnapshot): WorkflowEdgeSnapshot[] {
  if (!snapshot || !Array.isArray(snapshot.edges)) return [];
  return snapshot.edges.map((e: any) => ({
    id: e.id ? String(e.id) : undefined,
    source: String(e.source ?? e.sourceNodeId ?? ""),
    target: String(e.target ?? e.targetNodeId ?? ""),
    sourceHandle: e.sourceHandle !== undefined ? String(e.sourceHandle) : undefined,
    targetHandle: e.targetHandle !== undefined ? String(e.targetHandle) : undefined,
    label: e.label !== undefined ? String(e.label) : undefined,
    condition: e.condition,
  }));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

export function computeWorkflowDiff(
  v1Snapshot?: WorkflowSnapshot,
  v2Snapshot?: WorkflowSnapshot
): WorkflowDiffResult {
  const v1Nodes = normalizeSnapshotNodes(v1Snapshot);
  const v2Nodes = normalizeSnapshotNodes(v2Snapshot);

  const v1Edges = normalizeSnapshotEdges(v1Snapshot);
  const v2Edges = normalizeSnapshotEdges(v2Snapshot);

  const v1NodeMap = new Map(v1Nodes.map((n) => [n.id, n]));
  const v2NodeMap = new Map(v2Nodes.map((n) => [n.id, n]));

  // 1. Nodes Added & Removed
  const nodesAdded: WorkflowNodeSnapshot[] = [];
  const nodesRemoved: WorkflowNodeSnapshot[] = [];
  const nodesModified: NodeModificationDiff[] = [];

  for (const node of v2Nodes) {
    if (!v1NodeMap.has(node.id)) {
      nodesAdded.push(node);
    }
  }

  for (const node of v1Nodes) {
    if (!v2NodeMap.has(node.id)) {
      nodesRemoved.push(node);
    }
  }

  // 2. Nodes Modified
  for (const node of v2Nodes) {
    const oldNode = v1NodeMap.get(node.id);
    if (!oldNode) continue;

    const changes: FieldDiff[] = [];

    if (node.type !== oldNode.type) {
      changes.push({ field: "type", oldValue: oldNode.type, newValue: node.type });
    }
    if (node.label !== oldNode.label) {
      changes.push({ field: "label", oldValue: oldNode.label, newValue: node.label });
    }
    if (!deepEqual(node.config, oldNode.config)) {
      changes.push({ field: "config", oldValue: oldNode.config, newValue: node.config });
    }
    if (!deepEqual(node.position, oldNode.position)) {
      changes.push({ field: "position", oldValue: oldNode.position, newValue: node.position });
    }
    if (node.width !== oldNode.width) {
      changes.push({ field: "width", oldValue: oldNode.width, newValue: node.width });
    }
    if (node.height !== oldNode.height) {
      changes.push({ field: "height", oldValue: oldNode.height, newValue: node.height });
    }

    if (changes.length > 0) {
      nodesModified.push({
        nodeId: node.id,
        type: node.type,
        changes,
      });
    }
  }

  // 3. Edges Added, Removed, Modified
  const edgeKey = (e: WorkflowEdgeSnapshot) => e.id
    ? `id:${e.id}`
    : `path:${e.source}->${e.target}`;
  const v1EdgeMap = new Map<string, WorkflowEdgeSnapshot>();
  for (const e of v1Edges) v1EdgeMap.set(edgeKey(e), e);

  const v2EdgeMap = new Map<string, WorkflowEdgeSnapshot>();
  for (const e of v2Edges) v2EdgeMap.set(edgeKey(e), e);

  const edgesAdded: WorkflowEdgeSnapshot[] = [];
  const edgesRemoved: WorkflowEdgeSnapshot[] = [];
  const edgesModified: EdgeModificationDiff[] = [];

  for (const edge of v2Edges) {
    const key = edgeKey(edge);
    if (!v1EdgeMap.has(key)) {
      edgesAdded.push(edge);
    }
  }

  for (const edge of v1Edges) {
    const key = edgeKey(edge);
    if (!v2EdgeMap.has(key)) {
      edgesRemoved.push(edge);
    }
  }

  for (const edge of v2Edges) {
    const key = edgeKey(edge);
    const oldEdge = v1EdgeMap.get(key);
    if (!oldEdge) continue;

    const changes: FieldDiff[] = [];
    if (edge.source !== oldEdge.source) {
      changes.push({ field: "source", oldValue: oldEdge.source, newValue: edge.source });
    }
    if (edge.target !== oldEdge.target) {
      changes.push({ field: "target", oldValue: oldEdge.target, newValue: edge.target });
    }
    if (edge.sourceHandle !== oldEdge.sourceHandle) {
      changes.push({ field: "sourceHandle", oldValue: oldEdge.sourceHandle, newValue: edge.sourceHandle });
    }
    if (edge.targetHandle !== oldEdge.targetHandle) {
      changes.push({ field: "targetHandle", oldValue: oldEdge.targetHandle, newValue: edge.targetHandle });
    }
    if (!deepEqual(edge.condition, oldEdge.condition)) {
      changes.push({ field: "condition", oldValue: oldEdge.condition, newValue: edge.condition });
    }
    if (edge.label !== oldEdge.label) {
      changes.push({ field: "label", oldValue: oldEdge.label, newValue: edge.label });
    }

    if (changes.length > 0) {
      edgesModified.push({
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        changes,
      });
    }
  }

  // 4. Generate Visual Diff Map for UI Overlays
  const visualNodes: Record<string, VisualNodeDiffMarker> = {};
  for (const node of nodesAdded) {
    visualNodes[node.id] = {
      nodeId: node.id,
      status: "added",
      styleClass: "ring-2 ring-emerald-500 bg-emerald-950/30 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]",
      badgeLabel: "+ ADDED",
      changedFields: ["all"],
    };
  }
  for (const node of nodesRemoved) {
    visualNodes[node.id] = {
      nodeId: node.id,
      status: "removed",
      styleClass: "ring-2 ring-rose-500 bg-rose-950/30 border-rose-500/80 opacity-70 line-through shadow-[0_0_15px_rgba(244,63,94,0.25)]",
      badgeLabel: "− REMOVED",
      changedFields: ["all"],
    };
  }
  for (const mod of nodesModified) {
    const fields = mod.changes.map((c) => c.field);
    visualNodes[mod.nodeId] = {
      nodeId: mod.nodeId,
      status: "modified",
      styleClass: "ring-2 ring-amber-500 bg-amber-950/30 border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.25)]",
      badgeLabel: "~ MODIFIED",
      changedFields: fields,
    };
  }

  const visualEdges: Record<string, VisualEdgeDiffMarker> = {};
  for (const edge of edgesAdded) {
    const key = edge.id ?? `${edge.source}->${edge.target}`;
    visualEdges[key] = {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      status: "added",
      styleClass: "stroke-emerald-400 stroke-2",
      strokeColor: "#10b981",
      changedFields: ["all"],
    };
  }
  for (const edge of edgesRemoved) {
    const key = edge.id ?? `${edge.source}->${edge.target}`;
    visualEdges[key] = {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      status: "removed",
      styleClass: "stroke-rose-400 stroke-2 stroke-dasharray-4",
      strokeColor: "#f43f5e",
      changedFields: ["all"],
    };
  }
  for (const edge of edgesModified) {
    const key = edge.edgeId ?? `${edge.source}->${edge.target}`;
    visualEdges[key] = {
      edgeId: edge.edgeId,
      source: edge.source,
      target: edge.target,
      status: "modified",
      styleClass: "stroke-amber-400 stroke-2",
      strokeColor: "#f59e0b",
      changedFields: edge.changes.map((c) => c.field),
    };
  }

  const totalChanges =
    nodesAdded.length +
    nodesRemoved.length +
    nodesModified.length +
    edgesAdded.length +
    edgesRemoved.length +
    edgesModified.length;

  const hasBreakingChanges =
    nodesRemoved.length > 0 ||
    edgesRemoved.length > 0 ||
    nodesModified.some((m) => m.changes.some((c) => c.field === "type"));

  return {
    nodesAdded,
    nodesRemoved,
    nodesModified,
    edgesAdded,
    edgesRemoved,
    edgesModified,
    visualMap: {
      nodes: visualNodes,
      edges: visualEdges,
    },
    summary: {
      totalChanges,
      nodesAddedCount: nodesAdded.length,
      nodesRemovedCount: nodesRemoved.length,
      nodesModifiedCount: nodesModified.length,
      edgesAddedCount: edgesAdded.length,
      edgesRemovedCount: edgesRemoved.length,
      edgesModifiedCount: edgesModified.length,
      hasBreakingChanges,
    },
  };
}
