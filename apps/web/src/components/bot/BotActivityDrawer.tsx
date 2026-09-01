"use client";

import {
  Activity,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  Layers,
  ListTodo,
  Play,
  RotateCw,
  Server,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BotTask, BrowserAction, McpInvocation } from "./bot-types";

type Props = {
  tasks: BotTask[];
  actions: BrowserAction[];
  mcpInvocations: McpInvocation[];
};

export function BotActivityDrawer({ tasks, actions, mcpInvocations }: Props) {
  const [activeTab, setActiveTab] = useState<"tasks" | "browser_actions" | "mcp_tools">("tasks");

  return (
    <div className="flex flex-col border-t border-white/10 bg-zinc-950/95 backdrop-blur-md">
      {/* Navigation Tabs - Grok Bot Minimal */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "tasks"
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            )}
          >
            <ListTodo className="h-3.5 w-3.5" />
            <span>Tarefas & Pipeline</span>
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 py-0.2 text-[10px]",
                activeTab === "tasks" ? "bg-zinc-200 text-zinc-950" : "bg-white/10 text-zinc-300"
              )}
            >
              {tasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("browser_actions")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "browser_actions"
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Browser Action Log</span>
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 py-0.2 text-[10px]",
                activeTab === "browser_actions" ? "bg-zinc-200 text-zinc-950" : "bg-white/10 text-zinc-300"
              )}
            >
              {actions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("mcp_tools")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "mcp_tools"
                ? "bg-white text-zinc-950 shadow-xs"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            )}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Ferramentas MCP</span>
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 py-0.2 text-[10px]",
                activeTab === "mcp_tools" ? "bg-zinc-200 text-zinc-950" : "bg-white/10 text-zinc-300"
              )}
            >
              {mcpInvocations.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Playwright Cluster Ready
          </span>
        </div>
      </div>

      {/* Conteúdo da Aba */}
      <div className="max-h-56 min-h-36 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10">
        {/* ABA: TAREFAS */}
        {activeTab === "tasks" && (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-white/10 bg-zinc-900/50 p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : task.status === "in_progress" ? (
                      <RotateCw className="h-4 w-4 text-cyan-400 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4 text-zinc-500" />
                    )}
                    <span className="font-semibold text-zinc-100">{task.title}</span>
                  </div>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/10">
                    {task.progressPercent}% Concluído
                  </span>
                </div>

                {task.description && (
                  <p className="mt-1 text-[11px] text-zinc-400">{task.description}</p>
                )}

                {/* Subtarefas */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 border-t border-white/5 pt-2">
                    {task.subtasks.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center gap-1.5 text-[11px] text-zinc-300"
                      >
                        {st.completed ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <div className="h-3 w-3 rounded-full border border-zinc-600" />
                        )}
                        <span className={st.completed ? "text-zinc-500 line-through" : "text-zinc-300 font-medium"}>
                          {st.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ABA: BROWSER ACTIONS */}
        {activeTab === "browser_actions" && (
          <div className="divide-y divide-white/5 font-mono text-xs">
            {actions.map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between py-2 hover:bg-white/[0.02] px-2 rounded transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                      act.type === "navigate" && "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
                      act.type === "click" && "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                      act.type === "type" && "bg-purple-500/20 text-purple-300 border border-purple-500/30",
                      act.type === "extract" && "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                      act.type === "screenshot" && "bg-pink-500/20 text-pink-300 border border-pink-500/30",
                      act.type === "hover" && "bg-zinc-700/40 text-zinc-300 border border-zinc-600/30",
                      act.type === "wait" && "bg-zinc-800 text-zinc-400"
                    )}
                  >
                    {act.type}
                  </span>
                  <span className="text-zinc-200 font-sans text-xs truncate">{act.target}</span>
                  {act.value && (
                    <span className="text-zinc-400 text-[11px] truncate">→ {act.value}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-zinc-500 shrink-0">
                  {act.durationMs && <span>{act.durationMs}ms</span>}
                  <span>{act.timestamp}</span>
                  {act.status === "completed" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {act.status === "running" && (
                    <RotateCw className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ABA: FERRAMENTAS MCP */}
        {activeTab === "mcp_tools" && (
          <div className="space-y-2.5">
            {mcpInvocations.map((mcp) => (
              <div
                key={mcp.id}
                className="rounded-lg border border-white/10 bg-zinc-900/50 p-3 text-xs font-mono"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300 border border-white/10">
                      {mcp.serverName}
                    </span>
                    <span className="font-bold text-cyan-300">{mcp.toolName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span>{mcp.executionTimeMs}ms</span>
                    <span className="text-emerald-400 font-semibold">200 OK</span>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-sans block mb-1 font-semibold">
                      Argumentos de Entrada:
                    </span>
                    <pre className="rounded bg-zinc-950 p-2 text-zinc-300 text-[10px] overflow-x-auto border border-white/5">
                      {JSON.stringify(mcp.arguments, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-sans block mb-1 font-semibold">
                      Resposta Estruturada:
                    </span>
                    <pre className="rounded bg-zinc-950 p-2 text-emerald-300 text-[10px] overflow-x-auto border border-white/5">
                      {JSON.stringify(mcp.response, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
