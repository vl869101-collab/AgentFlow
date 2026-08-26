"use client";

import { useCallback } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  useReactFlow,
} from "@xyflow/react";
import { NODE_TYPES } from "@agentflow/shared";
import { cn } from "@/lib/utils";
import { getNodeMeta, type NodeTypeKey, type WorkflowCanvasNode } from "@/lib/workflow";
import { ActionNode } from "./nodes/ActionNode";
import { AdvancedNode } from "./nodes/AdvancedNode";
import { LogicNode } from "./nodes/LogicNode";
import { TriggerNode } from "./nodes/TriggerNode";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  logic: LogicNode,
  advanced: AdvancedNode,
};

interface CanvasInnerProps {
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<WorkflowCanvasNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onSelectNode: (id?: string) => void;
  onCreateNode: (type: NodeTypeKey, position: { x: number; y: number }) => void;
}

function CanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
  onCreateNode,
}: CanvasInnerProps) {
  const { screenToFlowPosition } = useReactFlow();

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow") as NodeTypeKey;
      if (!NODE_TYPES.some((definition) => definition.type === type)) return;
      onCreateNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [onCreateNode, screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const isEmpty = nodes.length === 0;

  return (
    <div
      className="relative h-full min-h-[560px] w-full overflow-hidden bg-[#0e0e10]"
      onDrop={onDrop}
      onDragOver={onDragOver}
      role="region"
      aria-label="Workflow Canvas"
    >
      <svg className="absolute h-0 w-0" aria-hidden="true">
        <defs>
          <linearGradient id="edge-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(undefined)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "url(#edge-gradient)", strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.35}
        maxZoom={1.6}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="rgba(255, 255, 255, 0.12)"
          className="transition-opacity"
        />
        <Controls
          showInteractive={false}
          aria-label="Canvas zoom and pan controls"
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { type?: NodeTypeKey };
            return data.type ? getNodeMeta(data.type).color : "#52525b";
          }}
          maskColor="rgb(9 9 11 / 0.75)"
          aria-label="Workflow minimap"
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto flex items-center gap-6">
              <button
                type="button"
                onClick={() => onCreateNode("" as NodeTypeKey, { x: 0, y: 0 })}
                className="group flex flex-col items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg p-1"
                aria-label="Add first workflow step"
              >
                <span className="flex h-[84px] w-[84px] items-center justify-center rounded-lg border-2 border-dashed border-white/20 bg-white/[0.02] text-white transition-colors group-hover:border-white/30 group-hover:bg-white/[0.04]">
                  <span className="text-3xl font-light leading-none">+</span>
                </span>
                <span className="text-sm text-zinc-300 group-hover:text-white">Add first step...</span>
              </button>
              <span className="text-xs text-zinc-500">or</span>
              <button
                type="button"
                onClick={() => (window as any).__AF_OPEN_AI?.()}
                className="group flex flex-col items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg p-1"
                aria-label="Build workflow with AI"
              >
                <span className="flex h-[84px] w-[84px] items-center justify-center rounded-lg border-2 border-dashed border-white/20 bg-white/[0.02] text-white transition-colors group-hover:border-white/30 group-hover:bg-white/[0.04]">
                  <span className="text-xl text-violet-400">✦</span>
                </span>
                <span className="text-sm text-zinc-300 group-hover:text-white">Build with AI</span>
              </button>
            </div>
          </div>
        )}
        <Panel
          position="top-right"
          className={cn("rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-[11px] text-zinc-400 backdrop-blur-xl")}
        >
          Drag from a handle to connect nodes
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: {
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<WorkflowCanvasNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onSelectNode: (id?: string) => void;
  onCreateNode: (type: NodeTypeKey, position: { x: number; y: number }) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
