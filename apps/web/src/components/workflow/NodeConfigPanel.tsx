"use client";

import { Trash2, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getNodeMeta, type WorkflowCanvasNode, type WorkflowNodeData } from "@/lib/workflow";
import { cn } from "@/lib/utils";

export function NodeConfigPanel({ node, onChange, onDelete }: { node?: WorkflowCanvasNode; onChange: (id: string, data: Partial<WorkflowNodeData>) => void; onDelete: (id: string) => void }) {
  const meta = node ? getNodeMeta(node.data.type) : null;
  const configEntries = node ? Object.entries(node.data.config) : [];

  if (!node || !meta) {
    return <aside className="flex h-full w-72 shrink-0 flex-col border-l border-white/10 bg-zinc-950/80"><div className="border-b border-white/10 p-4"><h2 className="text-sm font-medium text-zinc-100">Node configuration</h2><p className="mt-1 text-xs text-zinc-600">Select a node to edit its settings.</p></div><div className="flex flex-1 flex-col items-center justify-center p-6 text-center"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-600">✦</div><p className="text-xs leading-5 text-zinc-600">Node settings appear here when you select a step on the canvas.</p></div></aside>;
  }

  const activeNode = node;

  function updateConfig(key: string, value: string) {
    onChange(activeNode.id, { config: { ...activeNode.data.config, [key]: value } });
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-white/10 bg-zinc-950/80"><div className="border-b border-white/10 p-4"><div className="flex items-center gap-3"><div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", meta.styles.iconBg)}><span className={cn("text-sm font-semibold", meta.styles.iconColor)}>{meta.label.slice(0, 1)}</span></div><div className="min-w-0"><h2 className="truncate text-sm font-medium text-zinc-100">{node.data.label}</h2><p className={cn("text-[11px]", meta.styles.iconColor)}>{meta.label}</p></div></div></div><div className="flex-1 space-y-5 overflow-y-auto p-4"><Input label="Node label" value={node.data.label} onChange={(event) => onChange(node.id, { label: event.target.value })} /><div className="space-y-2"><label htmlFor="node-description" className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Description</label><textarea id="node-description" value={node.data.description} onChange={(event) => onChange(node.id, { description: event.target.value })} rows={3} className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs leading-5 text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-transparent focus:ring-2 focus:ring-violet-500" /></div><div className="border-t border-white/10 pt-4"><p className="mb-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Configuration</p><div className="space-y-4">{configEntries.map(([key, value]) => <Input key={key} label={key.replace(/([A-Z])/g, " $1")} value={String(value)} onChange={(event) => updateConfig(key, event.target.value)} />)}</div></div>{node.data.type === "ai_agent" ? <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3"><div className="flex items-center gap-2 text-xs font-medium text-purple-300"><WandSparkles className="h-3.5 w-3.5" /> AI context ready</div><p className="mt-1.5 text-[11px] leading-5 text-zinc-500">This step can use output from all upstream nodes.</p></div> : null}</div><div className="border-t border-white/10 p-4"><Button variant="danger" size="sm" className="w-full" onClick={() => onDelete(node.id)}><Trash2 className="h-3.5 w-3.5" /> Delete node</Button></div></aside>
  );
}
