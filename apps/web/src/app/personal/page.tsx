"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Database, FlaskConical, MoreVertical, Search, SlidersHorizontal, UserRound, Workflow as WorkflowIcon, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { workflows as workflowsApi, credentials as credApi, executions as executionsApi, type Workflow, type Credential, type Execution } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/utils";

type Tab = "workflows" | "credentials" | "executions" | "variables" | "data_tables";

const tabs: { id: Tab; label: string }[] = [
  { id: "workflows", label: "Workflows" },
  { id: "credentials", label: "Credentials" },
  { id: "executions", label: "Executions" },
  { id: "variables", label: "Variables" },
  { id: "data_tables", label: "Data tables" },
];

function StatusCell({ status }: { status: string }) {
  const isError = status === "FAILED" || status === "Error";
  const isSuccess = status === "SUCCESS" || status === "Success";
  if (isError) return <span className="inline-flex items-center gap-1.5 text-red-400"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] leading-none">×</span> Error</span>;
  if (isSuccess) return <span className="inline-flex items-center gap-1.5 text-emerald-400"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] leading-none">✓</span> Success</span>;
  return <span className="text-zinc-400">{status}</span>;
}

export default function PersonalPage() {
  const [tab, setTab] = useState<Tab>("workflows");
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  const [wfList, setWfList] = useState<Workflow[]>([]);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [execs, setExecs] = useState<Execution[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    workflowsApi.list().then(setWfList).catch(() => {});
    credApi.list().then(setCreds).catch(() => {});
    executionsApi.list().then(setExecs).catch(() => {});
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false); }
    if (createOpen) document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [createOpen]);

  const filteredWfs = useMemo(() => wfList.filter((w) => `${w.name} ${w.description}`.toLowerCase().includes(query.toLowerCase())), [wfList, query]);
  const filteredCreds = useMemo(() => creds.filter((c) => `${c.name} ${c.provider}`.toLowerCase().includes(query.toLowerCase())), [creds, query]);

  const createConfig: Record<Tab, { label: string; href: string; dropdown: { label: string; href: string }[] }> = {
    workflows: { label: "Create workflow", href: "/workflows", dropdown: [{ label: "Create credential", href: "/credentials" }, { label: "Create variable", href: "/personal" }, { label: "Create folder", href: "/personal" }, { label: "Create data table", href: "/personal" }] },
    credentials: { label: "Create credential", href: "/credentials", dropdown: [{ label: "Create workflow", href: "/workflows" }, { label: "Create variable", href: "/personal" }, { label: "Create data table", href: "/personal" }] },
    executions: { label: "Create workflow", href: "/workflows", dropdown: [{ label: "Create credential", href: "/credentials" }, { label: "Create variable", href: "/personal" }, { label: "Create data table", href: "/personal" }] },
    variables: { label: "Create variable", href: "/personal", dropdown: [{ label: "Create workflow", href: "/workflows" }, { label: "Create credential", href: "/credentials" }, { label: "Create data table", href: "/personal" }] },
    data_tables: { label: "Create data table", href: "/personal", dropdown: [{ label: "Create workflow", href: "/workflows" }, { label: "Create credential", href: "/credentials" }, { label: "Create variable", href: "/personal" }] },
  };
  const cfg = createConfig[tab];

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Personal</h1>
            <p className="mt-1 text-sm text-zinc-500">Workflows, credentials and data tables owned by you</p>
          </div>
          <div className="relative" ref={createRef}>
            <div className="inline-flex overflow-hidden rounded-md">
              <Link href={cfg.href} className="inline-flex items-center bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600">{cfg.label}</Link>
              <button type="button" onClick={() => setCreateOpen((v) => !v)} className="inline-flex items-center border-l border-violet-600 bg-violet-500 px-2 py-2 text-white hover:bg-violet-600" aria-label="More create options">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            {createOpen ? (
              <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-2xl shadow-black/40">
                {cfg.dropdown.map((item) => (
                  <Link key={item.label} href={item.href} onClick={() => setCreateOpen(false)} className="block px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">{item.label}</Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-6 overflow-x-auto border-b border-white/5 text-sm">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setCreateOpen(false); setQuery(""); }} className={tab === t.id ? "shrink-0 border-b-2 border-violet-500 pb-3 font-medium text-violet-500" : "shrink-0 pb-3 text-zinc-400 hover:text-zinc-200"}>{t.label}</button>
          ))}
        </div>

        {/* Toolbar + content per tab */}
        <div className="mt-5">
          {tab === "workflows" && (
            <>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs"><UserRound className="h-3 w-3" /> Personal</span>
                <button type="button" className="rounded p-1 text-zinc-500 hover:bg-white/5"><MoreVertical className="h-4 w-4" /></button>
                <div className="ml-auto flex items-center gap-2">
                  <label className="relative hidden sm:block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-64 rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500" />
                  </label>
                  <select defaultValue="updated" className="hidden rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-400 outline-none sm:block"><option>Sort by last updated</option></select>
                  <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5"><SlidersHorizontal className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {filteredWfs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 bg-zinc-900 px-6 py-12 text-center"><p className="text-sm text-zinc-500">No workflows found.</p></div>
                ) : (
                  filteredWfs.map((wf) => (
                    <Link key={wf.id} href={`/workflows/${wf.id}/editor`} className="group flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 hover:border-white/20">
                      <div><p className="text-sm font-medium text-zinc-50">{wf.name}</p><p className="mt-1 text-xs text-zinc-500">Last updated {formatRelativeTime(wf.updatedAt)} <span className="mx-1">|</span> Created {formatDate(wf.createdAt)} <span className="ml-2 inline-flex">⋮</span></p></div>
                      <span className="text-zinc-600"><MoreVertical className="h-4 w-4" /></span>
                    </Link>
                  ))
                )}
              </div>
              <p className="mt-4 text-xs text-zinc-600">Total {filteredWfs.length}</p>
            </>
          )}

          {tab === "credentials" && (
            <>
              <div className="flex justify-end gap-2">
                <label className="relative hidden sm:block">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search credentials..." className="w-72 rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500" />
                </label>
                <select defaultValue="updated" className="hidden rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-400 outline-none sm:block"><option>Sort by last updated</option></select>
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5"><SlidersHorizontal className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 space-y-3">
                {filteredCreds.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-12 text-center"><p className="text-sm text-zinc-400">No credentials yet</p></div>
                ) : (
                  filteredCreds.map((cred) => (
                    <div key={cred.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-white/5 text-zinc-300"><Database className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-50">{cred.name}</p><p className="truncate text-xs text-zinc-500">{cred.provider} MCP OAuth2 | Last updated {formatRelativeTime(cred.updatedAt)} | Created {formatDate(cred.createdAt)}</p></div>
                      <span className="hidden items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-300 sm:inline-flex"><UserRound className="h-3 w-3" /> Personal</span>
                      <button type="button" className="p-1 text-zinc-500 hover:text-zinc-300"><MoreVertical className="h-4 w-4" /></button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {tab === "executions" && (
            <>
              <div className="flex items-center gap-2 text-sm text-zinc-400"><span>No active executions</span><span className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px]">i</span><button type="button" className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5"><SlidersHorizontal className="h-4 w-4" /></button></div>
              <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
                <div className="hidden grid-cols-[32px_1.5fr_1fr_1.2fr_1fr_0.8fr_36px_40px] gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-400 md:grid">
                  <span className="flex items-center justify-center"><span className="h-4 w-4 rounded border border-white/10" /></span>
                  <span>Workflow</span><span>Status</span><span>Started</span><span>Run Time</span><span>Exec. ID</span><span />
                  <span />
                </div>
                <div className="divide-y divide-white/5">
                  {execs.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-zinc-500">No executions found</div>
                  ) : (
                    execs.slice(0, 6).map((ex) => {
                      const wfName = (ex as unknown as { workflow?: { name?: string } }).workflow?.name ?? ex.workflowId ?? "My workflow";
                      const statusText = ex.status === "SUCCESS" ? "Success" : ex.status === "FAILED" ? "Error" : ex.status;
                      const rowTint = ex.status === "FAILED" ? "bg-red-950/30" : ex.status === "SUCCESS" ? "bg-zinc-900" : "bg-zinc-900";
                      return (
                        <div key={ex.id} className={`grid grid-cols-[32px_1.5fr_1fr_1.2fr_1fr_0.8fr_36px_40px] items-center gap-2 px-3 py-3 text-sm ${rowTint}`}>
                          <span className="flex items-center justify-center"><span className="h-4 w-4 rounded border border-white/10 bg-transparent" /></span>
                          <span className="truncate text-zinc-200">{wfName}</span>
                          <span className="text-zinc-300"><StatusCell status={statusText} /></span>
                          <span className="text-zinc-300">{ex.startedAt ? new Date(ex.startedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(",", ",") : "—"}</span>
                          <span className="text-zinc-300">{ex.duration != null ? `${ex.duration}ms` : "—"}</span>
                          <span className="font-mono text-zinc-400">{String(ex.id).slice(-1) || "2"}</span>
                          <span className="flex justify-center text-zinc-500"><FlaskConical className="h-4 w-4" /></span>
                          <span className="flex justify-end"><button type="button" className="rounded-md border border-white/10 p-1.5 text-zinc-500 hover:bg-white/5"><MoreVertical className="h-3.5 w-3.5" /></button></span>
                        </div>
                      );
                    })
                  )}
                  <div className="px-3 py-3 text-center text-sm text-zinc-400">No more executions to fetch</div>
                </div>
              </div>
            </>
          )}

          {tab === "variables" && (
            <div className="rounded-lg border border-dashed border-white/15 bg-zinc-900 px-6 py-20 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center text-zinc-400"><span className="text-3xl font-light">(×)</span></div>
              <h3 className="mt-6 text-lg font-medium text-zinc-100">Create your first variable</h3>
              <p className="mt-2 text-sm text-zinc-500">Store values you can reference across all your workflows</p>
              <Link href="/personal" className="mt-6 inline-flex rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600">Create variable</Link>
            </div>
          )}

          {tab === "data_tables" && (
            <div className="rounded-lg border border-dashed border-white/15 bg-zinc-900 px-6 py-20 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400"><Database className="h-8 w-8" /></div>
              <h3 className="mt-6 text-lg font-medium text-zinc-100">Create your first data table</h3>
              <p className="mt-2 text-sm text-zinc-500">Use data tables to persist execution results, share data between workflows,</p>
              <p className="text-sm text-zinc-500">and track metrics for evaluation</p>
              <Link href="/personal" className="mt-6 inline-flex rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600">Create data table</Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
