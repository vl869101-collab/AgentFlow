"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Play, Workflow as WorkflowIcon, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/utils";
import { workflows as workflowsApi, executions as executionsApi, type Workflow, type Execution } from "@/lib/api";
import { AIGeneratorModal } from "@/components/ai/AIGeneratorModal";

const statTones = { indigo: "bg-indigo-500/10 text-indigo-300", green: "bg-green-500/10 text-green-300", violet: "bg-violet-500/10 text-violet-300", amber: "bg-amber-500/10 text-amber-300" } as const;

function statusFor(status: string): BadgeStatus {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "error";
  if (status === "RUNNING" || status === "WAITING_APPROVAL") return "warning";
  return "neutral";
}

function statusLabel(status: string) {
  return status === "WAITING_APPROVAL" ? "Waiting approval" : status.charAt(0) + status.slice(1).toLowerCase();
}

export default function DashboardPage() {
  const router = useRouter();
  const [aiOpen, setAiOpen] = useState(false);
  const [wfList, setWfList] = useState<Workflow[]>([]);
  const [exList, setExList] = useState<Execution[]>([]);
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

  if (!authed) return null;

  const activeWorkflows = wfList.filter((w) => w.status === "ACTIVE").length;
  const totalExecutions = exList.length;
  const successExecs = exList.filter((e) => e.status === "SUCCESS").length;
  const successRate = totalExecutions > 0 ? Math.round((successExecs / totalExecutions) * 100) : 0;

  const stats = [
    { label: "Total workflows", value: String(wfList.length), delta: `+${activeWorkflows} active`, tone: "indigo" as const, icon: WorkflowIcon },
    { label: "Total executions", value: String(totalExecutions), delta: `${successRate}% success`, tone: "green" as const, icon: CheckCircle2 },
    { label: "Active workflows", value: String(activeWorkflows), delta: "", tone: "violet" as const, icon: Activity },
    { label: "Success rate", value: `${successRate}%`, delta: "", tone: "amber" as const, icon: Clock3 },
  ];

  const recentEx = exList.slice(0, 5);

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-400">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-50">Dashboard</h1>
            <p className="mt-2 text-sm text-zinc-500">Here&#39;s what your workspace has been moving.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setAiOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white">
              <Sparkles className="h-4 w-4" /> Generate with AI
            </button>
            <Link href="/workflows" className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              <Play className="h-4 w-4" /> Run a workflow
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className="transition-all duration-200 hover:scale-[1.02] hover:border-white/20">
                  <div className="flex items-start justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${statTones[stat.tone]}`}><Icon className="h-4 w-4" /></div>
                    {stat.delta && <span className="text-xs font-medium text-green-400">{stat.delta}</span>}
                  </div>
                  <p className="mt-5 text-2xl font-semibold tracking-tight text-zinc-50">{loading ? "—" : stat.value}</p>
                  <p className="mt-1 text-xs text-zinc-500">{stat.label}</p>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div>
                <h2 className="text-lg font-medium text-zinc-100">Recent executions</h2>
                <p className="mt-1 text-xs text-zinc-600">The last few moments in your automation layer.</p>
              </div>
              <Link href="/executions" className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-white/5">
              {loading ? (
                <div className="py-12 text-center text-sm text-zinc-500">Loading...</div>
              ) : recentEx.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-500">No executions yet.</div>
              ) : (
                recentEx.map((ex) => (
                  <Link key={ex.id} href={`/executions/${ex.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <Badge status={statusFor(ex.status)}>{statusLabel(ex.status)}</Badge>
                      <div>
                        <p className="text-sm text-zinc-200">{ex.workflow?.name || "Workflow"}</p>
                        <p className="text-xs text-zinc-600">{formatRelativeTime(ex.startedAt)}</p>
                      </div>
                    </div>
                    {ex.duration != null && <span className="text-xs text-zinc-600">{ex.duration}ms</span>}
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div>
                <h2 className="text-lg font-medium text-zinc-100">Quick start</h2>
                <p className="mt-1 text-xs text-zinc-600">Jump into your next automation.</p>
              </div>
            </div>
            <div className="space-y-2 p-4">
              <button onClick={() => setAiOpen(true)} className="w-full rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/5 group">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                    <Sparkles className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200 group-hover:text-violet-300 transition-colors">Generate with AI</p>
                    <p className="text-xs text-zinc-600">Describe your workflow and let AI build it</p>
                  </div>
                </div>
              </button>
              <Link href="/workflows" className="block w-full rounded-lg border border-dashed border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/5 group">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10">
                    <WorkflowIcon className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200 group-hover:text-indigo-300 transition-colors">Start from scratch</p>
                    <p className="text-xs text-zinc-600">Build a workflow step by step</p>
                  </div>
                </div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
      <AIGeneratorModal open={aiOpen} onClose={() => setAiOpen(false)} onCreated={() => {}} />
    </AppLayout>
  );
}
