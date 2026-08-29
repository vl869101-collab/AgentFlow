"use client";

import { useState } from "react";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { workflows, type WorkflowDiff, type WorkflowVersion } from "@/lib/api";

export function WorkflowVersionPanel({ workflowId }: { workflowId: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [fromVersion, setFromVersion] = useState(0);
  const [toVersion, setToVersion] = useState(0);
  const [diff, setDiff] = useState<WorkflowDiff>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function showHistory() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const history = await workflows.versions(workflowId);
      setVersions(history);
      const latest = history[0]?.version ?? 0;
      const previous = history[1]?.version ?? latest;
      setFromVersion(previous);
      setToVersion(latest);
      setDiff(previous && latest && previous !== latest ? await workflows.diff(workflowId, previous, latest) : undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Version history could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  async function compare() {
    if (!fromVersion || !toVersion || fromVersion === toVersion) return;
    setLoading(true);
    setError("");
    try {
      setDiff(await workflows.diff(workflowId, fromVersion, toVersion));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Versions could not be compared");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Button variant="ghost" size="sm" onClick={showHistory} aria-haspopup="dialog"><History className="h-3.5 w-3.5" /><span className="hidden sm:inline">Versions</span></Button>
    {open ? <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Workflow version history" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Version history</h2><p className="mt-1 text-xs text-zinc-500">Compare immutable workflow snapshots.</p></div><button className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white" onClick={() => setOpen(false)} aria-label="Close version history"><X className="h-4 w-4" /></button></div>
        {versions.length > 1 ? <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="text-[11px] text-zinc-500">From<select className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-xs text-white" value={fromVersion} onChange={(event) => setFromVersion(Number(event.target.value))}>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></label><label className="text-[11px] text-zinc-500">To<select className="mt-1 block w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-xs text-white" value={toVersion} onChange={(event) => setToVersion(Number(event.target.value))}>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></label><Button size="sm" onClick={compare} loading={loading} disabled={fromVersion === toVersion}>Compare</Button></div> : null}
        {loading && versions.length === 0 ? <p className="text-xs text-zinc-500">Loading snapshots…</p> : null}
        {!loading && versions.length < 2 ? <p className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs text-zinc-500">Save the workflow twice to create a comparison.</p> : null}
        {error ? <p className="mt-4 text-xs text-red-400">{error}</p> : null}
        {diff ? <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2">{[["Added", diff.summary.nodesAddedCount + diff.summary.edgesAddedCount, "text-green-300"], ["Removed", diff.summary.nodesRemovedCount + diff.summary.edgesRemovedCount, "text-red-300"], ["Modified", diff.summary.nodesModifiedCount + diff.summary.edgesModifiedCount, "text-amber-300"]].map(([label, count, color]) => <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.02] p-3"><p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{count}</p></div>)}</div><div className="rounded-lg border border-white/10"><div className="border-b border-white/10 px-3 py-2 text-xs font-medium text-zinc-300">v{diff.fromVersion} → v{diff.toVersion} · {diff.summary.totalChanges} changes</div><ul className="divide-y divide-white/5 text-xs text-zinc-400">{diff.nodesAdded.map((node) => <li key={`added-${String(node.id)}`} className="px-3 py-2"><span className="text-green-300">+ node</span> {String(node.label ?? node.id)}</li>)}{diff.nodesRemoved.map((node) => <li key={`removed-${String(node.id)}`} className="px-3 py-2"><span className="text-red-300">− node</span> {String(node.label ?? node.id)}</li>)}{diff.nodesModified.map((node) => <li key={`modified-${node.nodeId}`} className="px-3 py-2"><span className="text-amber-300">~ node</span> {node.nodeId}: {node.changes.map((change) => change.field).join(", ")}</li>)}{diff.edgesModified.map((edge, index) => <li key={edge.edgeId ?? `edge-${index}`} className="px-3 py-2"><span className="text-amber-300">~ edge</span> {edge.source} → {edge.target}: {edge.changes.map((change) => change.field).join(", ")}</li>)}</ul></div></div> : null}
      </aside>
    </div> : null}
  </>;
}
