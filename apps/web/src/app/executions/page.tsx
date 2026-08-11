"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { executions, type Execution } from "@/lib/api";

function statusFor(status: string): BadgeStatus { return status === "SUCCESS" ? "success" : status === "FAILED" ? "error" : status === "RUNNING" || status === "WAITING_APPROVAL" ? "warning" : status === "PENDING" ? "info" : "neutral"; }
function labelFor(status: string) { return status === "WAITING_APPROVAL" ? "Waiting approval" : status.charAt(0) + status.slice(1).toLowerCase(); }

export default function ExecutionsPage() {
  const [data, setData] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    executions.list().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    data.filter((e) => (status === "all" || e.status === status) && `${e.workflowId} ${e.id}`.toLowerCase().includes(query.toLowerCase())),
    [data, status, query]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400">Runtime history</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-50">Executions</h1>
            <p className="mt-2 text-sm text-zinc-500">Trace every run from trigger to final output.</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-500">
            <Activity className="h-3.5 w-3.5 text-green-400" /> Live activity connected
          </div>
        </div>

        <Card className="mt-8 p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search workflow or execution ID"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 pl-10 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-transparent focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
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
        </Card>

        <Card className="mt-6 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-medium text-zinc-200">Recent runs</h2>
            <span className="text-xs text-zinc-600">{filtered.length} total</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-600">Loading...</div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-600">No executions found.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {visible.map((execution, index) => (
                <motion.div
                  key={execution.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Link
                    href={`/executions/${execution.id}`}
                    className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-zinc-100">{execution.workflowId}</span>
                        <Badge status={statusFor(execution.status)}>{labelFor(execution.status)}</Badge>
                      </div>
                      <span className="font-mono text-xs text-zinc-600">{execution.id}</span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-zinc-500">
                      <span>{execution.duration ?? "—"}</span>
                      <span>{execution.nodes ?? 0} nodes</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
            <span className="text-xs text-zinc-600">Page {page} of {pageCount}</span>
            <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-white/5 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
