"use client";

import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  CornerDownLeft,
  Flame,
  Loader2,
  Paperclip,
  RotateCcw,
  Sparkles,
  StopCircle,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BotChatMessage, BotMode } from "./bot-types";

type Props = {
  messages: BotChatMessage[];
  onSendMessage: (content: string) => void;
  botMode: BotMode;
  onTakeoverToggle: () => void;
  isStreaming?: boolean;
};

export function BotChatPanel({
  messages,
  onSendMessage,
  botMode,
  onTakeoverToggle,
  isStreaming = false,
}: Props) {
  const [inputVal, setInputVal] = useState("");
  const [showThinking, setShowThinking] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim()) return;
    onSendMessage(inputVal.trim());
    setInputVal("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleThinking = (id: string) => {
    setShowThinking((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-zinc-950">
      {/* Header do Chat */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-zinc-900/60 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-md shadow-violet-500/20">
            <Bot className="h-4 w-4 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Agentflowbot AI
              </h2>
              <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 border border-violet-500/20">
                Claude 3.7 Sonnet + MCP
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {botMode === "ai_autonomous" ? (
                <span className="text-emerald-400">Navegação Autônoma Ativa</span>
              ) : (
                <span className="text-amber-400">Intervenção Manual do Operador</span>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onTakeoverToggle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all shadow-sm",
            botMode === "human_takeover"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
              : "bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10"
          )}
        >
          {botMode === "human_takeover" ? (
            <>
              <RotateCcw className="h-3 w-3 text-amber-400" />
              <span>Devolver à IA</span>
            </>
          ) : (
            <>
              <Flame className="h-3 w-3 text-violet-400" />
              <span>Assumir Controle</span>
            </>
          )}
        </button>
      </div>

      {/* Lista de Mensagens */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          const isSystem = msg.sender === "system";

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.02] px-3 py-1 text-[11px] text-zinc-400">
                  <Activity className="h-3 w-3 text-violet-400" />
                  <span>{msg.content}</span>
                  <span className="text-zinc-600">({msg.timestamp})</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
            >
              <div className="flex items-center gap-1.5 px-1 text-[10px] text-zinc-500">
                {isUser ? (
                  <>
                    <span>Você</span>
                    <User className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    <Bot className="h-3 w-3 text-violet-400" />
                    <span>Agentflowbot</span>
                  </>
                )}
                <span>• {msg.timestamp}</span>
              </div>

              {/* Raciocínio / Thinking toggle se existir */}
              {msg.thinking && (
                <div className="w-full max-w-[85%] rounded-lg border border-violet-500/20 bg-violet-950/20 p-2 text-xs text-violet-300/90 mb-1">
                  <button
                    type="button"
                    onClick={() => toggleThinking(msg.id)}
                    className="flex w-full items-center justify-between text-[11px] font-medium text-violet-400 hover:text-violet-300"
                  >
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Raciocínio & Planejamento da IA
                    </span>
                    {showThinking[msg.id] ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  {showThinking[msg.id] && (
                    <div className="mt-1.5 border-t border-violet-500/20 pt-1.5 text-[11px] leading-relaxed text-zinc-300 font-mono">
                      {msg.thinking}
                    </div>
                  )}
                </div>
              )}

              {/* Balão principal */}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                  isUser
                    ? "rounded-tr-xs bg-violet-600 text-white selection:bg-violet-800"
                    : "rounded-tl-xs border border-white/10 bg-zinc-900 text-zinc-200"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Bloco de Tool Call acionado */}
                {msg.toolCall && (
                  <div className="mt-2.5 rounded-lg border border-white/10 bg-zinc-950/70 p-2 text-[11px]">
                    <div className="flex items-center justify-between text-zinc-400 pb-1 mb-1 border-b border-white/5">
                      <span className="flex items-center gap-1 font-mono font-medium text-amber-300">
                        <Wrench className="h-3 w-3" />
                        {msg.toolCall.name}
                      </span>
                      <span className="rounded bg-white/5 px-1 py-0.2 text-[9px] text-zinc-400">
                        {msg.toolCall.server || "mcp"}
                      </span>
                    </div>
                    <pre className="overflow-x-auto text-[10px] text-zinc-400 font-mono">
                      {JSON.stringify(msg.toolCall.args, null, 2)}
                    </pre>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      <span>Executado com sucesso no navegador</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 pl-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
            <span>Agentflowbot está interagindo com a página...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Caixa de Entrada */}
      <div className="border-t border-white/10 bg-zinc-900/80 p-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="relative rounded-xl border border-white/10 bg-zinc-950 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/50 transition-all">
            <textarea
              ref={inputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                botMode === "ai_autonomous"
                  ? "Instrua o bot para navegar, preencher formulários, auditar ou extrair dados..."
                  : "Modo intervenção humana: envie ordens prioritárias ou restaure o controle da IA..."
              }
              rows={2}
              className="w-full resize-none bg-transparent px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
            <div className="flex items-center justify-between border-t border-white/5 px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  title="Anexar arquivo ou referência de imagem"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  title="Inspecionar comando de terminal"
                >
                  <Terminal className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[10px] text-zinc-500">
                  <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">Enter</kbd> para enviar
                </span>
                <button
                  type="submit"
                  disabled={!inputVal.trim()}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-3 text-xs font-medium transition-all shadow-sm",
                    inputVal.trim()
                      ? "bg-violet-600 text-white hover:bg-violet-500 shadow-violet-600/30"
                      : "bg-white/5 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  <span>Enviar</span>
                  <CornerDownLeft className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
