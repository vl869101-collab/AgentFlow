"use client";

import type { LucideIcon } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { getNodeMeta, type CanvasNodeKind, type WorkflowNodeData } from "@/lib/workflow";

export interface WorkflowNodeProps {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}

const statusClasses: Record<string, string> = {
  PENDING: "bg-blue-500",
  RUNNING: "bg-amber-500 animate-pulse",
  SUCCESS: "bg-green-500",
  FAILED: "bg-red-500",
  CANCELLED: "bg-zinc-500",
  WAITING_APPROVAL: "bg-violet-500",
};

export function BaseNode({ data, selected, kind, icon: Icon }: WorkflowNodeProps & { kind: CanvasNodeKind; icon: LucideIcon }) {
  const meta = getNodeMeta(data.type);
  const showBranchHandles = data.type === "condition";
  const diffMarker = data.diffMarker;

  return (
    <div
      className={cn(
        "relative min-w-[200px] overflow-visible bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-xl border-l-2",
        meta.styles.borderColor,
        selected && "ring-2 ring-violet-400/70 ring-offset-2 ring-offset-zinc-950",
        diffMarker?.styleClass,
        "transition-all duration-200 hover:border-white/20"
      )}
    >
      {diffMarker ? (
        <div
          className={cn(
            "absolute -top-2.5 right-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider shadow-lg",
            diffMarker.status === "added" && "bg-emerald-500 text-zinc-950 border border-emerald-300 font-mono",
            diffMarker.status === "removed" && "bg-rose-500 text-white border border-rose-300 font-mono",
            diffMarker.status === "modified" && "bg-amber-500 text-zinc-950 border border-amber-300 font-mono",
            diffMarker.status === "unchanged" && "bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono"
          )}
        >
          <span>{diffMarker.badgeLabel}</span>
          {diffMarker.changedFields && diffMarker.changedFields.length > 0 && !diffMarker.changedFields.includes("all") ? (
            <span className="opacity-85 text-[8px] font-sans font-medium">({diffMarker.changedFields.join(", ")})</span>
          ) : null}
        </div>
      ) : null}
      {kind !== "trigger" ? <Handle type="target" position={Position.Left} className="!bg-zinc-500" /> : null}
      <div className="flex items-center gap-2 border-b border-white/10 p-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", meta.styles.iconBg)}><Icon className={cn("h-4 w-4", meta.styles.iconColor)} /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{data.label}</p><p className={cn("mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px]", meta.styles.badgeColor, meta.styles.iconColor)}>{meta.label}</p></div>
        <span className={cn("h-2 w-2 rounded-full", statusClasses[data.status ?? "PENDING"] ?? "bg-blue-500")} title={data.status ?? "PENDING"} />
      </div>
      <div className="p-3 text-xs text-zinc-400"><p className="line-clamp-2 leading-5">{data.description}</p><p className="mt-2 truncate font-mono text-[10px] text-zinc-600">{Object.entries(data.config)[0]?.[0] ?? "config"}: {String(Object.entries(data.config)[0]?.[1] ?? "ready")}</p></div>
      {kind !== "trigger" ? <Handle type="source" position={Position.Right} id={showBranchHandles ? "default" : undefined} className="!bg-violet-400" /> : <Handle type="source" position={Position.Right} className="!bg-indigo-400" />}
      {showBranchHandles ? <><Handle type="source" position={Position.Right} id="true" style={{ top: "35%" }} className="!bg-amber-400" /><Handle type="source" position={Position.Right} id="false" style={{ top: "70%" }} className="!bg-slate-400" /></> : null}
    </div>
  );
}
