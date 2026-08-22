"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ListFilter, MoreVertical, Search, UserRound, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { workflows as workflowsApi, executions as executionsApi, type Workflow, type Execution } from "@/lib/api";
import { AIGeneratorModal } from "@/components/ai/AIGeneratorModal";

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${Math.round(milliseconds / 100) / 10}s`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [aiOpen, setAiOpen] = useState(false);
  const [wfList, setWfList] = useState<Workflow[]>([]);
  const [exList, setExList] = useState<Execution[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("agentflow_token")) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    Promise.all([workflowsApi.list(), executionsApi.list()]).then(([wfs, exs]) => {
      setWfList(wfs);
      setExList(exs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filteredWorkflows = useMemo(
    () => wfList.filter((workflow) => `${workflow.name} ${workflow.description}`.toLowerCase().includes(query.toLowerCase())),
    [query, wfList]
  );

  if (!authed) return null;

  const prodExecutions = exList.length;
  const failedExecutions = exList.filter((execution) => execution.status === "FAILED").length;
  const failureRate = prodExecutions > 0 ? Math.round((failedExecutions / prodExecutions) * 100) : 0;
  const durations = exList.flatMap((execution) => execution.duration == null ? [] : [execution.duration]);
  const averageDuration = durations.length > 0 ? durations.reduce((total, duration) => total + duration, 0) / durations.length : 0;
  const stats = [
    { label: "Prod. executions", value: String(prodExecutions) },
    { label: "Failed prod. executions", value: String(failedExecutions) },
    { label: "Failure rate", value: `${failureRate}%` },
    { label: "Time saved", value: "—" },
    { label: "Run time avg.", value: averageDuration > 0 ? formatDuration(averageDuration) : "0s" },
  ];

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Overview</h1>
            <p className="mt-1 text-sm text-zinc-500">All the workflows, credentials and data tables you have access to</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/billing" className="inline-flex items-center gap-2 rounded-full bg-n8n-green px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              <Zap className="h-4 w-4" /> Upgrade Now
            </Link>
            <button onClick={() => setAiOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-n8n-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-n8n-accent-dark">
              Create workflow <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-white/10 bg-n8n-panel p-4">
              <p className="text-xs text-zinc-500">{stat.label}</p>
              <p className="mt-2 text-xl font-semibold text-white">{loading ? "—" : stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex gap-6 overflow-x-auto border-b border-white/10 text-sm">
          <span className="shrink-0 border-b-2 border-n8n-accent pb-3 font-medium text-n8n-accent">Workflows</span>
          <Link href="/credentials" className="shrink-0 pb-3 text-zinc-400 transition-colors hover:text-zinc-200">Credentials</Link>
          <Link href="/executions" className="shrink-0 pb-3 text-zinc-400 transition-colors hover:text-zinc-200">Executions</Link>
          <span className="shrink-0 pb-3 text-zinc-400">Variables</span>
          <span className="shrink-0 pb-3 text-zinc-400">Data tables</span>
        </div>

        <div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row">
          <label className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-n8n-accent"
            />
          </label>
          <select defaultValue="updated" className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-n8n-accent">
            <option value="updated">Sort by last updated</option>
          </select>
          <button type="button" aria-label="Filter workflows" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200">
            <ListFilter className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-lg border border-white/10 bg-n8n-panel px-4 py-8 text-center text-sm text-zinc-500">Loading workflows...</div>
          ) : filteredWorkflows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">No workflows found.</div>
          ) : (
            filteredWorkflows.map((workflow) => (
              <Link key={workflow.id} href={`/workflows/${workflow.id}/editor`} className="flex items-center gap-3 rounded-lg border border-white/10 bg-n8n-panel px-4 py-3 transition-colors hover:border-white/20">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-n8n-accent/10 text-n8n-accent">
                  <WorkflowIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-50">{workflow.name}</span>
                  <span className="block truncate text-xs text-zinc-500">Last updated {formatRelativeTime(workflow.updatedAt)} · Created {formatDate(workflow.createdAt)}</span>
                </span>
                <span className="hidden items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-300 sm:inline-flex">
                  <UserRound className="h-3 w-3" /> Personal
                </span>
                <MoreVertical className="h-4 w-4 shrink-0 text-zinc-500" />
              </Link>
            ))
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-600">Total {filteredWorkflows.length} workflows</p>
      </div>
      <AIGeneratorModal open={aiOpen} onClose={() => setAiOpen(false)} onCreated={() => {}} />
    </AppLayout>
  );
}
