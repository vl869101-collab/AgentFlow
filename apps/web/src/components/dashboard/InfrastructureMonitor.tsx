"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Loader2, MemoryStick, RefreshCw, Server, XCircle } from "lucide-react";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { rawRequest } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  checks: Record<string, string>;
  latencyMs?: Record<string, number>;
  metrics?: {
    memory?: string;
    deadlockCheck?: string;
    connectionSaturation?: string;
    workers?: {
      workflowQueue?: { active?: number; waiting?: number; failed?: number; paused?: number };
      dlqQueue?: { waiting?: number; failed?: number };
    };
  };
}

const POLL_INTERVAL_MS = 15_000;

type ServiceState = "up" | "degraded" | "down" | "unknown";

interface ServiceRow {
  id: string;
  name: string;
  icon: typeof Server;
  state: ServiceState;
  detail: string;
  latencyMs: number | null;
}

function toServiceState(checkValue: string | undefined, hasResponse: boolean): ServiceState {
  if (!hasResponse) return "unknown";
  if (checkValue === undefined) return "unknown";
  const normalized = checkValue.toLowerCase();
  if (normalized === "ok" || normalized === "up" || normalized === "connected") return "up";
  if (normalized.includes("degrad") || normalized.includes("warn")) return "degraded";
  if (normalized.includes("fail") || normalized.includes("error") || normalized === "down") return "down";
  return "up";
}

const STATE_META: Record<ServiceState, { label: string; badge: BadgeStatus; dot: string; icon: typeof CheckCircle2 }> = {
  up: { label: "Operational", badge: "success", dot: "bg-emerald-400", icon: CheckCircle2 },
  degraded: { label: "Degraded", badge: "warning", dot: "bg-amber-400", icon: AlertTriangle },
  down: { label: "Down", badge: "error", dot: "bg-red-400", icon: XCircle },
  unknown: { label: "Unknown", badge: "neutral", dot: "bg-zinc-600", icon: Loader2 },
};

function buildRows(health: HealthCheckResponse | null, isErrored: boolean): ServiceRow[] {
  const hasResponse = health !== null && !isErrored;
  const checks = health?.checks ?? {};
  const latency = health?.latencyMs ?? {};
  const pick = (key: string, fallback: string): string => checks[key] ?? fallback;

  const rows: ServiceRow[] = [
    { id: "api", name: "API server", icon: Server, state: toServiceState(checks["api"], hasResponse), detail: pick("api", "no response"), latencyMs: latency["api"] ?? null },
    { id: "postgres", name: "PostgreSQL", icon: Database, state: toServiceState(checks["database"], hasResponse), detail: pick("database", "unavailable"), latencyMs: latency["database"] ?? null },
    { id: "redis", name: "Redis", icon: RefreshCw, state: toServiceState(checks["redis"], hasResponse), detail: pick("redis", "unavailable"), latencyMs: latency["redis"] ?? null },
    { id: "workers", name: "Queue workers", icon: MemoryStick, state: toServiceState(checks["workers"], hasResponse), detail: pick("workers", "unavailable"), latencyMs: latency["workers"] ?? null },
  ];
  return rows;
}

export function InfrastructureMonitor() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isErrored, setIsErrored] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await rawRequest<HealthCheckResponse>("/health", { skipAuth: true, skipRefresh: true });
      if (!mountedRef.current) return;
      setHealth(result);
      setIsErrored(false);
      setLastCheckedAt(Date.now());
    } catch {
      if (!mountedRef.current) return;
      setIsErrored(true);
      setLastCheckedAt(Date.now());
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchHealth]);

  const rows = buildRows(health, isErrored);
  const overall = isErrored ? "down" : health === null ? "unknown" : health.status === "ok" ? "up" : health.status === "degraded" ? "degraded" : "down";
  const overallMeta = STATE_META[overall];

  return (
    <section
      aria-labelledby="infra-heading"
      className="af-dash-card af-dash-reveal p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="infra-heading" className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            Infrastructure
          </h2>
          <span className={cn("af-dash-dot--live h-2 w-2 rounded-full", overallMeta.dot)} aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          <Badge status={overallMeta.badge}>{overallMeta.label}</Badge>
          <button
            type="button"
            onClick={() => void fetchHealth()}
            className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
            aria-label="Refresh health check now"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul className="space-y-1" aria-live="polite">
        {rows.map((row) => {
          const Icon = row.icon;
          const meta = STATE_META[row.state];
          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5", row.state === "up" ? "text-emerald-400" : row.state === "degraded" ? "text-amber-400" : row.state === "down" ? "text-red-400" : "text-zinc-500")}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">{row.name}</p>
                  <p className="truncate text-xs text-zinc-500 capitalize">{row.detail}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {row.latencyMs !== null ? (
                  <span className="text-xs text-zinc-500 tabular-nums">{Math.round(row.latencyMs)}ms</span>
                ) : null}
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden="true" />
              </div>
            </li>
          );
        })}
      </ul>

      {health?.metrics?.workers ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
          <div>
            <dt className="text-[10px] tracking-wider text-zinc-500 uppercase">Active</dt>
            <dd className="text-sm font-semibold text-zinc-200 tabular-nums">
              {health.metrics.workers.workflowQueue?.active ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wider text-zinc-500 uppercase">Waiting</dt>
            <dd className="text-sm font-semibold text-zinc-200 tabular-nums">
              {health.metrics.workers.workflowQueue?.waiting ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] tracking-wider text-zinc-500 uppercase">Failed</dt>
            <dd className="text-sm font-semibold text-red-400 tabular-nums">
              {(health.metrics.workers.workflowQueue?.failed ?? 0) + (health.metrics.workers.dlqQueue?.failed ?? 0)}
            </dd>
          </div>
        </dl>
      ) : null}

      <p className="mt-3 text-[11px] text-zinc-600" aria-live="off">
        {lastCheckedAt !== null
          ? `Checked ${formatRelativeTime(new Date(lastCheckedAt))} · auto-refresh every 15s`
          : "Connecting…"}
      </p>
    </section>
  );
}
