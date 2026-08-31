"use client";

import type { LucideIcon } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import { CheckCircle, AlertCircle, Clock, Pause, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNodeMeta, type CanvasNodeKind, type WorkflowNodeData } from "@/lib/workflow";

export interface WorkflowNodeProps {
  id: string;
  data: WorkflowNodeData;
  selected?: boolean;
}

const statusIndicatorConfig: Record<string, { label: string; dotClass: string; icon?: LucideIcon }> = {
  IDLE: { label: "Inativo", dotClass: "bg-zinc-500" },
  QUEUED: { label: "Na Fila", dotClass: "bg-sky-400" },
  PENDING: { label: "Pronto", dotClass: "bg-zinc-500" },
  RUNNING: { label: "Executando", dotClass: "bg-amber-400 animate-pulse shadow-[0_0_12px_2px_rgba(245,158,11,0.45)]" },
  SUCCESS: { label: "Sucesso", dotClass: "bg-emerald-400", icon: CheckCircle },
  SUCCEEDED: { label: "Sucesso", dotClass: "bg-emerald-400", icon: CheckCircle },
  FAILED: { label: "Falhou", dotClass: "bg-rose-500", icon: AlertCircle },
  PAUSED: { label: "Pausado", dotClass: "bg-amber-400", icon: Pause },
  CANCELLED: { label: "Cancelado", dotClass: "bg-zinc-500" },
  TIMED_OUT: { label: "Tempo Excedido", dotClass: "bg-orange-400", icon: Clock },
  WAITING_APPROVAL: { label: "Aguardando Aprovação", dotClass: "bg-purple-400 animate-pulse", icon: Hourglass },
};

export function BaseNode({
  data,
  selected,
  kind,
  icon: Icon,
}: WorkflowNodeProps & { kind: CanvasNodeKind; icon: LucideIcon }) {
  const meta = getNodeMeta(data.type);
  const showBranchHandles = data.type === "condition";
  const diffMarker = data.diffMarker;
  const statusKey = data.status ?? "PENDING";
  const statusInfo = statusIndicatorConfig[statusKey] ?? { label: statusKey, dotClass: "bg-blue-500" };

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Nó ${data.label} (${meta.label}) - Estado: ${statusInfo.label}`}
      className={cn(
        "group relative min-w-[210px] max-w-[280px] overflow-visible rounded-xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl border-l-[3px]",
        meta.styles.borderColor,
        selected
          ? "ring-2 ring-violet-400/80 ring-offset-2 ring-offset-zinc-950 shadow-[0_0_25px_-5px_rgba(139,92,246,0.45)]"
          : "focus-visible:ring-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        diffMarker?.styleClass,
        "transition-all duration-200 hover:border-white/20 hover:shadow-lg hover:shadow-black/50 outline-none cursor-pointer"
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

      {/* Target Handle (Left) */}
      {kind !== "trigger" ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-[9px] !w-[9px] !rounded-full !border-2 !border-zinc-950 !bg-zinc-500 transition-transform duration-150 hover:!scale-125 hover:!bg-violet-400 hover:!shadow-[0_0_10px_2px_rgba(139,92,246,0.6)]"
          aria-label={`Entrada do nó ${data.label}`}
        />
      ) : null}

      {/* Node Header */}
      <div className="flex items-center gap-2.5 border-b border-white/10 p-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/5", meta.styles.iconBg)}>
          <Icon className={cn("h-4 w-4", meta.styles.iconColor)} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100 tracking-tight" title={data.label}>
            {data.label}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", meta.styles.badgeColor, meta.styles.iconColor)}>
              {meta.label}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center pl-1" title={`Status: ${statusInfo.label}`}>
          <span className={cn("h-2 w-2 rounded-full", statusInfo.dotClass)} />
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3 text-xs text-zinc-400 space-y-2">
        <p className="line-clamp-2 leading-relaxed text-zinc-400">{data.description}</p>
        <div className="rounded bg-zinc-950/60 border border-white/5 px-2 py-1 font-mono text-[10px] text-zinc-500 truncate">
          {Object.entries(data.config)[0] ? (
            <span>
              <span className="text-zinc-400 font-semibold">{Object.entries(data.config)[0][0]}:</span> {String(Object.entries(data.config)[0][1])}
            </span>
          ) : (
            <span className="text-zinc-600">configuração pronta</span>
          )}
        </div>
      </div>

      {/* Source Handles (Right) */}
      {kind === "trigger" ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-[9px] !w-[9px] !rounded-full !border-2 !border-zinc-950 !bg-indigo-500 transition-transform duration-150 hover:!scale-125 hover:!bg-indigo-400 hover:!shadow-[0_0_10px_2px_rgba(99,102,241,0.6)]"
          aria-label={`Saída do gatilho ${data.label}`}
        />
      ) : showBranchHandles ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "35%" }}
            className="!h-[9px] !w-[9px] !rounded-full !border-2 !border-zinc-950 !bg-amber-500 transition-transform duration-150 hover:!scale-125 hover:!bg-amber-400 hover:!shadow-[0_0_10px_2px_rgba(245,158,11,0.6)]"
            aria-label={`Saída ramo verdadeiro do nó ${data.label}`}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "70%" }}
            className="!h-[9px] !w-[9px] !rounded-full !border-2 !border-zinc-950 !bg-slate-400 transition-transform duration-150 hover:!scale-125 hover:!bg-slate-300 hover:!shadow-[0_0_10px_2px_rgba(100,116,139,0.6)]"
            aria-label={`Saída ramo falso do nó ${data.label}`}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-[9px] !w-[9px] !rounded-full !border-2 !border-zinc-950 !bg-violet-500 transition-transform duration-150 hover:!scale-125 hover:!bg-violet-400 hover:!shadow-[0_0_10px_2px_rgba(139,92,246,0.6)]"
          aria-label={`Saída do nó ${data.label}`}
        />
      )}
    </div>
  );
}
