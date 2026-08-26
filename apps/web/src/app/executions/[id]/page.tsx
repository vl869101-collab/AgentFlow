"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Play,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { executions, type Execution } from "@/lib/api";

function statusFor(status: string): BadgeStatus {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED" || status === "Error") return "error";
  if (status === "RUNNING") return "warning";
  return "neutral";
}

function labelFor(status: string) {
  if (status === "WAITING_APPROVAL") return "Waiting approval";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function TraceStatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />;
  }
  if (status === "FAILED" || status === "Error") {
    return <XCircle className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" />;
  }
  if (status === "RUNNING") {
    return <Loader2 className="h-4 w-4 text-amber-400 animate-spin shrink-0" aria-hidden="true" />;
  }
  return <Clock3 className="h-4 w-4 text-zinc-400 shrink-0" aria-hidden="true" />;
}

export default function ExecutionDetailPage() {
  const params = useParams<{ id: string }>();
  const [exec, setExec] = useState<Execution | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!params.id) return;
    executions
      .get(params.id)
      .then(setExec)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2 text-violet-400" /> Loading execution traces...
        </div>
      </AppLayout>
    );
  }

  if (!exec) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-sm text-zinc-400">Execution not found.</div>
      </AppLayout>
    );
  }

  const workflowDisplayName = exec.workflow?.name || exec.workflowId;
  const traces = exec.traces || [];

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <nav aria-label="Breadcrumb">
          <Link
            href="/executions"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to executions
          </Link>
        </nav>

        <header className="mt-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50">
                {workflowDisplayName}
              </h1>
              <Badge status={statusFor(exec.status)}>{labelFor(exec.status)}</Badge>
              {exec.workflowId && (
                <Link
                  href={`/workflows/${exec.workflowId}/editor`}
                  className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 underline font-medium"
                  aria-label={`Open editor for workflow ${workflowDisplayName}`}
                >
                  Open Editor <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </div>
            <p className="mt-2 font-mono text-xs text-zinc-500">Execution ID: {exec.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(exec, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `execution-${exec.id}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              aria-label="Export execution data as JSON"
            >
              <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Export JSON
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-500 text-white rounded-md focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={async () => {
                try {
                  const newExec = await executions.trigger(exec.workflowId, exec.input);
                  window.location.href = `/executions/${newExec.id}`;
                } catch (e) {
                  console.error(e);
                }
              }}
              aria-label="Re-run workflow execution"
            >
              <Play className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Re-run
            </Button>
          </div>
        </header>

        {/* Metric Cards */}
        <section aria-label="Execution summary metrics" className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="bg-zinc-900/90 border-white/10 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Duration</p>
            <p className="mt-2 text-xl font-bold text-zinc-100">{exec.duration != null ? `${exec.duration}ms` : "—"}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> End to end execution time
            </p>
          </Card>
          <Card className="bg-zinc-900/90 border-white/10 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Nodes completed</p>
            <p className="mt-2 text-xl font-bold text-zinc-100">{traces.length > 0 ? traces.length : (exec.nodes ?? 0)}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {traces.filter((t) => t.status === "SUCCESS").length} succeeded
            </p>
          </Card>
          <Card className="bg-zinc-900/90 border-white/10 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Trigger Type</p>
            <p className="mt-2 text-xl font-bold text-zinc-100 capitalize">{exec.trigger ?? "Manual"}</p>
            <p className="mt-1 text-xs text-zinc-400">Started via {exec.trigger ?? "api/manual"}</p>
          </Card>
        </section>

        {/* Step-by-Step Node Traces Timeline */}
        {traces.length > 0 && (
          <section aria-label="Node execution traces" className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-violet-400" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-100">Step-by-Step Execution Traces</h2>
            </div>
            <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-zinc-900/60 overflow-hidden">
              {traces.map((trace, idx) => {
                const isExpanded = Boolean(expandedNodes[trace.id || trace.nodeId]);
                return (
                  <div key={trace.id || idx} className="p-4 hover:bg-white/[0.02] transition-colors">
                    <div
                      className="flex items-center justify-between cursor-pointer select-none"
                      onClick={() => toggleNodeExpand(trace.id || trace.nodeId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleNodeExpand(trace.id || trace.nodeId);
                        }
                      }}
                      aria-expanded={isExpanded}
                      aria-label={`Toggle trace for node ${trace.nodeId}`}
                    >
                      <div className="flex items-center gap-3">
                        <TraceStatusIcon status={trace.status} />
                        <div>
                          <span className="text-sm font-semibold text-zinc-200">
                            {idx + 1}. {trace.nodeId}
                          </span>
                          <span className="ml-2 font-mono text-[11px] text-zinc-400 capitalize">
                            ({trace.status.toLowerCase()})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400">
                          {trace.duration != null ? `${trace.duration}ms` : "—"}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-3 pl-7 border-l-2 border-white/10 ml-2 animate-in fade-in duration-150">
                        {trace.error && (
                          <div className="p-3 rounded-md bg-red-950/30 border border-red-500/30 text-xs text-red-300 font-mono">
                            <span className="font-semibold block mb-1">Error:</span>
                            {trace.error}
                          </div>
                        )}
                        {trace.input !== undefined && (
                          <div>
                            <span className="text-[11px] font-semibold text-zinc-400 block mb-1">Input Data:</span>
                            <pre className="max-h-40 overflow-auto p-3 rounded bg-[#121214] border border-white/5 font-mono text-[11px] text-zinc-300">
                              {JSON.stringify(trace.input, null, 2)}
                            </pre>
                          </div>
                        )}
                        {trace.output !== undefined && (
                          <div>
                            <span className="text-[11px] font-semibold text-zinc-400 block mb-1">Output Data:</span>
                            <pre className="max-h-40 overflow-auto p-3 rounded bg-[#121214] border border-white/5 font-mono text-[11px] text-zinc-300">
                              {JSON.stringify(trace.output, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Global Input / Output / Error Payloads */}
        <section aria-label="Execution payloads" className="mt-8 space-y-4">
          {exec.input != null && <JsonPanel title="Global Workflow Input" value={exec.input} />}
          {exec.output != null && <JsonPanel title="Global Workflow Output" value={exec.output} />}
          {exec.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4">
              <h2 className="text-sm font-semibold text-red-300">Execution Error</h2>
              <pre className="mt-2 overflow-auto font-mono text-xs text-red-400 whitespace-pre-wrap">{exec.error}</pre>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden bg-zinc-900/80 border-white/10 p-0">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 bg-white/[0.02]">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{title}</h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          onClick={handleCopy}
          aria-label={`Copy ${title} to clipboard`}
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="max-h-56 overflow-auto p-4 font-mono text-xs leading-5 text-zinc-300 bg-[#101012]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Card>
  );
}
