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
import { Plus, Sparkles, Move } from "lucide-react";
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
      aria-label="Workflow Canvas - Grafo de Execução"
    >
      <svg className="absolute h-0 w-0" aria-hidden="true">
        <defs>
          <linearGradient id="edge-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
          <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#8b5cf6" floodOpacity="0.4" />
          </filter>
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
        fitViewOptions={{ padding: 0.25 }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "#8b5cf6", strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={2}
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
          aria-label="Controles de zoom e enquadramento do canvas"
          className="!rounded-xl !border !border-white/10 !bg-zinc-900/85 !shadow-2xl !backdrop-blur-xl"
        />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { type?: NodeTypeKey };
            return data.type ? getNodeMeta(data.type).color : "#52525b";
          }}
          maskColor="rgba(9, 9, 11, 0.85)"
          className="!rounded-xl !border !border-white/10 !bg-zinc-900/60 !shadow-xl !backdrop-blur-xl"
          aria-label="Minimapa do fluxo"
        />

        {isEmpty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto flex max-w-md flex-col items-center justify-center text-center rounded-2xl border border-white/10 bg-zinc-950/80 p-8 backdrop-blur-xl shadow-2xl shadow-black/80">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Move className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-zinc-100">Comece com um Gatilho</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Adicione um nó de Webhook, Cron ou evento de aplicação para iniciar seu fluxo de automação no canvas.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onCreateNode("webhook", { x: 120, y: 180 })}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3.5 py-2 text-xs font-medium text-white shadow-md shadow-violet-500/20 transition-all hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  aria-label="Adicionar primeiro nó de Gatilho Webhook"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Adicionar Gatilho</span>
                </button>
                <button
                  type="button"
                  onClick={() => (window as any).__AF_OPEN_AI?.()}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 transition-all hover:border-white/20 hover:bg-zinc-750 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  aria-label="Gerar fluxo com Inteligência Artificial"
                >
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
                  <span>Gerar com IA</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <Panel
          position="top-right"
          className={cn("rounded-lg border border-white/10 bg-zinc-900/85 px-3 py-1.5 text-[11px] font-medium text-zinc-400 backdrop-blur-xl shadow-lg")}
        >
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            Conecte nós arrastando das portas laterais
          </span>
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
