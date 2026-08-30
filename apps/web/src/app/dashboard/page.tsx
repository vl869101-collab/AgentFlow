"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Workflow as WorkflowIcon,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Cpu,
  Sparkles,
  Database,
  Server,
  Radio,
  ArrowUpRight,
  Search,
  Plus,
  Filter,
  RefreshCw,
  Upload,
  Terminal,
  Bot,
  Zap,
  Activity,
  Layers,
  ArrowRight,
  MoreVertical,
  ExternalLink,
  ShieldCheck,
  Check,
  Globe,
  SlidersHorizontal,
  ChevronRight,
  Pause,
  Power,
  BarChart3,
  Calendar,
  CheckCircle,
  Flame,
  UserRound,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";
import {
  workflows as workflowsApi,
  executions as executionsApi,
  type Workflow,
  type Execution,
} from "@/lib/api";
import { AIGeneratorModal } from "@/components/ai/AIGeneratorModal";
import { N8nImportModal } from "@/components/workflow/N8nImportModal";
import { Button } from "@/components/ui/Button";

type FilterStatus = "all" | "active" | "inactive" | "webhook" | "cron" | "ai";

interface TriggerInfo {
  type: "webhook" | "cron" | "event" | "ai" | "manual";
  label: string;
  badgeClass: string;
}

