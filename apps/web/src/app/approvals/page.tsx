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
            <p className="text-xs font-medium uppercase tracking-wider text-red-400">Human decisions</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-50">Approvals</h1>
            <p className="mt-2 text-sm text-zinc-500">Review pending workflow decisions for your workspace.</p>
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
              <Card key={approval.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-medium text-zinc-100">{approval.message || "Approval request"}</h2>
                      <Badge status={badgeStatus(approval.status)}>{statusLabel(approval.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {workflow?.name || "Workflow execution"} · {new Date(approval.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-zinc-600">{approval.executionId}</span>
                </div>
                <pre className="mt-5 overflow-x-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-400">{contextLabel(approval.context)}</pre>
                <div className="mt-5 flex gap-2 sm:justify-end">
                  <Button variant="danger" size="sm" onClick={() => decide(approval.id, "reject")} loading={action === "reject"} disabled={Boolean(acting)}>
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => decide(approval.id, "approve")} loading={action === "approve"} disabled={Boolean(acting)}>
                    Approve
                  </Button>
                </div>
              </Card>
            );
          }) : null}
        </div>
      </div>
    </AppLayout>
  );
}
