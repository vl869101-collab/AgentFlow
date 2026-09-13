"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BotChatPanel } from "@/components/bot/BotChatPanel";
import { BotLiveMonitor } from "@/components/bot/BotLiveMonitor";
import { BotActivityDrawer } from "@/components/bot/BotActivityDrawer";
import type {
  BotChatMessage,
  BotMode,
  BotTask,
  BrowserAction,
  McpInvocation,
  StreamProtocol,
  ThoughtStep,
} from "@/components/bot/bot-types";
import {
  initialMockActions,
  initialMockChatMessages,
  initialMockMcpInvocations,
  initialMockTasks,
} from "@/components/bot/mock-bot-data";

export default function BotConsolePage() {
  const [messages, setMessages] = useState<BotChatMessage[]>(initialMockChatMessages);
  const [actions, setActions] = useState<BrowserAction[]>(initialMockActions);
  const [tasks, setTasks] = useState<BotTask[]>(initialMockTasks);
  const [mcpInvocations, setMcpInvocations] = useState<McpInvocation[]>(initialMockMcpInvocations);
  const [botMode, setBotMode] = useState<BotMode>("ai_autonomous");
  const [streamProtocol, setStreamProtocol] = useState<StreamProtocol>("webrtc");
  const [isStreaming, setIsStreaming] = useState(false);

  const generateUniqueId = (prefix: string) => {
    const randomSuffix = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 7);
    return `${prefix}-${Date.now()}-${randomSuffix}`;
  };

  const handleSendMessage = (content: string) => {
    const userMsg: BotChatMessage = {
      id: generateUniqueId("msg"),
      sender: "user",
      content,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    // Simulação do pipeline de raciocínio e execução do Grok Bot
    setTimeout(() => {
      const isSearchOrNavigate =
        content.toLowerCase().includes("http") ||
        content.toLowerCase().includes("acess") ||
        content.toLowerCase().includes("pesquis") ||
        content.toLowerCase().includes("preço") ||
        content.toLowerCase().includes("cliqu");

      const nowTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      const newAction: BrowserAction = {
        id: generateUniqueId("act"),
        type: isSearchOrNavigate ? "navigate" : "click",
        target: isSearchOrNavigate ? content : "button[type='submit']",
        value: isSearchOrNavigate ? "URL resolvida e inspecionada" : "Valor submetido",
        timestamp: nowTime,
        durationMs: 420,
        status: "completed",
      };

      setActions((prev) => [newAction, ...prev]);

      const dynamicThoughts: ThoughtStep[] = [
        {
          id: `${generateUniqueId("th")}-1`,
          type: "plan",
          title: "Interpretação e Quebra de Instrução",
          detail: `Comando: "${content}" mapeado para o motor de automação Grok.`,
          status: "completed",
          timestamp: nowTime,
          durationMs: 140,
        },
        {
          id: `${generateUniqueId("th")}-2`,
          type: isSearchOrNavigate ? "navigate" : "click",
          title: isSearchOrNavigate ? "Navegação até Endpoint" : "Interação com Elemento DOM",
          detail: isSearchOrNavigate ? "Playwright sandbox executou page.goto" : "Playwright executou page.click()",
          status: "completed",
          timestamp: nowTime,
          durationMs: 380,
        },
        {
          id: `${generateUniqueId("th")}-3`,
          type: "verify",
          title: "Validação de Integridade e Snapshot",
          detail: "Verificação de layout e captura de logs concluídos com êxito.",
          status: "completed",
          timestamp: nowTime,
          durationMs: 190,
        },
      ];

      const botReply: BotChatMessage = {
        id: generateUniqueId("msg"),
        sender: "bot",
        content: `Instrução processada com sucesso: "${content}". Ações de navegação e inspeção executadas no sandbox com isolamento de segurança.`,
        timestamp: nowTime,
        reasoningTimeMs: 710,
        thinking: `Plano executado: Analisada a intenção do usuário -> Executada ação no DOM -> Verificados seletores -> Registrado log de telemetria.`,
        thoughts: dynamicThoughts,
        toolCall: {
          name: "mcp_playwright_action",
          server: "mcp-playwright-cluster",
          actionType: isSearchOrNavigate ? "navigate" : "click",
          args: { command: content, mode: botMode, protocol: streamProtocol },
          status: "success",
        },
      };

      setMessages((prev) => [...prev, botReply]);
      setIsStreaming(false);
    }, 1100);
  };

  const handleTakeoverToggle = () => {
    const nextMode: BotMode = botMode === "ai_autonomous" ? "human_takeover" : "ai_autonomous";
    setBotMode(nextMode);

    const sysMsg: BotChatMessage = {
      id: generateUniqueId("msg-sys"),
      sender: "system",
      content:
        nextMode === "human_takeover"
          ? "Intervenção manual iniciada: O operador assumiu controle do mouse e teclado no sandbox."
          : "Controle devolvido à IA: Agentflowbot retomou o plano de ação autônomo.",
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    setMessages((prev) => [...prev, sysMsg]);
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-zinc-950 overflow-hidden">
        {/* Layout Split Screen: Chat Grok à esquerda + Live Monitor central à direita */}
        <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Painel Esquerdo: Chat com a IA (40% largura em desktop) */}
          <div className="flex-1 lg:max-w-[440px] xl:max-w-[500px] h-full overflow-hidden flex flex-col">
            <BotChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              botMode={botMode}
              onTakeoverToggle={handleTakeoverToggle}
              isStreaming={isStreaming}
            />
          </div>

          {/* Painel Direito: Live Monitor Grok Bot com streaming em tempo real */}
          <div className="flex-1 h-full overflow-hidden flex flex-col border-l border-white/10">
            <BotLiveMonitor
              botMode={botMode}
              onTakeoverToggle={handleTakeoverToggle}
              streamProtocol={streamProtocol}
              onProtocolChange={setStreamProtocol}
            />
          </div>
        </div>

        {/* Painel Inferior: Drawer de Atividades, Tarefas e MCP Tools */}
        <BotActivityDrawer
          tasks={tasks}
          actions={actions}
          mcpInvocations={mcpInvocations}
        />
      </div>
    </AppLayout>
  );
}