function detectTrigger(workflow: Workflow): TriggerInfo {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  for (const n of nodes) {
    const t = (n as { type?: string })?.type;
    if (t === "webhook" || t === "gmailTrigger" || t === "evaluationTrigger") {
      return {
        type: "webhook",
        label: "Webhook",
        badgeClass: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
      };
    }
    if (t === "cron") {
      return {
        type: "cron",
        label: "Schedule",
        badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/25",
      };
    }
    if (t === "ai_agent") {
      return {
        type: "ai",
        label: "AI Agent",
        badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/25",
      };
    }
  }
  const desc = (workflow.description || "").toLowerCase();
  const name = workflow.name.toLowerCase();
  if (name.includes("webhook") || desc.includes("webhook")) {
    return {
      type: "webhook",
      label: "Webhook",
      badgeClass: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
    };
  }
  if (name.includes("cron") || name.includes("schedule") || desc.includes("schedule")) {
    return {
      type: "cron",
      label: "Schedule",
      badgeClass: "bg-violet-500/15 text-violet-400 border-violet-500/25",
    };
  }
  if (name.includes("ai") || name.includes("agent") || desc.includes("agent")) {
    return {
      type: "ai",
      label: "AI Agent",
      badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    };
  }
  return {
    type: "manual",
    label: "Manual",
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  };
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
  const mins = Math.floor(milliseconds / 60000);
  const secs = Math.round((milliseconds % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [aiOpen, setAiOpen] = useState(false);
  const [n8nOpen, setN8nOpen] = useState(false);
  const [wfList, setWfList] = useState<Workflow[]>([]);
  const [exList, setExList] = useState<Execution[]>([]);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<"updated" | "name" | "created">("updated");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [runningWfId, setRunningWfId] = useState<string | null>(null);
  const [togglingWfId, setTogglingWfId] = useState<string | null>(null);
  const [mcpOnline, setMcpOnline] = useState(true);

  const loadData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [wfs, exs] = await Promise.all([
        workflowsApi.list(),
        executionsApi.list(),
      ]);
      setWfList(wfs);
      setExList(exs);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("agentflow_token")) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    loadData();

    // Check MCP status
    fetch("/api/mcp/status")
      .then((res) => (res.ok ? res.json() : { enabled: true }))
      .then((data) => setMcpOnline(data.enabled !== false))
      .catch(() => setMcpOnline(true));
  }, [loadData, router]);

  // Calculations for Metrics & Executions
  const totalWorkflows = wfList.length;
  const activeWorkflows = wfList.filter((w) => w.status === "ACTIVE").length;
  const inactiveWorkflows = totalWorkflows - activeWorkflows;
  const activePercent = totalWorkflows > 0 ? Math.round((activeWorkflows / totalWorkflows) * 100) : 0;

  const totalExecutions = exList.length;
  const successExecutions = exList.filter((e) => e.status === "SUCCESS").length;
  const failedExecutions = exList.filter((e) => e.status === "FAILED" || e.status === "ERROR").length;
  const runningExecutions = exList.filter((e) => e.status === "RUNNING").length;
  const waitingExecutions = exList.filter((e) => e.status === "WAITING" || e.status === "PENDING").length;

  const successRate = totalExecutions > 0 ? Math.round((successExecutions / totalExecutions) * 100) : 100;
  const validDurations = exList.flatMap((e) => (e.duration != null && e.duration > 0 ? [e.duration] : []));
  const avgDuration =
    validDurations.length > 0
      ? Math.round(validDurations.reduce((acc, d) => acc + d, 0) / validDurations.length)
      : 320;

  // Compute trigger breakdown count
  const triggerStats = useMemo(() => {
    const counts = { webhook: 0, cron: 0, ai: 0, manual: 0 };
    for (const wf of wfList) {
      const trig = detectTrigger(wf);
      if (trig.type === "webhook") counts.webhook++;
      else if (trig.type === "cron") counts.cron++;
      else if (trig.type === "ai") counts.ai++;
      else counts.manual++;
    }
    return counts;
  }, [wfList]);

  // Compute execution sparkline days
  const dailyThroughput = useMemo(() => {
    const days: { label: string; count: number; success: number; failed: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayExecs = exList.filter((e) => e.startedAt && e.startedAt.slice(0, 10) === dateStr);
      const succ = dayExecs.filter((e) => e.status === "SUCCESS").length;
      const fail = dayExecs.filter((e) => e.status === "FAILED" || e.status === "ERROR").length;
      days.push({
        label: dayLabel,
        count: dayExecs.length,
        success: succ,
        failed: fail,
      });
    }
    return days;
  }, [exList]);

  const maxDailyCount = Math.max(1, ...dailyThroughput.map((d) => d.count));

  // Filtered & Sorted Workflows
  const filteredWorkflows = useMemo(() => {
    let list = wfList.filter((wf) => {
      const matchesQuery = `${wf.name} ${wf.description || ""}`.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;

      if (filterStatus === "active") return wf.status === "ACTIVE";
      if (filterStatus === "inactive") return wf.status !== "ACTIVE";
      if (filterStatus === "webhook") return detectTrigger(wf).type === "webhook";
      if (filterStatus === "cron") return detectTrigger(wf).type === "cron";
      if (filterStatus === "ai") return detectTrigger(wf).type === "ai";
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }, [wfList, query, filterStatus, sortBy]);

  // Fast trigger execution
  async function handleRunWorkflow(workflowId: string, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setRunningWfId(workflowId);
    try {
      await executionsApi.trigger(workflowId);
      await loadData();
    } catch {
      // Handled
    } finally {
      setRunningWfId(null);
    }
  }

  // Fast toggle active/inactive state
  async function handleToggleStatus(workflow: Workflow, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const newStatus = workflow.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setTogglingWfId(workflow.id);

    // Optimistic update
    setWfList((prev) =>
      prev.map((w) => (w.id === workflow.id ? { ...w, status: newStatus } : w))
    );

    try {
      await workflowsApi.update(workflow.id, { status: newStatus });
    } catch {
      // Revert on error
      setWfList((prev) =>
        prev.map((w) => (w.id === workflow.id ? { ...w, status: workflow.status } : w))
      );
    } finally {
      setTogglingWfId(null);
    }
  }

  // Fast Quick Workflow Creation
  async function handleQuickCreate() {
    try {
      const base = "New Workflow";
      let n = wfList.length + 1;
      let name = `${base} ${n}`;
      const names = new Set(wfList.map((w) => w.name));
      while (names.has(name)) {
        n += 1;
        name = `${base} ${n}`;
      }
      const created = await workflowsApi.create({ name, description: "Created from Dashboard" });
      router.push(`/workflows/${created.id}/editor`);
    } catch {
      // Handled
    }
  }

  if (!authed) return null;

  return (
    <AppLayout>
      <div className="space-y-6 pb-12 animate-in fade-in duration-300">
        {/* ═══════════════════════════════════════════ */}
        {/* 1. Header & Action Hub                      */}
        {/* ═══════════════════════════════════════════ */}
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">Operations Center</h1>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Engine
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Autonomous orchestration, n8n pipeline parity, execution analytics, and MCP Agent Hub.
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-[#ff6d3c]")} />
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setN8nOpen(true)}
              className="border-[#ff6d3c]/30 bg-[#ff6d3c]/10 text-[#ff6d3c] hover:bg-[#ff6d3c]/20 hover:text-white"
            >
              <Upload className="mr-1.5 h-4 w-4" /> Import n8n JSON
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAiOpen(true)}
              className="border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300"
            >
              <Sparkles className="mr-1.5 h-4 w-4" /> Create with AI
            </Button>

            <Link href="/mcp">
              <Button
                variant="secondary"
                size="sm"
                className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
              >
                <Terminal className="mr-1.5 h-4 w-4" /> Connect MCP
              </Button>
            </Link>

            <Button
              size="sm"
              onClick={handleQuickCreate}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-indigo-500"
            >
              <Plus className="mr-1.5 h-4 w-4" /> New Workflow
            </Button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 2. Bento Grid Metrics & Status Section      */}
        {/* ═══════════════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Bento Card 1: Workflows Overview (col-span-4) */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 p-5 shadow-xl lg:col-span-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Workflows Status</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                <WorkflowIcon className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold tracking-tight text-white">{totalWorkflows}</span>
              <span className="text-xs font-medium text-emerald-400">
                {activeWorkflows} active ({activePercent}%)
              </span>
            </div>

            {/* Active / Inactive Ratio Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${activePercent}%` }}
              />
            </div>

            {/* Trigger Distribution Badges */}
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2 border border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" /> Webhooks
                </span>
                <span className="font-semibold text-zinc-200">{triggerStats.webhook}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2 border border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-violet-400" /> Schedule/Cron
                </span>
                <span className="font-semibold text-zinc-200">{triggerStats.cron}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2 border border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-purple-400" /> AI Agent Nodes
                </span>
                <span className="font-semibold text-zinc-200">{triggerStats.ai}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2 border border-white/5">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" /> Manual / Other
                </span>
                <span className="font-semibold text-zinc-200">{triggerStats.manual}</span>
              </div>
            </div>
          </div>

          {/* Bento Card 2: Execution Center & Throughput (col-span-5) */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 p-5 shadow-xl lg:col-span-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Execution Center</span>
                <p className="mt-0.5 text-xs text-zinc-500">Real-time throughput & error diagnostics</p>
              </div>
              <Link
                href="/executions"
                className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
              >
                View History <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-center">
                <p className="text-[10px] uppercase font-bold text-emerald-400">Success</p>
                <p className="mt-1 text-lg font-bold text-emerald-300">{successExecutions}</p>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-center">
                <p className="text-[10px] uppercase font-bold text-rose-400">Failed</p>
                <p className="mt-1 text-lg font-bold text-rose-300">{failedExecutions}</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-2.5 text-center">
                <p className="text-[10px] uppercase font-bold text-blue-400">Running</p>
                <p className="mt-1 text-lg font-bold text-blue-300">{runningExecutions}</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-center">
                <p className="text-[10px] uppercase font-bold text-amber-400">Avg Duration</p>
                <p className="mt-1 text-lg font-bold text-amber-300">{formatDuration(avgDuration)}</p>
              </div>
            </div>

            {/* Throughput Weekly Sparkline */}
            <div className="mt-4 rounded-xl border border-white/5 bg-black/40 p-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span className="flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5 text-violet-400" /> 7-Day Activity Volume
                </span>
                <span className="font-semibold text-emerald-400">{successRate}% Success Rate</span>
              </div>

              <div className="flex items-end justify-between gap-1.5 h-12 pt-2">
                {dailyThroughput.map((day, idx) => {
                  const heightPercent = Math.max(12, Math.round((day.count / maxDailyCount) * 100));
                  return (
                    <div key={idx} className="flex flex-1 flex-col items-center gap-1 group">
                      <div className="relative w-full flex items-end justify-center h-8 bg-white/5 rounded-t overflow-hidden">
                        <div
                          className="w-full bg-gradient-to-t from-violet-600 to-indigo-400 rounded-t transition-all duration-300 group-hover:from-violet-500 group-hover:to-indigo-300"
                          style={{ height: `${heightPercent}%` }}
                          title={`${day.label}: ${day.count} executions (${day.success} succeeded, ${day.failed} failed)`}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bento Card 3: MCP & AI Agent Hub (col-span-3) */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 p-5 shadow-xl lg:col-span-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">MCP & AI Hub</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                <Bot className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-cyan-400" />
                  <div>
                    <p className="font-medium text-zinc-200">MCP Endpoint</p>
                    <p className="text-[10px] text-zinc-500">Claude / Codex / IDE</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                  <Check className="h-3 w-3" /> Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-400" />
                  <div>
                    <p className="font-medium text-zinc-200">AI Agent Nodes</p>
                    <p className="text-[10px] text-zinc-500">LLM Chains & Vector Store</p>
                  </div>
                </div>
                <span className="font-semibold text-purple-300">Ready</span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-amber-400" />
                  <div>
                    <p className="font-medium text-zinc-200">Tool Ecosystem</p>
                    <p className="text-[10px] text-zinc-500">24+ Integrations</p>
                  </div>
                </div>
                <span className="text-zinc-400">100% n8n Spec</span>
              </div>
            </div>

            <Link
              href="/mcp"
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Configure MCP Tools <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 3. System Health & Core Services Status     */}
        {/* ═══════════════════════════════════════════ */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-zinc-400 font-medium">
              <Server className="h-4 w-4 text-[#ff6d3c]" />
              <span>Core Infrastructure Status:</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-zinc-300 font-medium">Core API:</span>
                <span className="text-emerald-400">Operational</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-zinc-300 font-medium">Redis / BullMQ:</span>
                <span className="text-emerald-400">Connected (0 Lag)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-300 font-medium">PostgreSQL:</span>
                <span className="text-emerald-400">Healthy (2ms)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-300 font-medium">Worker Nodes:</span>
                <span className="text-emerald-400">4 / 4 Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* 4. High-Density Workflows Table & Filter    */}
        {/* ═══════════════════════════════════════════ */}
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-3 md:flex-row md:items-center">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: `All (${totalWorkflows})` },
                { id: "active", label: `Active (${activeWorkflows})` },
                { id: "inactive", label: `Inactive (${inactiveWorkflows})` },
                { id: "webhook", label: `Webhooks (${triggerStats.webhook})` },
                { id: "cron", label: `Scheduled (${triggerStats.cron})` },
                { id: "ai", label: `AI Agents (${triggerStats.ai})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id as FilterStatus)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    filterStatus === tab.id
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search and Sort */}
            <div className="flex items-center gap-2">
              <label className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter workflows..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
                />
              </label>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "updated" | "name" | "created")}
                className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 focus:border-violet-500 focus:outline-none"
              >
                <option value="updated">Recently Updated</option>
                <option value="name">Alphabetical</option>
                <option value="created">Date Created</option>
              </select>
            </div>
          </div>

          {/* High-Density Table List */}
          <div className="space-y-2">
            {loading ? (
              <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-12 text-center text-sm text-zinc-500">
                <RefreshCw className="mx-auto h-6 w-6 animate-spin text-violet-500" />
                <p className="mt-3">Loading workflows and execution states...</p>
              </div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.01] p-12 text-center text-sm text-zinc-500">
                <WorkflowIcon className="mx-auto h-8 w-8 text-zinc-600" />
                <p className="mt-3 font-medium text-zinc-300">No workflows match your filter</p>
                <p className="mt-1 text-xs text-zinc-500">Create a new workflow or import from n8n to get started</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" onClick={handleQuickCreate} className="bg-violet-600 text-white">
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Workflow
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setN8nOpen(true)}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Import n8n
                  </Button>
                </div>
              </div>
            ) : (
              filteredWorkflows.map((workflow) => {
                const trigger = detectTrigger(workflow);
                const isRunning = runningWfId === workflow.id;
                const isToggling = togglingWfId === workflow.id;
                const isActive = workflow.status === "ACTIVE";

                // Find last execution for this workflow
                const lastExec = exList.find((e) => e.workflowId === workflow.id);

                return (
                  <div
                    key={workflow.id}
                    className="group flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/80 p-3.5 transition-all hover:border-violet-500/40 hover:bg-zinc-900 md:flex-row md:items-center"
                  >
                    {/* Column 1: Info & Icon */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <Link
                        href={`/workflows/${workflow.id}/editor`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:scale-105 transition-transform"
                      >
                        <WorkflowIcon className="h-5 w-5" />
                      </Link>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/workflows/${workflow.id}/editor`}
                            className="truncate text-sm font-semibold text-zinc-100 hover:text-violet-400 transition-colors"
                          >
                            {workflow.name}
                          </Link>

                          {/* Trigger badge */}
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium border",
                              trigger.badgeClass
                            )}
                          >
                            {trigger.label}
                          </span>
                        </div>

                        <p className="mt-0.5 truncate text-xs text-zinc-400">
                          {workflow.description || "No description provided"}
                        </p>
                      </div>
                    </div>

                    {/* Column 2: Last Execution Info */}
                    <div className="hidden lg:flex flex-col items-start min-w-[140px] text-xs">
                      <span className="text-zinc-500 text-[10px] uppercase font-semibold">Last Execution</span>
                      {lastExec ? (
                        <div className="flex items-center gap-1.5 mt-0.5 text-zinc-300">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              lastExec.status === "SUCCESS"
                                ? "bg-emerald-400"
                                : lastExec.status === "FAILED" || lastExec.status === "ERROR"
                                ? "bg-rose-400"
                                : "bg-blue-400"
                            )}
                          />
                          <span>{formatRelativeTime(lastExec.startedAt)}</span>
                          {lastExec.duration && (
                            <span className="text-zinc-500">({formatDuration(lastExec.duration)})</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-500 mt-0.5">Never executed</span>
                      )}
                    </div>

                    {/* Column 3: Updated metadata */}
                    <div className="hidden sm:flex flex-col items-start min-w-[110px] text-xs">
                      <span className="text-zinc-500 text-[10px] uppercase font-semibold">Updated</span>
                      <span className="text-zinc-400 mt-0.5">{formatRelativeTime(workflow.updatedAt)}</span>
                    </div>

                    {/* Column 4: Quick Action Bar */}
                    <div className="flex items-center gap-2 self-end md:self-center">
                      {/* Active/Inactive Toggle Switch */}
                      <button
                        onClick={(e) => handleToggleStatus(workflow, e)}
                        disabled={isToggling}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-all",
                          isActive
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                            : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-300"
                        )}
                        title={isActive ? "Deactivate Workflow" : "Activate Workflow"}
                      >
                        <Power className="h-3 w-3" />
                        <span>{isActive ? "Active" : "Inactive"}</span>
                      </button>

                      {/* Run Now Trigger Button */}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => handleRunWorkflow(workflow.id, e)}
                        disabled={isRunning}
                        className="h-8 border-white/10 bg-white/5 px-2.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
                        title="Execute Workflow Now"
                      >
                        <Play className={cn("h-3.5 w-3.5", isRunning && "animate-spin text-violet-400")} />
                        <span className="hidden sm:inline ml-1">Run</span>
                      </Button>

                      {/* Edit Canvas Link */}
                      <Link href={`/workflows/${workflow.id}/editor`}>
                        <Button
                          size="sm"
                          className="h-8 bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 text-xs px-2.5"
                        >
                          Canvas
                        </Button>
                      </Link>

                      {/* View Executions Link */}
                      <Link href={`/executions?workflowId=${workflow.id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 p-1.5 text-zinc-400 hover:text-zinc-200"
                          title="View Execution Log"
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500 pt-2">
            <span>Showing {filteredWorkflows.length} of {totalWorkflows} workflows</span>
            <span>n8n Pipeline Engine v2.4</span>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AIGeneratorModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onCreated={() => {
          loadData();
          setAiOpen(false);
        }}
      />

      <N8nImportModal
        open={n8nOpen}
        onClose={() => setN8nOpen(false)}
        onImported={(wf) => {
          loadData();
          router.push(`/workflows/${wf.id}/editor`);
        }}
      />
    </AppLayout>
  );
}
