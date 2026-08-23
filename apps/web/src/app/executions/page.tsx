"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock3, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Select } from "@/components/ui/Select";
import { executions, type Execution } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

function labelFor(status: string) { return status === "WAITING_APPROVAL" ? "Waiting approval" : status.charAt(0) + status.slice(1).toLowerCase(); }

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
  if (status === "FAILED") return <XCircle className="h-5 w-5 shrink-0 text-red-400" />;
  if (status === "RUNNING") return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-400" />;
  if (status === "WAITING_APPROVAL") return <Clock3 className="h-5 w-5 shrink-0 animate-pulse text-amber-400" />;
  if (status === "PENDING") return <Clock3 className="h-5 w-5 shrink-0 text-blue-400" />;
  return <Circle className="h-5 w-5 shrink-0 text-zinc-500" />;
}

export default function ExecutionsPage() {
  const [data, setData] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    executions.list().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function refresh() {
    setRefreshing(true);
    executions.list().then(setData).catch(() => {}).finally(() => setRefreshing(false));
  }

  const filtered = useMemo(() =>
    data.filter((e) => (status === "all" || e.status === status) && `${e.workflowId} ${e.id}`.toLowerCase().includes(query.toLowerCase())),
    [data, status, query]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Executions</h1>
            <p className="mt-1 text-sm text-zinc-500">Monitor your workflow execution history</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-white/10 bg-zinc-900 p-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search workflow or execution ID"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 pl-9 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-violet-500"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="rounded-md border-white/10 bg-white/5 py-2.5 text-zinc-200 focus:border-violet-500 focus:ring-0"
              options={[
                { value: "all", label: "All statuses" },
                { value: "SUCCESS", label: "Success" },
                { value: "RUNNING", label: "Running" },
                { value: "FAILED", label: "Failed" },
                { value: "WAITING_APPROVAL", label: "Waiting approval" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/5" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-12 text-center">
              <p className="text-sm text-zinc-400">No executions found</p>
              <p className="mt-1 text-xs text-zinc-600">Runs from your workflows will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((execution, index) => (
                <motion.div
                  key={execution.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Link
                    href={`/executions/${execution.id}`}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 transition-colors hover:border-white/20"
                  >
                    <StatusIcon status={execution.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-50">{execution.workflow?.name ?? execution.workflowId}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {formatRelativeTime(execution.startedAt)} · {execution.nodes ?? 0} nodes · {labelFor(execution.status)}
                      </p>
                    </div>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-zinc-300">
                      {execution.duration != null ? `${execution.duration}ms` : "—"}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">Total {filtered.length} executions</p>
            <div className="flex items-center gap-3">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
              <span className="text-xs text-zinc-600">Page {page} of {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
