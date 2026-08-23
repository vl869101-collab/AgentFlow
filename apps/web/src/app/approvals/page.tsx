"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { approvals, type Approval } from "@/lib/api";

function badgeStatus(status: string): BadgeStatus {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "PENDING") return "warning";
  return "neutral";
}

function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function contextLabel(context: unknown) {
  if (context == null) return "No additional context.";
  if (typeof context === "string") return context;
  return JSON.stringify(context);
}

export default function ApprovalsPage() {
  const [data, setData] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    approvals.list().then(setData).catch(() => setError("Unable to load approvals.")).finally(() => setLoading(false));
  }, []);

  async function decide(id: string, decision: "approve" | "reject") {
    setActing(`${id}:${decision}`);
    setError("");
    try {
      if (decision === "approve") await approvals.approve(id);
      else await approvals.reject(id);
      setData((items) => items.filter((item) => item.id !== id));
    } catch {
      setError("Unable to update approval.");
    } finally {
      setActing(null);
    }
  }

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Approvals</h1>
            <p className="mt-1 text-sm text-zinc-500">Review pending workflow approval requests</p>
          </div>
          <Badge status="warning">{data.length} pending</Badge>
        </div>

        {error ? <p className="mt-6 text-sm text-red-400" role="alert">{error}</p> : null}
        <div className="mt-8 space-y-4">
          {loading ? <Card className="py-12 text-center text-sm text-zinc-500">Loading approvals...</Card> : null}
          {!loading && data.length === 0 ? <Card className="py-12 text-center text-sm text-zinc-500">No pending approvals.</Card> : null}
          {!loading ? data.map((approval) => {
            const workflow = approval.execution?.workflow;
            const action = acting?.startsWith(`${approval.id}:`) ? acting.split(":")[1] : null;
            return (
              <div key={approval.id} className="bg-zinc-900 border border-white/10 rounded-lg px-4 py-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded text-violet-500 mt-0.5 flex-shrink-0">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-zinc-50">{approval.message || "Approval request"}</h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        {workflow?.name || "Workflow execution"} · {new Date(approval.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-400">{contextLabel(approval.context)}</pre>
                <div className="mt-3 flex gap-2 sm:justify-end">
                  <Button size="sm" onClick={() => decide(approval.id, "reject")} loading={action === "reject"} disabled={Boolean(acting)} className="bg-white/5 text-zinc-400 hover:bg-white/10 rounded-md px-3 py-1.5 text-xs font-medium">
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => decide(approval.id, "approve")} loading={action === "approve"} disabled={Boolean(acting)} className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 rounded-md px-3 py-1.5 text-xs font-medium">
                    Approve
                  </Button>
                </div>
              </div>
            );
          }) : null}
        </div>
      </div>
    </AppLayout>
  );
}
