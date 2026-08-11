"use client";

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ai } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function AIGeneratorModal({ open, onClose, onCreated }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; description: string; nodes: any[]; edges: any[] } | null>(null);

  if (!open) return null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const { workflow } = await ai.generate(prompt);
      setResult(workflow);
    } catch (e: any) {
      setError(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setLoading(true);
    try {
      // Save as a new workflow via the workflows API (import from api)
      const { workflows } = await import("@/lib/api");
      await workflows.create({ name: result.name, description: result.description });
      onCreated();
      handleClose();
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    onClose();
    setPrompt("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-lg border-white/10 bg-zinc-900 p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-medium text-zinc-100">Generate with AI</h2>
          </div>
          <button onClick={handleClose} className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-zinc-400">Describe what you want your workflow to do. The AI will generate a draft.</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Fetch orders, check if total > $100, send Slack notification"
                className="h-32 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={handleClose} disabled={loading}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={!prompt.trim() || loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Generate
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Name</label>
                <input
                  value={result.name}
                  onChange={(e) => setResult({ ...result, name: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Description</label>
                <input
                  value={result.description}
                  onChange={(e) => setResult({ ...result, description: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-zinc-500">{result.nodes.length} nodes, {result.edges.length} edges generated</p>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => { setResult(null); setPrompt(""); }} disabled={loading}>Regenerate</Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save workflow
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
