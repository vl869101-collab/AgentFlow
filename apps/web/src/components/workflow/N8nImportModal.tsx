"use client";

import { useState } from "react";
import { Upload, FileCode, CheckCircle2, AlertCircle, ArrowRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { importN8nWorkflow, type N8nValidationResult, type AgentFlowImportResult } from "@agentflow/shared";
import { workflows, type Workflow } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (workflow: Workflow) => void;
}

export function N8nImportModal({ open, onClose, onImported }: Props) {
  const [jsonText, setJsonText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    validation: N8nValidationResult;
    converted: AgentFlowImportResult;
    name: string;
  } | null>(null);

  if (!open) return null;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonText(content);
      analyzeJson(content);
    };
    reader.readAsText(file);
  }

  function analyzeJson(content: string) {
    setError(null);
    setPreview(null);
    if (!content.trim()) return;

    setAnalyzing(true);
    try {
      const parsed = JSON.parse(content);
      const res = importN8nWorkflow(parsed, {});

      if (!res.validation.valid) {
        setError(
          `Validation failed: ${res.validation.errors.map((e) => `${e.path || "root"}: ${e.message}`).join(", ")}`
        );
        setAnalyzing(false);
        return;
      }

      setPreview({
        validation: res.validation,
        converted: res,
        name: res.workflow.name || "Imported n8n Workflow",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid JSON file syntax");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const created = await workflows.create({
        name: preview.name || "Imported n8n Workflow",
        description: `Imported from n8n (${preview.converted.nodes.length} nodes)`,
      });

      // Update with nodes and edges
      const updated = await workflows.update(created.id, {
        nodes: preview.converted.nodes,
        edges: preview.converted.edges,
      });

      onImported(updated || created);
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save imported workflow");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    onClose();
    setJsonText("");
    setPreview(null);
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col border-white/10 bg-zinc-900 p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ff6d3c]/15 text-[#ff6d3c]">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Import n8n Workflow</h2>
              <p className="text-xs text-zinc-400">Migrate an exported n8n workflow JSON into native AgentFlow format</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
          {!preview ? (
            <>
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center transition-colors hover:border-[#ff6d3c]/50">
                <Upload className="mb-3 h-8 w-8 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-200">Upload n8n JSON Export</p>
                <p className="mt-1 text-xs text-zinc-500">Drag & drop or select a workflow file (.json)</p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/15">
                  <span>Browse Files</span>
                  <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                </label>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Or paste n8n workflow JSON:</label>
                <textarea
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    analyzeJson(e.target.value);
                  }}
                  placeholder='{"name": "My n8n Workflow", "nodes": [...], "connections": {...}}'
                  className="h-40 w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#ff6d3c] focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Workflow analyzed and ready to convert</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-black/30 p-2.5">
                    <p className="text-zinc-500">Source Nodes</p>
                    <p className="mt-1 text-base font-semibold text-zinc-200">{preview.validation.stats.totalNodes}</p>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2.5">
                    <p className="text-zinc-500">Converted Nodes</p>
                    <p className="mt-1 text-base font-semibold text-emerald-400">{preview.converted.nodes.length}</p>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2.5">
                    <p className="text-zinc-500">Connections (Edges)</p>
                    <p className="mt-1 text-base font-semibold text-zinc-200">{preview.converted.edges.length}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Target Workflow Name</label>
                <input
                  type="text"
                  value={preview.name}
                  onChange={(e) => setPreview({ ...preview, name: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 focus:border-[#ff6d3c] focus:outline-none"
                />
              </div>

              {preview.converted.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <p className="font-medium">Import Notes & Warnings:</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-amber-400/80">
                    {preview.converted.warnings.slice(0, 4).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-6 py-4">
          {preview ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreview(null)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Reset
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            {preview && (
              <Button
                size="sm"
                onClick={handleImport}
                disabled={saving}
                className="bg-[#ff6d3c] text-white hover:bg-[#ff551c]"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    Convert & Open Canvas <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
