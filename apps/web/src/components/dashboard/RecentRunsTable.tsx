"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  Search,
  XCircle,
} from "lucide-react";
import { executions, type Execution } from "@/lib/api";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

const PAGE_SIZE = 10;

type StatusFilter = "all" | "success" | "error" | "running";

function StatusCell({ status }: { status: Execution["status"] }) {
  const config: Record<Execution["status"], { icon: typeof CheckCircle2; className: string; label: string }> = {
    success: { icon: CheckCircle2, className: "text-emerald-400", label: "Succeeded" },
    error: { icon: XCircle, className: "text-red-400", label: "Failed" },
    running: { icon: Loader2, className: "animate-spin text-sky-400", label: "Running" },
    pending: { icon: Clock3, className: "text-zinc-500", label: "Pending" },
  };
  const { icon: Icon, className, label } = config[status] ?? config["pending"];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" role="status">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden="true" />
      {label}
    </span>
  );
}

export function RecentRunsTable({ workflowNames }: { workflowNames: Map<string, string> }) {
  const [runs, setRuns] = useState<Execution[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const list = await executions.list();
      setRuns(Array.isArray(list) ? list : []);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "Failed to load executions");
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const filtered = useMemo(() => {
    if (!runs) return [];
    const normalizedSearch = search.trim().toLowerCase();
    return runs
      .filter((run) => {
        if (status !== "all" && run.status !== status) return false;
        if (!normalizedSearch) return true;
        const name = workflowNames.get(run.workflowId) ?? "";
        return name.toLowerCase().includes(normalizedSearch) || run.id.toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [runs, search, status, workflowNames]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleTrigger = useCallback(
    async (workflowId: string) => {
      setActionError(null);
      setTriggeringId(workflowId);
      try {
        await executions.trigger(workflowId);
        await loadRuns();
      } catch (error: unknown) {
        setActionError(error instanceof Error ? error.message : "Trigger failed");
      } finally {
        setTriggeringId(null);
      }
    },
    [loadRuns],
  );

  return (
    <section aria-labelledby="runs-heading" className="af-dash-card af-dash-reveal p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="runs-heading" className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
          Recent runs
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <label htmlFor="runs-search" className="sr-only">
              Filter runs by workflow name or ID
            </label>
            <input
              id="runs-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Filter…"
              className="w-40 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pr-2 pl-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/30 focus:outline-none"
            />
          </div>
          <div role="group" aria-label="Filter runs by status" className="flex rounded-lg border border-white/10 p-0.5">
            {(["all", "success", "error", "running"] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStatus(value);
                  setPage(0);
                }}
                aria-pressed={status === value}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
                  status === value ? "bg-violet-500/20 text-violet-200" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionError ? (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-lg border border-dashed border-red-500/30 py-6 text-center text-sm text-red-300" role="alert">
          {loadError}
        </p>
      ) : runs === null ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">
          No runs match the current filters.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" role="table">
              <thead>
                <tr role="row" className="border-b border-white/10 text-[11px] tracking-wider text-zinc-500 uppercase">
                  <th scope="col" role="columnheader" className="px-2 py-2 font-medium">Workflow</th>
                  <th scope="col" role="columnheader" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" role="columnheader" className="px-2 py-2 font-medium">Started</th>
                  <th scope="col" role="columnheader" className="px-2 py-2 font-medium">Duration</th>
                  <th scope="col" role="columnheader" className="px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((run) => {
                  const workflowName = workflowNames.get(run.workflowId) ?? "Unknown workflow";
                  const isTriggering = triggeringId === run.workflowId;
                  return (
                    <tr
                      key={run.id}
                      role="row"
                      className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td role="cell" className="max-w-[220px] px-2 py-2.5">
                        <Link
                          href={`/executions/${run.id}`}
                          className="block truncate font-medium text-zinc-200 transition-colors hover:text-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
                        >
                          {workflowName}
                        </Link>
                        <span className="font-mono text-[10px] text-zinc-600">{run.id.slice(0, 8)}</span>
                      </td>
                      <td role="cell" className="px-2 py-2.5">
                        <StatusCell status={run.status} />
                      </td>
                      <td role="cell" className="px-2 py-2.5 text-xs whitespace-nowrap text-zinc-400">
                        {isMounted ? formatRelativeTime(run.startedAt) : "…"}
                      </td>
                      <td role="cell" className="px-2 py-2.5 text-xs text-zinc-400 tabular-nums">
                        {run.duration !== undefined && run.duration !== null ? formatDuration(run.duration) : "—"}
                      </td>
                      <td role="cell" className="px-2 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleTrigger(run.workflowId)}
                            disabled={isTriggering}
                            aria-label={`Run ${workflowName} again`}
                            className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-violet-500/10 hover:text-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
                          >
                            {isTriggering ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                          <Link
                            href={`/executions/${run.id}`}
                            aria-label={`Open run details for ${workflowName}`}
                            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav aria-label="Runs pagination" className="mt-3 flex items-center justify-between">
            <p className="text-xs text-zinc-500 tabular-nums" aria-live="polite">
              {filtered.length} run{filtered.length === 1 ? "" : "s"} · page {safePage + 1} of {pageCount}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={safePage === 0}
                className="cursor-pointer rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={safePage >= pageCount - 1}
                className="cursor-pointer rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
