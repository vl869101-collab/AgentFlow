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

  const handleSendMessage = (content: string) => {
    const userMsg: BotChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      content,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    // Simulação da resposta inteligente do Agentflowbot
    setTimeout(() => {
      const isSearchOrNavigate = content.toLowerCase().includes("http") || content.toLowerCase().includes("acess") || content.toLowerCase().includes("cliqu");

      const newAction: BrowserAction = {
        id: `act-${Date.now()}`,
        type: isSearchOrNavigate ? "navigate" : "click",
        target: isSearchOrNavigate ? content : "button.primary-action",
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        durationMs: 420,
        status: "completed",
      };

      setActions((prev) => [newAction, ...prev]);

      const botReply: BotChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "bot",
        content: `Recebi sua instrução: "${content}". Executando operação de navegação e validando integridade no navegador sandbox.`,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        thinking: "Analisando intenção do usuário -> Validando seletores DOM no live canvas -> Disparando chamada MCP Puppeteer com isolamento de contexto.",
        toolCall: {
          name: "mcp_browser_action",
          server: "mcp-puppeteer-cluster",
          args: { command: content, mode: botMode },
          status: "success",
        },
      };

      setMessages((prev) => [...prev, botReply]);
      setIsStreaming(false);
    }, 1200);
  };

  const handleTakeoverToggle = () => {
    setBotMode((prev) => {
      const nextMode = prev === "ai_autonomous" ? "human_takeover" : "ai_autonomous";
      const sysMsg: BotChatMessage = {
        id: `msg-sys-${Date.now()}`,
        sender: "system",
        content:
          nextMode === "human_takeover"
            ? "Intervenção manual iniciada: O operador assumiu controle do mouse e teclado no sandbox."
            : "Controle devolvido à IA: Agentflowbot retomou o plano de ação autônomo.",
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      setMessages((m) => [...m, sysMsg]);
      return nextMode;
    });
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-zinc-950 overflow-hidden">
        {/* Layout Split Screen: Chat à esquerda + Live Monitor à direita */}
        <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Painel Esquerdo: Chat com a IA (40% largura em desktop) */}
          <div className="flex-1 lg:max-w-[420px] xl:max-w-[480px] h-full overflow-hidden flex flex-col">
            <BotChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              botMode={botMode}
              onTakeoverToggle={handleTakeoverToggle}
              isStreaming={isStreaming}
            />
          </div>

          {/* Painel Direito: Live Monitor com streaming em tempo real (60% largura em desktop) */}
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
