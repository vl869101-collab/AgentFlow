"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FlaskConical,
  Info,
  Loader2,
  MoreVertical,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { executions, workflows, type Execution } from "@/lib/api";

function StatusCell({ status }: { status: string }) {
  if (status === "SUCCESS") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Success
      </span>
    );
  }
  if (status === "FAILED" || status === "Error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Error
      </span>
    );
  }
  if (status === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Running
      </span>
    );
  }
  if (status === "WAITING_APPROVAL") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
        <Clock3 className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" /> Waiting
      </span>
    );
  }
  return <span className="text-xs text-zinc-300">{status}</span>;
}

function formatStarted(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function ExecutionsPage() {
  const [data, setData] = useState<Execution[]>([]);
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    Promise.all([
      executions.list().catch(() => [] as Execution[]),
      workflows.list().catch(() => []),
    ])
      .then(([execs, wfs]) => {
        setData(execs);
        const map: Record<string, string> = {};
        wfs.forEach((w: any) => {
          map[w.id] = w.name;
        });
        setWorkflowNames(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return data;
    return data.filter((e) => {
      const wfName = (e.workflow?.name ?? workflowNames[e.workflowId] ?? e.workflowId).toLowerCase();
      return wfName.includes(q) || e.id.toLowerCase().includes(q) || e.status.toLowerCase().includes(q);
    });
  }, [data, query, workflowNames]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        {/* Header n8n style - matches dashboard tabs */}
        <header className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-50">Executions</h1>
              <p className="mt-1 text-sm text-zinc-400">Monitor your workflow execution history</p>
            </div>
            <Link
              href="/workflows"
              className="hidden sm:inline-flex items-center gap-2 rounded-md bg-n8n-accent hover:bg-n8n-accent-dark px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Create workflow
            </Link>
          </div>
          {/* Tabs navigation */}
          <nav className="flex items-center gap-6 border-b border-white/10" aria-label="Sections navigation">
            <Link href="/dashboard" className="pb-3 text-sm font-medium text-zinc-400 hover:text-zinc-200">
              Workflows
            </Link>
            <Link href="/credentials" className="pb-3 text-sm font-medium text-zinc-400 hover:text-zinc-200">
              Credentials
            </Link>
            <span
              className="pb-3 text-sm font-medium text-n8n-accent border-b-2 border-n8n-accent"
              aria-current="page"
            >
              Executions
            </span>
            <span className="pb-3 text-sm text-zinc-500">Variables</span>
            <span className="pb-3 text-sm text-zinc-500">Data tables</span>
          </nav>
        </header>

        {/* Action bar + filters */}
        <div className="mt-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
            No active executions <Info className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <label htmlFor="search-workflows-desktop" className="sr-only">
                Search workflows
              </label>
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                id="search-workflows-desktop"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search workflows..."
                className="h-8 w-56 rounded-md border border-white/10 bg-white/5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-400 outline-none focus:border-n8n-accent focus-visible:ring-1 focus-visible:ring-n8n-accent"
              />
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label="Filter execution list"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Table container with responsive horizontal scroll */}
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-n8n-panel shadow-sm">
          <div className="min-w-[760px]" role="table" aria-label="Workflow executions history">
            {/* Table header */}
            <div
              className="grid grid-cols-[36px_1.4fr_0.8fr_1.1fr_90px_90px_36px_44px] gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-300"
              role="row"
            >
              <span className="flex items-center" role="columnheader">
                <input
                  type="checkbox"
                  disabled
                  className="h-3.5 w-3.5 rounded border-white/20 bg-white/5"
                  aria-label="Select all executions"
                />
              </span>
              <span role="columnheader">Workflow</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Started</span>
              <span role="columnheader">Run Time</span>
              <span role="columnheader">Exec. ID</span>
              <span className="text-center" role="columnheader" title="Test run indicator">
                <FlaskConical className="h-3.5 w-3.5 mx-auto opacity-70" aria-label="Test run" />
              </span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>

            {loading ? (
              <div className="space-y-0">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[44px] animate-pulse border-b border-white/5 bg-white/[0.02]" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-zinc-300">No executions found</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {query ? "Try adjusting your search keywords." : "Runs from your workflows will appear here automatically."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {visible.map((e) => {
                  const wfName = e.workflow?.name ?? workflowNames[e.workflowId] ?? e.workflowId;
                  const isError = e.status === "FAILED" || (e.status as string) === "Error";
                  return (
                    <div
                      key={e.id}
                      className={`grid grid-cols-[36px_1.4fr_0.8fr_1.1fr_90px_90px_36px_44px] items-center gap-2 px-3 py-3 text-sm transition-colors ${
                        isError ? "bg-red-950/20" : "bg-transparent hover:bg-white/[0.03]"
                      }`}
                      role="row"
                    >
                      <span className="flex items-center" role="cell">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-violet-600"
                          aria-label={`Select execution ${e.id}`}
                        />
                      </span>
                      <span className="truncate" role="cell">
                        <Link
                          href={`/executions/${e.id}`}
                          className="truncate text-sm font-medium text-zinc-100 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                        >
                          {wfName}
                        </Link>
                      </span>
                      <span role="cell">
                        <StatusCell status={e.status} />
                      </span>
                      <span className="truncate text-xs text-zinc-300" role="cell">
                        {formatStarted(e.startedAt)}
                      </span>
                      <span className="text-xs text-zinc-300" role="cell">
                        {e.duration != null ? `${e.duration}ms` : "—"}
                      </span>
                      <span className="font-mono text-xs text-zinc-400" role="cell">
                        {e.id.slice(0, 6)}
                      </span>
                      <span className="flex justify-center text-zinc-400" role="cell">
                        <FlaskConical className="h-3.5 w-3.5 opacity-70" aria-label="Manual or Test execution" />
                      </span>
                      <span className="flex justify-end" role="cell">
                        <Link
                          href={`/executions/${e.id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                          aria-label={`View execution details for ${wfName}`}
                        >
                          <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-white/10 bg-white/[0.02] px-3 py-3 text-center text-xs text-zinc-400">
              {filtered.length === 0
                ? "No more executions to fetch"
                : `Showing ${visible.length} of ${filtered.length} executions`}
            </div>
          </div>
        </div>

        {/* Mobile search fallback */}
        <div className="mt-3 sm:hidden">
          <div className="relative">
            <label htmlFor="search-workflows-mobile" className="sr-only">
              Search workflows
            </label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              id="search-workflows-mobile"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search workflows..."
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 pl-9 text-sm text-zinc-200 outline-none placeholder:text-zinc-400 focus:border-n8n-accent"
            />
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-zinc-400">Total {filtered.length} executions</p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
            </button>
            <span className="text-xs text-zinc-400">
              Page {page} of {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              aria-label="Next page"
            >
              Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
