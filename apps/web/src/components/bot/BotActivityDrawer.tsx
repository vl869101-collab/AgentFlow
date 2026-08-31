"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
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
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
              activeTab === "tasks"
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            )}
          >
            <ListTodo className="h-3.5 w-3.5" />
            <span>Tarefas Ativas</span>
            <span className="ml-1 rounded-full bg-violet-500/20 px-1.5 py-0.2 text-[10px] text-violet-300">
              {tasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("browser_actions")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
              activeTab === "browser_actions"
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Histórico de Navegação</span>
            <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] text-zinc-300">
              {actions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("mcp_tools")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all",
              activeTab === "mcp_tools"
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            )}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Ferramentas MCP</span>
            <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] text-zinc-300">
              {mcpInvocations.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Puppeteer Sandbox Ready
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
                className="rounded-lg border border-white/10 bg-zinc-900/60 p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : task.status === "in_progress" ? (
                      <RotateCw className="h-4 w-4 text-violet-400 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4 text-zinc-500" />
                    )}
                    <span className="font-medium text-zinc-200">{task.title}</span>
                  </div>
                  <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] font-mono text-violet-300 border border-violet-500/20">
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
                        <span className={st.completed ? "text-zinc-400 line-through" : ""}>
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

        {/* ABA: HISTÓRICO DE AÇÕES DO BROWSER */}
        {activeTab === "browser_actions" && (
          <div className="divide-y divide-white/5 font-mono text-xs">
            {actions.map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between py-2 hover:bg-white/[0.02] px-2 rounded"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      act.type === "navigate" && "bg-blue-500/20 text-blue-300 border border-blue-500/30",
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
                  <span className="text-zinc-300 font-sans text-xs">{act.target}</span>
                  {act.value && (
                    <span className="text-zinc-500 text-[11px]">→ {act.value}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  {act.durationMs && <span>{act.durationMs}ms</span>}
                  <span>{act.timestamp}</span>
                  {act.status === "completed" && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  )}
                  {act.status === "running" && (
                    <RotateCw className="h-3 w-3 text-violet-400 animate-spin" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ABA: FERRAMENTAS MCP */}
        {activeTab === "mcp_tools" && (
          <div className="space-y-2">
            {mcpInvocations.map((mcp) => (
              <div
                key={mcp.id}
                className="rounded-lg border border-white/10 bg-zinc-900/40 p-2.5 text-xs font-mono"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300 border border-violet-500/20">
                      {mcp.serverName}
                    </span>
                    <span className="font-semibold text-amber-300">{mcp.toolName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span>{mcp.executionTimeMs}ms</span>
                    <span className="text-emerald-400 font-medium">HTTP 200 OK</span>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-sans block mb-0.5">Parâmetros Enviados:</span>
                    <pre className="rounded bg-zinc-950 p-2 text-zinc-300 text-[10px] overflow-x-auto">
                      {JSON.stringify(mcp.arguments, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-sans block mb-0.5">Retorno Estruturado:</span>
                    <pre className="rounded bg-zinc-950 p-2 text-emerald-300 text-[10px] overflow-x-auto">
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
