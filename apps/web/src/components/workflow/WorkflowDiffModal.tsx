"use client";

import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Columns2,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import type { VisualEdgeDiffMarker, VisualNodeDiffMarker, WorkflowDiff, WorkflowVersion } from "@/lib/api";
import {
  getNodeMeta,
  nodeKindFor,
  type NodeTypeKey,
  type WorkflowCanvasNode,
} from "@/lib/workflow";
import { ActionNode } from "./nodes/ActionNode";
import { AdvancedNode } from "./nodes/AdvancedNode";
import { LogicNode } from "./nodes/LogicNode";
import { TriggerNode } from "./nodes/TriggerNode";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const diffNodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  logic: LogicNode,
  advanced: AdvancedNode,
};

interface WorkflowDiffModalProps {
  open: boolean;
  onClose: () => void;
  diff?: WorkflowDiff;
  fromVersionData?: WorkflowVersion;
  toVersionData?: WorkflowVersion;
  workflowName?: string;
}

function snapshotToCanvasNodes(
  rawNodes?: Array<Record<string, unknown>>,
  visualNodeMap?: Record<string, VisualNodeDiffMarker>,
  side: "left" | "right" = "right"
): WorkflowCanvasNode[] {
  if (!rawNodes || !Array.isArray(rawNodes)) return [];

  return rawNodes.map((n: any, idx) => {
    const id = String(n.id ?? n.nodeId ?? `node-${idx}`);
    const type = (n.type ?? n.data?.type ?? "webhook") as NodeTypeKey;
    const kind = nodeKindFor(type);
    const label = String(n.label ?? n.data?.label ?? getNodeMeta(type).label);
    const description = String(n.description ?? n.data?.description ?? "");
    const config = (n.config ?? n.data?.config ?? {}) as Record<string, string | number | boolean>;
    const pos = n.position ?? { x: 100 + (idx % 3) * 260, y: 100 + Math.floor(idx / 3) * 160 };

    let diffMarker = visualNodeMap?.[id];
    // In left view (v1), added nodes in v2 don't exist here. Removed nodes are present.
    // In right view (v2), removed nodes in v1 don't exist here. Added nodes are present.
    if (!diffMarker) {
      diffMarker = {
        nodeId: id,
        status: "unchanged",
        styleClass: "border-zinc-800 opacity-90",
        badgeLabel: "UNCHANGED",
        changedFields: [],
      };
    }

    return {
      id,
      type: kind,
      position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
      data: {
        type,
        label,
        description,
        config,
        diffMarker,
      },
    };
  });
}

function snapshotToCanvasEdges(
  rawEdges?: Array<Record<string, unknown>>,
  visualEdgeMap?: Record<string, VisualEdgeDiffMarker>
): Edge[] {
  if (!rawEdges || !Array.isArray(rawEdges)) return [];

  return rawEdges.map((e: any, idx) => {
    const id = String(e.id ?? `edge-${idx}`);
    const source = String(e.source ?? e.sourceNodeId ?? "");
    const target = String(e.target ?? e.targetNodeId ?? "");
    const sourceHandle = e.sourceHandle ? String(e.sourceHandle) : undefined;
    const targetHandle = e.targetHandle ? String(e.targetHandle) : undefined;
    const label = e.label ? String(e.label) : undefined;

    const markerKey = e.id ? String(e.id) : `${source}->${target}`;
    const marker = visualEdgeMap?.[markerKey] ?? visualEdgeMap?.[id];

    let stroke = "#8b5cf6";
    let strokeDasharray: string | undefined;

    if (marker?.status === "added") {
      stroke = "#10b981";
    } else if (marker?.status === "removed") {
      stroke = "#f43f5e";
      strokeDasharray = "4 4";
    } else if (marker?.status === "modified") {
      stroke = "#f59e0b";
    }

    return {
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      label,
      animated: marker?.status === "added" || marker?.status === "modified",
      style: {
        stroke,
        strokeWidth: marker?.status === "unchanged" ? 1.5 : 2.5,
        strokeDasharray,
      },
    };
  });
}

