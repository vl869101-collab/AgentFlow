"use client";

import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  CornerDownLeft,
  Flame,
  Globe,
  Loader2,
  MousePointer,
  Paperclip,
  RotateCcw,
  Search,
  Sparkles,
  Table,
  Terminal,
  Type,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BotChatMessage, BotMode, CommandPreset, ThoughtStep } from "./bot-types";
import { quickCommandPresets } from "./mock-bot-data";

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

  const handleSelectPreset = (preset: CommandPreset) => {
    setInputVal(preset.prompt);
    inputRef.current?.focus();
  };

  const toggleThinking = (id: string) => {
    setShowThinking((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderActionIcon = (type?: ThoughtStep["type"]) => {
    switch (type) {
      case "navigate":
        return <Globe className="h-3 w-3 text-cyan-400" />;
      case "click":
        return <MousePointer className="h-3 w-3 text-emerald-400" />;
      case "type":
        return <Type className="h-3 w-3 text-purple-400" />;
      case "extract":
        return <Table className="h-3 w-3 text-amber-400" />;
      case "verify":
        return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
      case "browser":
        return <Compass className="h-3 w-3 text-blue-400" />;
      default:
        return <BrainCircuit className="h-3 w-3 text-violet-400" />;
    }
  };

  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-zinc-950/95 backdrop-blur-md">
      {/* Header do Chat - Grok Bot Style */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-zinc-900/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 border border-white/15 shadow-inner">
            <Bot className="h-4 w-4 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
                <span>Agentflowbot</span>
                <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-mono text-zinc-300 font-semibold border border-white/10">
                  Grok v2.5
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
              {botMode === "ai_autonomous" ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Autonomous Navigation
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Human Intervention Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Take Control Switch - Destaque Grok */}
        <button
          type="button"
          onClick={onTakeoverToggle}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 shadow-sm border",
            botMode === "human_takeover"
              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 hover:border-amber-500/60 shadow-amber-500/10"
              : "bg-zinc-900 text-zinc-200 border-white/15 hover:bg-white/10 hover:border-white/25"
          )}
        >
          {botMode === "human_takeover" ? (
            <>
              <RotateCcw className="h-3.5 w-3.5 text-amber-400 animate-spin-reverse" />
              <span>Devolver à IA</span>
            </>
          ) : (
            <>
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>Take Control</span>
            </>
          )}
        </button>
      </div>

      {/* Lista de Mensagens do Chat */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          const isSystem = msg.sender === "system";

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/60 px-3 py-1 text-[11px] text-zinc-400 shadow-sm">
                  <Activity className="h-3 w-3 text-cyan-400" />
                  <span>{msg.content}</span>
                  <span className="text-zinc-600 font-mono">({msg.timestamp})</span>
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
                    <User className="h-3 w-3 text-zinc-400" />
                  </>
                ) : (
                  <>
                    <Bot className="h-3 w-3 text-cyan-400" />
                    <span className="font-medium text-zinc-400">Agentflowbot</span>
                  </>
                )}
                <span>• {msg.timestamp}</span>
              </div>

              {/* Thought & Action Stream (Reasoning Grok Style) */}
              {(msg.thinking || (msg.thoughts && msg.thoughts.length > 0)) && (
                <div className="w-full max-w-[92%] rounded-xl border border-white/10 bg-zinc-900/70 p-2.5 text-xs text-zinc-300 mb-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleThinking(msg.id)}
                    className="flex w-full items-center justify-between text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <BrainCircuit className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
                      <span className="font-mono text-zinc-200 font-semibold">
                        Reasoning & Plan
                      </span>
                      {msg.reasoningTimeMs && (
                        <span className="rounded bg-white/5 px-1.5 py-0.2 text-[10px] font-mono text-zinc-500">
                          {msg.reasoningTimeMs}ms
                        </span>
                      )}
                    </span>
                    {showThinking[msg.id] ? (
                      <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                  </button>

                  {showThinking[msg.id] && (
                    <div className="mt-2.5 space-y-2 border-t border-white/5 pt-2">
                      {msg.thinking && (
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-mono bg-zinc-950/60 p-2 rounded border border-white/5">
                          {msg.thinking}
                        </p>
                      )}

                      {/* Action Steps cards */}
                      {msg.thoughts && msg.thoughts.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                            Executed Action Stream
                          </span>
                          {msg.thoughts.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-start justify-between gap-2 rounded-md border border-white/5 bg-zinc-950/80 px-2.5 py-1.5 text-[11px]"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="mt-0.5">{renderActionIcon(step.type)}</span>
                                <div className="min-w-0">
                                  <div className="font-medium text-zinc-200 truncate">
                                    {step.title}
                                  </div>
                                  {step.detail && (
                                    <div className="text-[10px] text-zinc-400 font-mono truncate">
                                      {step.detail}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono shrink-0">
                                {step.durationMs && <span>{step.durationMs}ms</span>}
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Balão de Mensagem */}
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm",
                  isUser
                    ? "rounded-tr-xs bg-zinc-100 text-zinc-950 font-medium selection:bg-zinc-300"
                    : "rounded-tl-xs border border-white/10 bg-zinc-900/90 text-zinc-200"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Tool Call Card */}
                {msg.toolCall && (
                  <div className="mt-2.5 rounded-lg border border-white/10 bg-zinc-950/90 p-2 text-[11px]">
                    <div className="flex items-center justify-between text-zinc-400 pb-1 mb-1 border-b border-white/5">
                      <span className="flex items-center gap-1.5 font-mono font-medium text-cyan-300">
                        <Wrench className="h-3 w-3 text-cyan-400" />
                        {msg.toolCall.name}
                      </span>
                      <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-mono text-zinc-400 border border-white/5">
                        {msg.toolCall.server || "mcp"}
                      </span>
                    </div>
                    <pre className="overflow-x-auto text-[10px] text-zinc-400 font-mono p-1">
                      {JSON.stringify(msg.toolCall.args, null, 2)}
                    </pre>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Executed via Playwright Engine</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 pl-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
            <span className="font-mono text-[11px]">Grok Engine navegando e interagindo com o DOM...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugestões Rápidas & Presets (Grok Chips) */}
      <div className="border-t border-white/5 bg-zinc-950/80 px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap pl-1 pr-1">
            <Zap className="h-3 w-3 text-amber-400" />
            Ações Rápidas:
          </span>
          {quickCommandPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/90 px-3 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all shrink-0 shadow-xs"
            >
              {preset.icon === "search" && <Search className="h-3 w-3 text-cyan-400" />}
              {preset.icon === "extract" && <Table className="h-3 w-3 text-amber-400" />}
              {preset.icon === "form" && <Type className="h-3 w-3 text-purple-400" />}
              {preset.icon === "navigate" && <Globe className="h-3 w-3 text-emerald-400" />}
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Caixa de Entrada de Instrução */}
      <div className="border-t border-white/10 bg-zinc-900/90 p-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="relative rounded-xl border border-white/10 bg-zinc-950 focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/30 transition-all shadow-inner">
            <textarea
              ref={inputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                botMode === "ai_autonomous"
                  ? "Instrua o bot para pesquisar, preencher formulários ou extrair dados..."
                  : "Modo intervenção: envie ordens manuais para o sandbox..."
              }
              rows={2}
              className="w-full resize-none bg-transparent px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
            />
            <div className="flex items-center justify-between border-t border-white/5 px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                  title="Anexar arquivo ou referência de imagem"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
                  title="Inspecionar comando de terminal"
                >
                  <Terminal className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[10px] text-zinc-500 font-mono">
                  <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 font-mono">Enter</kbd> enviar
                </span>
                <button
                  type="submit"
                  disabled={!inputVal.trim()}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-all shadow-sm",
                    inputVal.trim()
                      ? "bg-white text-zinc-950 hover:bg-zinc-200"
                      : "bg-white/5 text-zinc-600 cursor-not-allowed"
                  )}
                >
                  <span>Executar</span>
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
