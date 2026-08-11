"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Play, Workflow, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { formatRelativeTime } from "@/lib/utils";
import { dashboardStats, mockExecutions } from "@/lib/mock-data";
import { AIGeneratorModal } from "@/components/ai/AIGeneratorModal";

const statIcons = { Activity, CheckCircle2, Workflow, Clock3 };
const statTones = { indigo: "bg-indigo-500/10 text-indigo-300", green: "bg-green-500/10 text-green-300", violet: "bg-violet-500/10 text-violet-300", amber: "bg-amber-500/10 text-amber-300" };

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
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-400">Monday, August 10, 2026</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-50">Good afternoon, Victor.</h1>
            <p className="mt-2 text-sm text-zinc-500">Here's what your workspace has been moving while you've been away.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setAiOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white">
              <Sparkles className="h-4 w-4" /> Generate with AI
            </button>
            <Link href="/workflows/order-risk-routing/editor" className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              <Play className="h-4 w-4" /> Run a workflow
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat, index) => {
            const Icon = statIcons[stat.icon as keyof typeof statIcons];
            return (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className="transition-all duration-200 hover:scale-[1.02] hover:border-white/20">
                  <div className="flex items-start justify-between">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${statTones[stat.tone]}`}><Icon className="h-4 w-4" /></div>
                    <span className="text-xs font-medium text-green-400">{stat.delta}</span>
                  </div>
                  <p className="mt-5 text-2xl font-semibold tracking-tight text-zinc-50">{stat.value}</p>
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
              {mockExecutions.slice(0, 5).map((ex) => (
                <Link key={ex.id} href={`/executions/${ex.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge status={statusFor(ex.status)}>{statusLabel(ex.status)}</Badge>
                    <div>
                      <p className="text-sm text-zinc-200">{ex.workflow}</p>
                      <p className="text-xs text-zinc-600">{formatRelativeTime(ex.startedAt)}</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-600">{ex.duration}</span>
                </Link>
              ))}
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
                    <Workflow className="h-5 w-5 text-indigo-400" />
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