function DiffCanvasPane({
  title,
  versionNumber,
  nodes,
  edges,
  badgeText,
  badgeColor,
}: {
  title: string;
  versionNumber: number;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
  badgeText: string;
  badgeColor: string;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-200">{title}</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
            v{versionNumber}
          </span>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", badgeColor)}>
          {badgeText}
        </span>
      </div>

      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={diffNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1.2}
            color="rgba(255, 255, 255, 0.08)"
          />
          <Controls showInteractive={false} aria-label="Diff view zoom and pan controls" />
          <MiniMap
            nodeColor={(n) => {
              const data = n.data as { type?: NodeTypeKey; diffMarker?: VisualNodeDiffMarker };
              if (data.diffMarker?.status === "added") return "#10b981";
              if (data.diffMarker?.status === "removed") return "#f43f5e";
              if (data.diffMarker?.status === "modified") return "#f59e0b";
              return data.type ? getNodeMeta(data.type).color : "#52525b";
            }}
            maskColor="rgb(9 9 11 / 0.8)"
            aria-label="Diff minimap"
          />
          <Panel
            position="bottom-left"
            className="rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1 text-[10px] text-zinc-400 backdrop-blur-md"
          >
            {nodes.length} nodes · {edges.length} edges
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

export function WorkflowDiffModal({
  open,
  onClose,
  diff,
  fromVersionData,
  toVersionData,
  workflowName,
}: WorkflowDiffModalProps) {
  const [selectedTab, setSelectedTab] = useState<"visual" | "changes">("visual");

  const leftNodes = useMemo(() => {
    return snapshotToCanvasNodes(
      fromVersionData?.snapshot?.nodes as any,
      diff?.visualMap?.nodes,
      "left"
    );
  }, [fromVersionData, diff]);

  const leftEdges = useMemo(() => {
    return snapshotToCanvasEdges(
      fromVersionData?.snapshot?.edges as any,
      diff?.visualMap?.edges
    );
  }, [fromVersionData, diff]);

  const rightNodes = useMemo(() => {
    return snapshotToCanvasNodes(
      toVersionData?.snapshot?.nodes as any,
      diff?.visualMap?.nodes,
      "right"
    );
  }, [toVersionData, diff]);

  const rightEdges = useMemo(() => {
    return snapshotToCanvasEdges(
      toVersionData?.snapshot?.edges as any,
      diff?.visualMap?.edges
    );
  }, [toVersionData, diff]);

  if (!open || !diff) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Workflow Visual Diff"
    >
      <div className="flex h-[90vh] w-full max-w-7xl flex-col rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl shadow-black/90 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/80 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Columns2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">
                  Visual Side-by-Side Diff
                </h2>
                {workflowName ? (
                  <span className="text-xs text-zinc-400">({workflowName})</span>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono text-zinc-300">v{diff.fromVersion}</span>
                <ArrowRight className="h-3 w-3 text-zinc-500" />
                <span className="font-mono text-zinc-300">v{diff.toVersion}</span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-400">
                  {diff.summary.totalChanges} total modifications
                </span>
                {diff.summary.hasBreakingChanges ? (
                  <Badge status="error" className="ml-1 text-[10px]">
                    Breaking changes detected
                  </Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Compatible
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-white/10 bg-zinc-900 p-0.5">
              <button
                type="button"
                onClick={() => setSelectedTab("visual")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedTab === "visual"
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Columns2 className="h-3.5 w-3.5" />
                Graphical Flow
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab("changes")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedTab === "changes"
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Changes Breakdown ({diff.summary.totalChanges})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close diff modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Change Stats Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-white/10 bg-zinc-900/40 px-6 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
            <span className="text-zinc-400">Added:</span>
            <span className="font-mono font-bold text-emerald-400">
              +{diff.summary.nodesAddedCount + diff.summary.edgesAddedCount}
            </span>
            <span className="text-[10px] text-zinc-500">
              ({diff.summary.nodesAddedCount} nodes, {diff.summary.edgesAddedCount} edges)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/20" />
            <span className="text-zinc-400">Removed:</span>
            <span className="font-mono font-bold text-rose-400">
              −{diff.summary.nodesRemovedCount + diff.summary.edgesRemovedCount}
            </span>
            <span className="text-[10px] text-zinc-500">
              ({diff.summary.nodesRemovedCount} nodes, {diff.summary.edgesRemovedCount} edges)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
            <span className="text-zinc-400">Modified:</span>
            <span className="font-mono font-bold text-amber-400">
              ~{diff.summary.nodesModifiedCount + diff.summary.edgesModifiedCount}
            </span>
            <span className="text-[10px] text-zinc-500">
              ({diff.summary.nodesModifiedCount} nodes, {diff.summary.edgesModifiedCount} edges)
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 text-right">
            <span className="text-[11px] text-zinc-400">Visual markers active</span>
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-ping" />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-4">
          {selectedTab === "visual" ? (
            <div className="grid h-full grid-cols-1 md:grid-cols-2 gap-4">
              <ReactFlowProvider>
                <DiffCanvasPane
                  title="Base Snapshot (Previous)"
                  versionNumber={diff.fromVersion}
                  nodes={leftNodes}
                  edges={leftEdges}
                  badgeText={`Base v${diff.fromVersion}`}
                  badgeColor="bg-zinc-800 text-zinc-300 border border-zinc-700"
                />
              </ReactFlowProvider>

              <ReactFlowProvider>
                <DiffCanvasPane
                  title="Target Snapshot (Newer)"
                  versionNumber={diff.toVersion}
                  nodes={rightNodes}
                  edges={rightEdges}
                  badgeText={`Target v${diff.toVersion}`}
                  badgeColor="bg-violet-950/60 text-violet-300 border border-violet-700/60"
                />
              </ReactFlowProvider>
            </div>
          ) : (
            <div className="h-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/30 p-6">
              <div className="max-w-4xl space-y-6">
                {/* Node Additions */}
                {diff.nodesAdded.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs">
                        +
                      </span>
                      Added Nodes ({diff.nodesAdded.length})
                    </h3>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {diff.nodesAdded.map((n) => (
                        <div
                          key={`added-${String(n.id)}`}
                          className="rounded-lg border border-emerald-500/20 bg-zinc-900/80 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">
                              {String(n.label ?? n.id)}
                            </span>
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                              {String(n.type)}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-zinc-500">ID: {String(n.id)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Node Removals */}
                {diff.nodesRemoved.length > 0 && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-400">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-xs">
                        −
                      </span>
                      Removed Nodes ({diff.nodesRemoved.length})
                    </h3>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {diff.nodesRemoved.map((n) => (
                        <div
                          key={`removed-${String(n.id)}`}
                          className="rounded-lg border border-rose-500/20 bg-zinc-900/80 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white line-through opacity-80">
                              {String(n.label ?? n.id)}
                            </span>
                            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
                              {String(n.type)}
                            </span>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-zinc-500">ID: {String(n.id)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Node Modifications */}
                {diff.nodesModified.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-xs">
                        ~
                      </span>
                      Modified Nodes ({diff.nodesModified.length})
                    </h3>
                    <div className="mt-3 space-y-3">
                      {diff.nodesModified.map((mod) => (
                        <div
                          key={`mod-${mod.nodeId}`}
                          className="rounded-lg border border-amber-500/20 bg-zinc-900/80 p-3"
                        >
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="font-mono text-xs font-semibold text-amber-300">
                              Node {mod.nodeId} ({mod.type})
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {mod.changes.length} field change(s)
                            </span>
                          </div>
                          <div className="mt-2 space-y-1.5 text-xs">
                            {mod.changes.map((change, cIdx) => (
                              <div
                                key={`mod-change-${cIdx}`}
                                className="flex items-center justify-between rounded bg-white/[0.02] px-2 py-1 font-mono text-[11px]"
                              >
                                <span className="font-semibold text-zinc-300">{change.field}:</span>
                                <div className="flex items-center gap-2 text-right">
                                  <span className="text-rose-400 line-through">
                                    {typeof change.oldValue === "object"
                                      ? JSON.stringify(change.oldValue)
                                      : String(change.oldValue ?? "none")}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-zinc-500" />
                                  <span className="text-emerald-400">
                                    {typeof change.newValue === "object"
                                      ? JSON.stringify(change.newValue)
                                      : String(change.newValue ?? "none")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Edge Changes */}
                {(diff.edgesAdded.length > 0 || diff.edgesRemoved.length > 0 || diff.edgesModified.length > 0) && (
                  <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
                    <h3 className="text-sm font-semibold text-zinc-300">Connections & Edges</h3>
                    <ul className="mt-3 divide-y divide-white/5 text-xs font-mono">
                      {diff.edgesAdded.map((e, idx) => (
                        <li key={`ea-${idx}`} className="flex items-center gap-2 py-2 text-emerald-400">
                          <span>+ Connection:</span>
                          <span>{String(e.source)} → {String(e.target)}</span>
                          {e.label ? <span className="text-zinc-500">({String(e.label)})</span> : null}
                        </li>
                      ))}
                      {diff.edgesRemoved.map((e, idx) => (
                        <li key={`er-${idx}`} className="flex items-center gap-2 py-2 text-rose-400 line-through">
                          <span>− Connection:</span>
                          <span>{String(e.source)} → {String(e.target)}</span>
                        </li>
                      ))}
                      {diff.edgesModified.map((e, idx) => (
                        <li key={`em-${idx}`} className="flex items-center gap-2 py-2 text-amber-400">
                          <span>~ Connection:</span>
                          <span>{String(e.source)} → {String(e.target)}</span>
                          <span className="text-zinc-400">
                            ({e.changes.map((c) => c.field).join(", ")})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
