"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { ChevronDown, ListFilter, MoreVertical, Search, UserRound, Workflow as WorkflowIcon } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Modal } from "@/components/ui/Modal";
import { workflows, type Workflow } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/utils";

function statusDot(status: string) {
  if (status === "ACTIVE") return "bg-emerald-500";
  if (status === "PAUSED") return "bg-amber-500";
  return "bg-zinc-500";
}

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20";
  if (status === "PAUSED") return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
  if (status === "DRAFT") return "bg-white/10 text-zinc-400 border border-white/10";
  return "bg-white/10 text-zinc-500 border border-white/10";
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [data, setData] = useState<Workflow[]>([]);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [newWorkflow, setNewWorkflow] = useState({ name: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("agentflow_token")) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    workflows.list().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const filtered = useMemo(
    () => data.filter((wf) => `${wf.name} ${wf.description}`.toLowerCase().includes(query.toLowerCase())),
    [query, data]
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

  async function handleToggle(id: string, current: string) {
    const next = current === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const updated = await workflows.update(id, { status: next });
      setData((items) => items.map((w) => (w.id === id ? updated : w)));
    } catch {}
    setMenuOpen(null);
  }

  async function handleDelete(id: string) {
    try {
      await workflows.delete(id);
      setData((items) => items.filter((w) => w.id !== id));
    } catch {}
    setMenuOpen(null);
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-zinc-500">Loading workflows...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Workflows</h1>
            <p className="mt-1 text-sm text-zinc-500">Manage your automation workflows</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600"
          >
            Create workflow <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
          <label className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500"
            />
          </label>
          <select
            defaultValue="updated"
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-400 outline-none focus:border-violet-500"
          >
            <option value="updated">Sort by last updated</option>
          </select>
          <button
            type="button"
            aria-label="Filter workflows"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <ListFilter className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-zinc-900 px-6 py-12 text-center">
              <p className="text-sm text-zinc-500">No workflows found.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-4 inline-flex items-center rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
              >
                Create workflow
              </button>
            </div>
          ) : (
            filtered.map((wf) => (
              <div
                key={wf.id}
                className="group flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 transition-colors hover:border-white/20"
              >
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-500">
                  <WorkflowIcon className="h-4 w-4" />
                  <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 ${statusDot(wf.status)}`} />
                </span>
                <Link href={`/workflows/${wf.id}/editor`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-50">{wf.name}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    Last updated {formatRelativeTime(wf.updatedAt)} · Created {formatDate(wf.createdAt)}
                  </span>
                </Link>
                <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline-block ${statusBadgeClass(wf.status)}`}>
                  {wf.status}
                </span>
                <span className="hidden items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-300 sm:inline-flex">
                  <UserRound className="h-3 w-3" /> Personal
                </span>
                <div className="relative" ref={menuOpen === wf.id ? menuRef : undefined}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen((v) => (v === wf.id ? null : wf.id));
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                    aria-label="Workflow actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpen === wf.id && (
                    <div className="absolute right-0 top-9 z-10 w-44 rounded-md border border-white/10 bg-zinc-900 py-1 shadow-lg">
                      <Link
                        href={`/workflows/${wf.id}/editor`}
                        className="block px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
                        onClick={() => setMenuOpen(null)}
                      >
                        Open editor
                      </Link>
                      <button
                        onClick={() => handleToggle(wf.id, wf.status)}
                        className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-white/5"
                      >
                        {wf.status === "ACTIVE" ? "Pause" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(wf.id)}
                        className="block w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-white/5"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-600">Total {filtered.length} workflows</p>

        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Create workflow"
          description="Start with a clear name. You can shape the flow in the editor."
        >
          <form onSubmit={createWorkflow} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Workflow name</label>
              <input
                value={newWorkflow.name}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                placeholder="e.g. Qualify inbound leads"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Description</label>
              <textarea
                value={newWorkflow.description}
                onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                rows={4}
                placeholder="What should this workflow accomplish?"
                className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600">
                Create workflow
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppLayout>
  );
}
