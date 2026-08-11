"use client";

import { useState } from "react";
import { BrainCircuit, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function AIGeneratorModal({ open, onClose, onGenerate }: { open: boolean; onClose: () => void; onGenerate: (description: string) => void }) {
  const [description, setDescription] = useState("When a new order arrives, assess the risk, notify operations for high-value orders, and record every order in Google Sheets.");
  const [generating, setGenerating] = useState(false);

  function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    setGenerating(true);
    window.setTimeout(() => {
      setGenerating(false);
      onGenerate(description);
    }, 650);
  }

  return <Modal open={open} onClose={onClose} title="Generate with AI" description="Describe the workflow in plain language and AgentFlow will map the first draft."><form onSubmit={handleGenerate} className="space-y-5"><div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4"><div className="flex items-center gap-2 text-sm font-medium text-purple-300"><BrainCircuit className="h-4 w-4" /> AI workflow architect</div><p className="mt-1.5 text-xs leading-5 text-zinc-500">Be specific about the trigger, the systems involved, and where a human should make a decision.</p></div><div className="space-y-2"><label htmlFor="ai-workflow-prompt" className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Workflow description</label><textarea id="ai-workflow-prompt" rows={6} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-transparent focus:ring-2 focus:ring-violet-500" placeholder="e.g. When a support ticket is marked urgent..." /></div><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-xs text-zinc-600"><Sparkles className="h-3.5 w-3.5 text-violet-400" /> Drafts are always editable</span><Button type="submit" disabled={!description.trim()} loading={generating}>{generating ? "Mapping workflow" : "Generate workflow"}</Button></div></form></Modal>;
}
