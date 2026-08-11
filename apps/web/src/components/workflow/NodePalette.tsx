"use client";

import { useMemo, useState } from "react";
import { NODE_TYPES } from "@agentflow/shared";
import { ChevronDown, GripVertical, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeTypeKey } from "@/lib/workflow";

const paletteGroups = [
  { label: "Triggers", types: ["webhook", "cron"] },
  { label: "Actions", types: ["http", "email", "discord", "telegram", "sheets"] },
  { label: "Logic", types: ["condition", "transform", "delay"] },
  { label: "Advanced", types: ["ai_agent", "approval"] },
] as const;

const iconMap = {
  webhook: "↗",
  cron: "◷",
  http: "↔",
  email: "@",
  discord: "◉",
  telegram: "➤",
  sheets: "▦",
  condition: "⑂",
  transform: "⇄",
  delay: "◌",
  ai_agent: "✦",
  approval: "✓",
} satisfies Record<NodeTypeKey, string>;

const colorMap: Record<NodeTypeKey, string> = {
  webhook: "bg-indigo-500/10 text-indigo-400",
  cron: "bg-violet-500/10 text-violet-400",
  http: "bg-cyan-500/10 text-cyan-400",
  email: "bg-emerald-500/10 text-emerald-400",
  discord: "bg-[#5865f2]/10 text-[#5865f2]",
  telegram: "bg-[#229ed9]/10 text-[#229ed9]",
  sheets: "bg-[#34a853]/10 text-[#34a853]",
  condition: "bg-amber-500/10 text-amber-400",
  transform: "bg-pink-500/10 text-pink-400",
  delay: "bg-slate-500/10 text-slate-400",
  ai_agent: "bg-purple-500/10 text-purple-400",
  approval: "bg-red-500/10 text-red-400",
};

export function NodePalette({ onAddNode }: { onAddNode?: (type: NodeTypeKey) => void }) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Triggers: true, Actions: true, Logic: true, Advanced: true });
  const definitions = useMemo(() => new Map(NODE_TYPES.map((definition) => [definition.type, definition])), []);

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, type: NodeTypeKey) {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/10 bg-zinc-950/80" aria-label="Node palette">
      <div className="border-b border-white/10 p-4"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"><Sparkles className="h-3.5 w-3.5 text-white" /></div><div><h2 className="text-sm font-medium text-zinc-100">Node palette</h2><p className="text-[11px] text-zinc-600">Drag a step onto the canvas</p></div></div><div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 pl-9 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/30" /></div></div>
      <div className="flex-1 overflow-y-auto p-3">
        {paletteGroups.map((group) => {
          const visibleTypes = group.types.filter((type) => definitions.get(type)?.label.toLowerCase().includes(query.toLowerCase()));
          if (!visibleTypes.length) return null;
          const isOpen = openGroups[group.label];
          return <div key={group.label} className="mb-4"><button type="button" onClick={() => setOpenGroups((state) => ({ ...state, [group.label]: !state[group.label] }))} className="mb-1 flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600 hover:text-zinc-400"><span>{group.label}</span><ChevronDown className={cn("h-3 w-3 transition-transform", !isOpen && "-rotate-90")} /></button>{isOpen ? <div className="space-y-1">{visibleTypes.map((type) => { const definition = definitions.get(type); if (!definition) return null; return <button key={type} type="button" draggable onDragStart={(event) => handleDragStart(event, type)} onClick={() => onAddNode?.(type)} className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left transition-all duration-200 hover:border-white/10 hover:bg-white/5"><GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-700 group-hover:text-zinc-500" /><span className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold", colorMap[type])}>{iconMap[type]}</span><span className="min-w-0 flex-1 truncate text-xs text-zinc-400 group-hover:text-zinc-200">{definition.label}</span><span className="text-[10px] text-zinc-700">+</span></button>; })}</div> : null}</div>;
        })}
        {!paletteGroups.some((group) => group.types.some((type) => definitions.get(type)?.label.toLowerCase().includes(query.toLowerCase()))) ? <p className="px-2 py-6 text-center text-xs text-zinc-600">No nodes found.</p> : null}
      </div>
      <div className="border-t border-white/10 p-3"><p className="text-[11px] leading-5 text-zinc-600">Connect nodes by dragging from a handle. Click any node to configure it.</p></div>
    </aside>
  );
}
