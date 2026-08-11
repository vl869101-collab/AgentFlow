"use client";

import { useCallback } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, type Edge, type OnEdgesChange, type OnNodesChange } from "@xyflow/react";
import { NODE_TYPES } from "@agentflow/shared";
import { cn } from "@/lib/utils";
import { getNodeMeta, type NodeTypeKey, type WorkflowCanvasNode } from "@/lib/workflow";
import { ActionNode } from "./nodes/ActionNode";
import { AdvancedNode } from "./nodes/AdvancedNode";
import { LogicNode } from "./nodes/LogicNode";
import { TriggerNode } from "./nodes/TriggerNode";
import type { OnConnect } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

const nodeTypes = { trigger: TriggerNode, action: ActionNode, logic: LogicNode, advanced: AdvancedNode };

function CanvasInner({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onSelectNode, onCreateNode }: { nodes: WorkflowCanvasNode[]; edges: Edge[]; onNodesChange: OnNodesChange<WorkflowCanvasNode>; onEdgesChange: OnEdgesChange; onConnect: OnConnect; onSelectNode: (id?: string) => void; onCreateNode: (type: NodeTypeKey, position: { x: number; y: number }) => void }) {
  const { screenToFlowPosition } = useReactFlow();

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow") as NodeTypeKey;
    if (!NODE_TYPES.some((definition) => definition.type === type)) return;
    onCreateNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [onCreateNode, screenToFlowPosition]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return <div className="relative h-full min-h-[560px] w-full overflow-hidden bg-zinc-950" onDrop={onDrop} onDragOver={onDragOver}><svg className="absolute h-0 w-0"><defs><linearGradient id="edge-gradient" x1="0" x2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="50%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#d946ef" /></linearGradient></defs></svg><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => onSelectNode(node.id)} onPaneClick={() => onSelectNode(undefined)} fitView fitViewOptions={{ padding: 0.2 }} defaultEdgeOptions={{ animated: true, style: { stroke: "url(#edge-gradient)", strokeWidth: 2 } }} proOptions={{ hideAttribution: true }} minZoom={0.35} maxZoom={1.6}><Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#3f3f46" /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => { const data = node.data as { type?: NodeTypeKey }; return data.type ? getNodeMeta(data.type).color : "#52525b"; }} maskColor="rgb(9 9 11 / 0.75)" /><Panel position="top-right" className={cn("rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-[11px] text-zinc-500 backdrop-blur-xl")}>Drag from a handle to connect</Panel></ReactFlow></div>;
}

export function WorkflowCanvas(props: { nodes: WorkflowCanvasNode[]; edges: Edge[]; onNodesChange: OnNodesChange<WorkflowCanvasNode>; onEdgesChange: OnEdgesChange; onConnect: OnConnect; onSelectNode: (id?: string) => void; onCreateNode: (type: NodeTypeKey, position: { x: number; y: number }) => void }) {
  return <ReactFlowProvider><CanvasInner {...props} /></ReactFlowProvider>;
}
