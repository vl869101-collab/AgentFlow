"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BentoGrid, type DashboardStats } from "@/components/dashboard/BentoGrid";
import { InfrastructureMonitor } from "@/components/dashboard/InfrastructureMonitor";
import { McpNodesHub } from "@/components/dashboard/McpNodesHub";
import { RecentRunsTable } from "@/components/dashboard/RecentRunsTable";
import { getToken, executions, workflows, type Execution, type Workflow } from "@/lib/api";
import "@/components/dashboard/dashboard-tokens.css";

function computeStats(runs: Execution[], workflowList: Workflow[]): DashboardStats {
  const totalExecutions = runs.length;
  const failedExecutions = runs.filter((run) => run.status === "error").length;
  const finished = runs.filter((run) => run.status !== "running" && run.status !== "pending");
  const durations = finished
    .map((run) => run.duration)
    .filter((duration): duration is number => typeof duration === "number" && Number.isFinite(duration) && duration >= 0);
  const avgDurationMs = durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

  const sortedByTime = [...runs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  const buildTrend = (source: Execution[], predicate: (run: Execution) => boolean): number[] => {
    const buckets = new Array<number>(12).fill(0);
    if (source.length === 0) return buckets;
    const newest = new Date(source[source.length - 1].startedAt).getTime();
    const oldest = new Date(source[0].startedAt).getTime();
    const span = Math.max(newest - oldest, 60_000);
    for (const run of source) {
      if (!predicate(run)) continue;
      const offset = new Date(run.startedAt).getTime() - oldest;
      const bucketIndex = Math.min(11, Math.floor((offset / span) * 12));
      buckets[bucketIndex] += 1;
    }
    return buckets;
  };

  return {
    totalExecutions,
    failedExecutions,
    failureRate: totalExecutions > 0 ? failedExecutions / totalExecutions : 0,
    avgDurationMs,
    activeWorkflows: workflowList.filter((workflow) => workflow.status === "active").length,
    totalWorkflows: workflowList.length,
    executionTrend: buildTrend(sortedByTime, () => true),
    failureTrend: buildTrend(sortedByTime, (run) => run.status === "error"),
    durationTrend: durations.length > 0 ? buildTrend(sortedByTime, (run) => typeof run.duration === "number") : [],
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [runs, setRuns] = useState<Execution[] | null>(null);
  const [workflowList, setWorkflowList] = useState<Workflow[]>([]);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      setAuthState("unauthenticated");
      return;
    }
    setAuthState("authenticated");
  }, [router]);

  const loadDashboardData = useCallback(async () => {
    try {
      const [executionList, fetchedWorkflows] = await Promise.all([executions.list(), workflows.list()]);
      setRuns(Array.isArray(executionList) ? executionList : []);
      setWorkflowList(Array.isArray(fetchedWorkflows) ? fetchedWorkflows : []);
    } catch {
      setRuns((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadDashboardData();
  }, [authState, loadDashboardData]);

  const workflowNames = useMemo(
    () => new Map(workflowList.map((workflow) => [workflow.id, workflow.name])),
    [workflowList],
  );

  const stats = useMemo(() => computeStats(runs ?? [], workflowList), [runs, workflowList]);

  if (authState === "checking" || authState === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-500" role="status">
          {authState === "checking" ? "Loading dashboard…" : "Redirecting to login…"}
        </p>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="af-dash space-y-6 pb-10">
        <header className="af-dash-reveal flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-violet-400 uppercase">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AgentFlow Console
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
              Mission control
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live view of runs, infrastructure and the automation catalog.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAiGeneratorOpen((open) => !open)}
            aria-expanded={aiGeneratorOpen}
            aria-controls="ai-generator-panel"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus-visible:outline-none"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Generate with AI
          </button>
        </header>

        {aiGeneratorOpen ? (
          <div
            id="ai-generator-panel"
            className="af-dash-card af-dash-reveal flex items-center gap-3 p-4 text-sm text-zinc-400"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
            <p>
              The AI workflow generator lives in the{" "}
              <a href="/" className="text-violet-300 underline decoration-dotted underline-offset-2 hover:text-violet-200">
                workflow editor
              </a>
              . Opening it keeps this dashboard lightweight.
            </p>
          </div>
        ) : null}

        <BentoGrid stats={stats} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <McpNodesHub />
          </div>
          <InfrastructureMonitor />
        </div>

        <RecentRunsTable workflowNames={workflowNames} />
      </div>
    </AppLayout>
  );
}
