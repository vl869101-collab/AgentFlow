"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Clock3, MoreHorizontal, Plus, Search, Workflow as WorkflowIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { workflows, type Workflow } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

function workflowStatus(status: string): BadgeStatus {
  return status === "ACTIVE" ? "success" : status === "PAUSED" ? "warning" : status === "DRAFT" ? "info" : "neutral";
}
function workflowStatusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [data, setData] = useState<Workflow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({ name: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("agentflow_token")) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    workflows.list().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => data.filter((wf) =>
      (filter === "all" || wf.status === filter) &&
      `${wf.name} ${wf.description}`.toLowerCase().includes(query.toLowerCase())
    ),
    [filter, query, data]
  );

  if (!authed) return null;

  async function createWorkflow(event: React.FormEvent) {
    event.preventDefault();
    if (!newWorkflow.name.trim()) return;
    try {
      const created = await workflows.create({ name: newWorkflow.name, description: newWorkflow.description });
      setData((items) => [created, ...items]);
      setNewWorkflow({ name: "", description: "" });
      setCreateOpen(false);
    } catch {}
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-500">Loading workflows...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-400">Automation library</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-50">Workflows</h1>
            <p className="mt-2 text-sm text-zinc-500">Design repeatable systems for the work your team does every day.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New workflow</Button>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workflows"
              className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 pl-10 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-transparent focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "DRAFT", label: "Draft" },
              { value: "PAUSED", label: "Paused" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
            className="sm:w-44"
          />
        </div>

        <div className="mt-6 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((wf, index) => (
              <motion.div
                key={wf.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="group flex h-full flex-col transition-all duration-200 hover:scale-[1.02] hover:border-white/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                      <WorkflowIcon className="h-4 w-4" />
                    </div>
                    <Badge status={workflowStatus(wf.status)}>{workflowStatusLabel(wf.status)}</Badge>
                  </div>
                  <Link href={`/workflows/${wf.id}/editor`} className="mt-5 text-base font-medium text-zinc-100 hover:text-violet-300">
                    {wf.name}
                  </Link>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">{wf.description}</p>
                  <div className="mt-auto flex items-center justify-between pt-5 text-xs text-zinc-600">
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />{formatRelativeTime(wf.updatedAt)}
                    </span>
                  </div>
                  <Link
                    href={`/workflows/${wf.id}/editor`}
                    className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-zinc-700"
                  >
                    Open editor <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-600">
            No workflows match those filters.
          </div>
        )}

        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create workflow" description="Start with a clear name. You can shape the flow in the editor.">
          <form onSubmit={createWorkflow} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Workflow name</label>
              <input
                value={newWorkflow.name}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                placeholder="e.g. Qualify inbound leads"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-500"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Description</label>
              <textarea
                value={newWorkflow.description}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                rows={4}
                placeholder="What should this workflow accomplish?"
                className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create workflow</Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppLayout>
  );
}
