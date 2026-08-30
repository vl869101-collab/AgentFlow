"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Bot, Boxes, Database, Globe, Layers, Plug, Search, Settings2, Workflow, Zap } from "lucide-react";
import { NODE_TYPES } from "@agentflow/shared";
import { cn } from "@/lib/utils";

const ALL_GROUP = "All" as const;
type GroupFilter = typeof ALL_GROUP | "Triggers" | "Integrations" | "Logic" | "AI" | "Delivery";

interface GroupStyle {
  icon: typeof Workflow;
  dot: string;
  chip: string;
}

const GROUP_STYLES: Record<GroupFilter, GroupStyle> = {
  All: { icon: Boxes, dot: "bg-violet-400", chip: "bg-violet-500/10 text-violet-300 border-violet-500/30" },
  Triggers: { icon: Zap, dot: "bg-amber-400", chip: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  Integrations: { icon: Plug, dot: "bg-sky-400", chip: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  Logic: { icon: Settings2, dot: "bg-emerald-400", chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  AI: { icon: Bot, dot: "bg-fuchsia-400", chip: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30" },
  Delivery: { icon: Globe, dot: "bg-rose-400", chip: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
};

/** Deterministic grouping shared by all cards — mirrors the workflow editor palette. */
function classifyNode(type: string, label: string): Exclude<GroupFilter, typeof ALL_GROUP> {
  if (/(trigger|cron|webhook.*trigger|imap)/i.test(type) || /trigger|cron/i.test(label)) {
    // respond_webhook and errorTrigger are terminal actions, not triggers
    if (/^respond_webhook$|^error_trigger$|^errorTrigger$/.test(type)) return "Logic";
    return "Triggers";
  }
  if (/(ai|llm|vector|agent|embed)/i.test(type)) return "AI";
  if (/(postgres|redis|mongo|sheets|drive|calendar|docs|gmail|slack|telegram|discord|teams|whatsapp|email|imap)/i.test(type)) {
    return /discord|telegram|slack|teams|whatsapp|gmail|email/i.test(type) ? "Delivery" : "Integrations";
  }
  if (/(condition|filter|merge|delay|transform|set_fields|code|approval)/i.test(type)) return "Logic";
  if (/(http|webhook|execute_workflow)/i.test(type)) return "Integrations";
  return "Integrations";
}

export function McpNodesHub() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupFilter>(ALL_GROUP);

  const nodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return NODE_TYPES.map((node) => ({ ...node, group: classifyNode(node.type, node.label) })).filter((node) => {
      if (group !== ALL_GROUP && node.group !== group) return false;
      if (!normalizedQuery) return true;
      return node.label.toLowerCase().includes(normalizedQuery) || node.type.toLowerCase().includes(normalizedQuery);
    });
  }, [query, group]);

  const counts = useMemo(() => {
    const byGroup = new Map<GroupFilter, number>();
    for (const node of NODE_TYPES) {
      const classified = group === ALL_GROUP ? classifyNode(node.type, node.label) : group;
      void classified;
    }
    // count independent of current filter for the chips
    const base = new Map<GroupFilter, number>([[ALL_GROUP, NODE_TYPES.length]]);
    for (const node of NODE_TYPES) {
      const key = classifyNode(node.type, node.label);
      base.set(key, (base.get(key) ?? 0) + 1);
    }
    return base;
  }, [group]);

  return (
    <section aria-labelledby="nodes-heading" className="af-dash-card af-dash-reveal p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-400" aria-hidden="true" />
          <h2 id="nodes-heading" className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            MCP Tools &amp; AI Nodes
          </h2>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400 tabular-nums">
            {NODE_TYPES.length} nodes
          </span>
        </div>
        <Link
          href="/mcp"
          className="group inline-flex items-center gap-1 rounded-md text-xs font-medium text-zinc-400 transition-colors hover:text-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
        >
          MCP clients
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <label htmlFor="nodes-search" className="sr-only">
            Search nodes by name or type
          </label>
          <input
            id="nodes-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search nodes…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pr-3 pl-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/30 focus:outline-none"
          />
        </div>
        <div role="group" aria-label="Filter nodes by category" className="flex flex-wrap gap-1.5">
          {(Object.keys(GROUP_STYLES) as GroupFilter[]).map((key) => {
            const style = GROUP_STYLES[key];
            const isActive = group === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setGroup(key)}
                aria-pressed={isActive}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none",
                  isActive ? style.chip : "border-white/10 bg-transparent text-zinc-500 hover:border-white/20 hover:text-zinc-300",
                )}
              >
                {key}
                <span className="ml-1.5 text-[10px] opacity-70 tabular-nums">{counts.get(key) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {nodes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">
          No nodes match “{query}”.
        </p>
      ) : (
        <ul className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4" aria-label="Node catalog">
          {nodes.map((node) => {
            const style = GROUP_STYLES[node.group];
            const GroupIcon = style.icon;
            return (
              <li key={node.type}>
                <div
                  className="group flex h-full cursor-default items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.03] p-2.5 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
                  title={`${node.label} · ${node.type}`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base leading-none"
                    style={{ backgroundColor: `${node.color}1f`, color: node.color }}
                    aria-hidden="true"
                  >
                    {node.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-200">{node.label}</p>
                    <p className="truncate font-mono text-[10px] text-zinc-500">{node.type}</p>
                  </div>
                  <GroupIcon className={cn("h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70", style.dot)} aria-hidden="true" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-[11px] text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-3 w-3" aria-hidden="true" />
          Shared catalog with the workflow editor palette
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3 w-3" aria-hidden="true" />
          {counts.get("Triggers") ?? 0} triggers
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Bot className="h-3 w-3" aria-hidden="true" />
          {counts.get("AI") ?? 0} AI nodes
        </span>
      </div>
    </section>
  );
}
