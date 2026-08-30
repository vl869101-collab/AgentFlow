"use client";

import Link from "next/link";
import { Activity, ArrowRight, Play, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Sparkline } from "./Sparkline";
import { cn } from "@/lib/utils";

export interface DashboardStats {
  totalExecutions: number;
  failedExecutions: number;
  failureRate: number;
  avgDurationMs: number;
  activeWorkflows: number;
  totalWorkflows: number;
  executionTrend: number[];
  failureTrend: number[];
  durationTrend: number[];
}

interface BentoCardConfig {
  id: string;
  label: string;
  value: string;
  badge: { text: string; status: BadgeStatus };
  trendPercent: number | null;
  trendInverted?: boolean;
  spark: number[];
  sparkClassName: string;
  href: string;
  icon: typeof Activity;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTrend(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${Math.round(percent)}%`;
}

function TrendPill({ percent, isInverted }: { percent: number; isInverted: boolean }) {
  const isGood = isInverted ? percent <= 0 : percent >= 0;
  const Icon = percent >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        isGood ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatTrend(percent)}
    </span>
  );
}

export function BentoGrid({ stats }: { stats: DashboardStats }) {
  const cards: BentoCardConfig[] = [
    {
      id: "executions",
      label: "Total executions",
      value: stats.totalExecutions.toLocaleString("en-US"),
      badge: { text: "All time", status: "info" },
      trendPercent: null,
      spark: stats.executionTrend,
      sparkClassName: "text-violet-400",
      href: "/executions",
      icon: Activity,
    },
    {
      id: "failures",
      label: "Failed runs",
      value: stats.failedExecutions.toLocaleString("en-US"),
      badge: { text: "Last 30 days", status: "neutral" },
      trendPercent: null,
      spark: stats.failureTrend,
      sparkClassName: "text-red-400",
      href: "/executions",
      icon: Zap,
    },
    {
      id: "failure-rate",
      label: "Failure rate",
      value: formatPercent(stats.failureRate),
      badge:
        stats.failureRate > 0.1
          ? { text: "Needs attention", status: "error" }
          : { text: "Healthy", status: "success" },
      trendPercent: null,
      trendInverted: true,
      spark: stats.failureTrend,
      sparkClassName: "text-amber-400",
      href: "/executions",
      icon: TrendingDown,
    },
    {
      id: "avg-duration",
      label: "Avg run time",
      value: `${Math.round(stats.avgDurationMs / 100) / 10}s`,
      badge: { text: "All workflows", status: "neutral" },
      trendPercent: null,
      spark: stats.durationTrend,
      sparkClassName: "text-sky-400",
      href: "/executions",
      icon: Play,
    },
    {
      id: "active-workflows",
      label: "Active workflows",
      value: `${stats.activeWorkflows}/${stats.totalWorkflows}`,
      badge: { text: "Published", status: "success" },
      trendPercent: null,
      spark: [],
      sparkClassName: "text-emerald-400",
      href: "/workflows",
      icon: ArrowRight,
    },
  ];

  return (
    <section aria-labelledby="overview-heading" className="af-dash-reveal">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="overview-heading" className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
          Overview
        </h2>
        <Link
          href="/executions"
          className="group inline-flex items-center gap-1 rounded-md text-xs font-medium text-zinc-400 transition-colors hover:text-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
        >
          View all executions
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <li key={card.id}>
              <Link
                href={card.href}
                className="af-dash-card block h-full cursor-pointer p-5 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs font-medium">{card.label}</span>
                  </div>
                  <Badge status={card.badge.status}>{card.badge.text}</Badge>
                </div>

                <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">
                  {card.value}
                </p>

                <div className="mt-3 flex items-end justify-between gap-2">
                  {card.trendPercent !== null ? (
                    <TrendPill percent={card.trendPercent} isInverted={card.trendInverted ?? false} />
                  ) : (
                    <span />
                  )}
                  <div className="w-24 shrink-0">
                    <Sparkline
                      data={card.spark}
                      label={`${card.label} trend sparkline`}
                      strokeClassName={card.sparkClassName}
                    />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
