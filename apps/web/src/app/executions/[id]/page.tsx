"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, Copy, Download, Play } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { executions, type Execution } from "@/lib/api";

function statusFor(status: string): BadgeStatus { return status === "SUCCESS" ? "success" : status === "FAILED" ? "error" : status === "RUNNING" ? "warning" : "neutral"; }
function labelFor(status: string) { return status === "WAITING_APPROVAL" ? "Waiting approval" : status.charAt(0) + status.slice(1).toLowerCase(); }

export default function ExecutionDetailPage() {
  const params = useParams<{ id: string }>();
  const [exec, setExec] = useState<Execution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    executions.get(params.id).then(setExec).catch(() => {}).finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <AppLayout><div className="p-8 text-center text-sm text-zinc-600">Loading...</div></AppLayout>;
  if (!exec) return <AppLayout><div className="p-8 text-center text-sm text-zinc-600">Execution not found.</div></AppLayout>;

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <Link href="/executions" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" /> Back to executions
        </Link>

        <div className="mt-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-50">{exec.workflowId}</h1>
              <Badge status={statusFor(exec.status)}>{labelFor(exec.status)}</Badge>
            </div>
            <p className="mt-2 font-mono text-xs text-zinc-600">{exec.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm"><Download className="h-3.5 w-3.5" /> Export JSON</Button>
            <Button size="sm"><Play className="h-3.5 w-3.5" /> Re-run</Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Duration</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100">{exec.duration != null ? `${exec.duration}ms` : "—"}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-600"><Clock3 className="h-3.5 w-3.5" /> End to end</p>
          </Card>
          <Card>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Nodes completed</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100">{exec.nodes ?? 0}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> Completed</p>
          </Card>
          <Card>
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Trigger</p>
            <p className="mt-2 text-xl font-semibold text-zinc-100">{exec.trigger ?? "Manual"}</p>
            <p className="mt-1 text-xs text-zinc-600">Manual replay available</p>
          </Card>
        </div>

        {exec.input != null && (
          <div className="mt-8">
            <JsonPanel title="Input" value={exec.input} />
          </div>
        )}
        {exec.output != null && (
          <div className="mt-4">
            <JsonPanel title="Output" value={exec.output} />
          </div>
        )}
        {exec.error && (
          <div className="mt-4">
            <JsonPanel title="Error" value={{ message: exec.error }} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
        <button
          type="button"
          className="rounded-lg p-1.5 text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
          onClick={() => navigator.clipboard?.writeText(JSON.stringify(value, null, 2))}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre className="max-h-52 overflow-auto p-5 font-mono text-xs leading-6 text-zinc-500">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Card>
  );
}
