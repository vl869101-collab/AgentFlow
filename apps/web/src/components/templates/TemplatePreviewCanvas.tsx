"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TriggerNode } from "../workflow/nodes/TriggerNode";
import { ActionNode } from "../workflow/nodes/ActionNode";
import { LogicNode } from "../workflow/nodes/LogicNode";
import { AdvancedNode } from "../workflow/nodes/AdvancedNode";
import { type CanvasNodeKind, type NodeTypeKey, type WorkflowCanvasNode } from "@/lib/workflow";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  logic: LogicNode,
  advanced: AdvancedNode,
};

interface TemplatePreviewCanvasProps {
  nodes: Array<{
    id?: string;
    type: string;
    label?: string;
    config?: Record<string, unknown>;
    data?: Record<string, unknown>;
    position?: { x: number; y: number };
    width?: number;
    height?: number;
  }>;
  edges: Array<{
    id?: string;
    source?: string;
    target?: string;
    sourceNodeId?: string;
    targetNodeId?: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    condition?: unknown;
  }>;
  className?: string;
}

function resolveCanvasKind(type: string): CanvasNodeKind {
  if (["webhook", "cron", "gmailTrigger", "evaluationTrigger", "emailReadImap", "errorTrigger", "slackTrigger", "telegramTrigger", "whatsappTrigger"].includes(type)) {
    return "trigger";
  }
  if (["http", "email", "discord", "telegram", "sheets", "googleSheets", "googleDrive", "gmail", "googleGmail", "slack", "teams", "whatsapp", "googleCalendar", "googleDocs"].includes(type)) {
    return "action";
  }
  if (["condition", "transform", "delay", "code", "merge", "filter", "splitInBatches", "set_fields", "respond_webhook"].includes(type)) {
    return "logic";
  }
  return "advanced";
}

function TemplatePreviewCanvasInner({ nodes: rawNodes, edges: rawEdges, className }: TemplatePreviewCanvasProps) {
  const formattedNodes: WorkflowCanvasNode[] = useMemo(() => {
    return rawNodes.map((n, i) => {
      const dataObj = (n.data || {}) as Record<string, any>;
      const actualType = (dataObj.type ?? n.type ?? "webhook") as NodeTypeKey;
      const kind = resolveCanvasKind(actualType);

      return {
        id: n.id ?? `preview-node-${i}`,
        type: kind,
        position: n.position ?? { x: 100 + i * 280, y: 150 },
        data: {
          type: actualType,
          label: (dataObj.label ?? n.label ?? actualType) as string,
          description: (dataObj.description ?? "") as string,
          config: (dataObj.config ?? n.config ?? {}) as Record<string, string | number | boolean>,
          status: "PENDING",
        },
      };
    });
  }, [rawNodes]);

  const formattedEdges: Edge[] = useMemo(() => {
    return rawEdges.map((e, i) => ({
      id: e.id ?? `preview-edge-${i}`,
      source: e.source ?? e.sourceNodeId ?? "",
      target: e.target ?? e.targetNodeId ?? "",
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
      animated: true,
      style: { stroke: "#6366f1", strokeWidth: 2 },
    }));
  }, [rawEdges]);

  return (
    <div className={className ?? "relative h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c0d12]"}>
      <ReactFlow
        nodes={formattedNodes}
        edges={formattedEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={true}
        panOnDrag={true}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#27272a" />
        <Controls
          showInteractive={false}
          className="!border-white/10 !bg-zinc-900/90 !fill-zinc-400 !text-zinc-400 !backdrop-blur-md"
        />
        <MiniMap
          nodeColor="#6366f1"
          maskColor="rgba(9, 9, 11, 0.7)"
          className="!hidden sm:!block !border-white/10 !bg-zinc-950/80 !rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}

export function TemplatePreviewCanvas(props: TemplatePreviewCanvasProps) {
  return (
    <ReactFlowProvider>
      <TemplatePreviewCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
