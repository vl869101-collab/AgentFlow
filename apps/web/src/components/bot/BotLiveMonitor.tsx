"use client";

import {
  Camera,
  Check,
  ChevronRight,
  Compass,
  Expand,
  Eye,
  Globe,
  Hand,
  Laptop,
  Maximize2,
  Minimize2,
  Monitor,
  MousePointer,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Smartphone,
  Tablet,
  Video,
  Wifi,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  BotMode,
  BrowserViewportState,
  ConnectionStatus,
  StreamProtocol,
} from "./bot-types";

type Props = {
  botMode: BotMode;
  onTakeoverToggle: () => void;
  streamProtocol: StreamProtocol;
  onProtocolChange: (proto: StreamProtocol) => void;
};

export function BotLiveMonitor({
  botMode,
  onTakeoverToggle,
  streamProtocol,
  onProtocolChange,
}: Props) {
  const [viewport, setViewport] = useState<BrowserViewportState>({
    currentUrl: "https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#Instances:",
    pageTitle: "EC2 Management Console | AWS Global Infrastructure",
    zoom: 100,
    isFullscreen: false,
    resolution: { width: 1920, height: 1080, name: "Desktop 1080p" },
    isLoading: false,
    fps: 58,
    latencyMs: 24,
    bandwidthMbps: 4.8,
  });

  const [mousePos, setMousePos] = useState({ x: 380, y: 240 });
  const [isSimulatingClick, setIsSimulatingClick] = useState(false);
  const [cursorTarget, setCursorTarget] = useState("button#view-instances");
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Simulação de movimento do cursor em modo IA
  useEffect(() => {
    if (botMode !== "ai_autonomous") return;

    const interval = setInterval(() => {
      setMousePos((prev) => ({
        x: Math.min(Math.max(prev.x + (Math.random() * 80 - 40), 120), 750),
        y: Math.min(Math.max(prev.y + (Math.random() * 60 - 30), 80), 450),
      }));
    }, 2400);

    return () => clearInterval(interval);
  }, [botMode]);

  const handleZoom = (delta: number) => {
    setViewport((prev) => ({
      ...prev,
      zoom: Math.min(Math.max(prev.zoom + delta, 50), 200),
    }));
  };

  const handleRefresh = () => {
    setViewport((prev) => ({ ...prev, isLoading: true }));
    setTimeout(() => {
      setViewport((prev) => ({ ...prev, isLoading: false }));
    }, 800);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setViewport((prev) => ({ ...prev, isFullscreen: true }));
    } else {
      document.exitFullscreen?.().catch(() => {});
      setViewport((prev) => ({ ...prev, isFullscreen: false }));
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (botMode !== "human_takeover") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    setIsSimulatingClick(true);
    setTimeout(() => setIsSimulatingClick(false), 200);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden relative select-none",
        viewport.isFullscreen && "p-4 bg-zinc-950 z-50 fixed inset-0"
      )}
    >
      {/* Barra de Ferramentas / Navegador Superior */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/80 px-4 py-2.5 backdrop-blur-md">
        {/* URL Bar estilo Chrome/DevTools */}
        <div className="flex flex-1 items-center gap-2 min-w-[280px]">
          <div className="flex items-center gap-1 text-zinc-400">
            <button
              type="button"
              onClick={handleRefresh}
              className={cn(
                "rounded p-1 hover:bg-white/5 hover:text-zinc-200 transition-transform",
                viewport.isLoading && "animate-spin text-violet-400"
              )}
              title="Recarregar página"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/80 px-2.5 py-1 text-xs text-zinc-300">
            <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-mono">
              <Globe className="h-3.5 w-3.5" />
              <span>https://</span>
            </span>
            <input
              type="text"
              readOnly
              value={viewport.currentUrl.replace("https://", "")}
              className="w-full bg-transparent font-mono text-[11px] text-zinc-200 outline-none truncate"
            />
            {viewport.isLoading && (
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-ping" />
            )}
          </div>
        </div>

        {/* Protocolo, Status e Controles do Monitor */}
        <div className="flex items-center gap-2">
          {/* Protocol Badge Selector */}
          <div className="flex items-center rounded-lg border border-white/10 bg-zinc-950 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onProtocolChange("webrtc")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-all",
                streamProtocol === "webrtc"
                  ? "bg-violet-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              WebRTC (Ultra-low)
            </button>
            <button
              type="button"
              onClick={() => onProtocolChange("novnc")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-all",
                streamProtocol === "novnc"
                  ? "bg-violet-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              noVNC / WebSocket
            </button>
          </div>

          {/* Telemetria de conexão */}
          <div className="hidden sm:flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950/50 px-2 py-1 text-[10px] text-zinc-400 font-mono">
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3 w-3" />
              {viewport.fps} FPS
            </span>
            <span className="text-zinc-600">•</span>
            <span>{viewport.latencyMs}ms</span>
            <span className="text-zinc-600">•</span>
            <span>{viewport.bandwidthMbps} Mbps</span>
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-zinc-950 p-0.5">
            <button
              type="button"
              onClick={() => handleZoom(-10)}
              className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              title="Reduzir Zoom"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-1 text-[10px] font-mono text-zinc-300 w-9 text-center">
              {viewport.zoom}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(10)}
              className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              title="Aumentar Zoom"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md border border-white/10 bg-zinc-950 p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            title={viewport.isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {viewport.isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Faixa de Status de Controle (Takeover vs Autônomo) */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-1.5 text-xs font-medium border-b transition-colors",
          botMode === "human_takeover"
            ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
            : "bg-violet-950/30 border-violet-500/20 text-violet-300"
        )}
      >
        <div className="flex items-center gap-2">
          {botMode === "human_takeover" ? (
            <>
              <Hand className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
              <span>
                <strong>Modo Intervenção Manual:</strong> Suas ações de mouse e teclado estão sendo enviadas ao navegador sandbox.
              </span>
            </>
          ) : (
            <>
              <Compass className="h-3.5 w-3.5 text-violet-400 animate-spin" />
              <span>
                <strong>Navegador em Modo Autônomo:</strong> O Agentflowbot está executando passos via Playwright/MCP.
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onTakeoverToggle}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-semibold transition-all border",
            botMode === "human_takeover"
              ? "bg-amber-400 text-zinc-950 hover:bg-amber-300 border-amber-300 shadow-sm"
              : "bg-violet-600 text-white hover:bg-violet-500 border-violet-400/40 shadow-sm"
          )}
        >
          {botMode === "human_takeover" ? "Restaurar Piloto Automático" : "Assumir Controle Manual"}
        </button>
      </div>

      {/* Área Central de Visualização (Live Canvas do Navegador) */}
      <div
        onClick={handleCanvasClick}
        className={cn(
          "flex-1 relative overflow-auto bg-zinc-900/90 flex items-center justify-center p-2",
          botMode === "human_takeover" ? "cursor-crosshair" : "cursor-default"
        )}
      >
        {/* Canvas / Viewport Simulado de Alta Fidelidade */}
        <div
          style={{ transform: `scale(${viewport.zoom / 100})`, transformOrigin: "center center" }}
          className="relative w-[880px] h-[520px] rounded-lg border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden transition-transform duration-100 flex flex-col"
        >
          {/* Header interno do navegador simulado */}
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 font-medium text-zinc-300">{viewport.pageTitle}</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span>{viewport.resolution.width}x{viewport.resolution.height}</span>
              <span className="rounded bg-emerald-500/10 px-1 text-emerald-400 border border-emerald-500/20">LIVE</span>
            </div>
          </div>

          {/* Conteúdo Renderizado (Mock de AWS Console / Aplicação em Execução) */}
          <div className="flex-1 bg-zinc-950 p-4 font-sans text-xs text-zinc-200 overflow-hidden relative">
            {/* Topbar AWS */}
            <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-3 py-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-400 tracking-wider text-[11px]">AWS CLOUD</span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-300 font-medium">EC2 Console</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 border border-zinc-700">Region: us-east-1</span>
                <span className="text-zinc-400">Account: 8492-3841-9012</span>
              </div>
            </div>

            {/* Grid de Métricas no Browser */}
            <div className="grid grid-cols-4 gap-2.5 mb-3">
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-500 block">Instâncias em Execução</span>
                <span className="text-lg font-bold text-emerald-400">4</span>
                <span className="text-[10px] text-zinc-400 block mt-0.5">t3.xlarge, c6i.2xlarge</span>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-500 block">Security Groups</span>
                <span className="text-lg font-bold text-zinc-200">12</span>
                <span className="text-[10px] text-emerald-400 block mt-0.5">TLS 1.3 enforced</span>
              </div>
              <div className="rounded border border-red-500/30 bg-red-950/20 p-2.5">
                <span className="text-[10px] text-red-400 block font-medium">CloudWatch Alarms</span>
                <span className="text-lg font-bold text-red-400">1 Ativo</span>
                <span className="text-[10px] text-red-300/80 block mt-0.5">CPU &gt; 90% (5min)</span>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-500 block">Load Balancers</span>
                <span className="text-lg font-bold text-zinc-200">2 ALB</span>
                <span className="text-[10px] text-zinc-400 block mt-0.5">Healthy (100%)</span>
              </div>
            </div>

            {/* Tabela de Instâncias */}
            <div className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <div className="border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 flex items-center justify-between">
                <span>Instâncias EC2 Filtradas</span>
                <span className="font-mono text-zinc-500">4 itens encontrados</span>
              </div>
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-zinc-800/80 text-[10px] text-zinc-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Instance ID</th>
                    <th className="px-3 py-1.5 font-medium">Name</th>
                    <th className="px-3 py-1.5 font-medium">State</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 font-medium">Public IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-zinc-300 font-mono text-[10px]">
                  <tr className="hover:bg-zinc-800/30">
                    <td className="px-3 py-1.5 text-violet-400">i-0fa83c799a</td>
                    <td className="px-3 py-1.5 font-sans font-medium text-zinc-200">agentflow-core-worker-01</td>
                    <td className="px-3 py-1.5 text-red-400 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> ALARM (High CPU)
                    </td>
                    <td className="px-3 py-1.5">c6i.2xlarge</td>
                    <td className="px-3 py-1.5">54.210.82.11</td>
                  </tr>
                  <tr className="hover:bg-zinc-800/30">
                    <td className="px-3 py-1.5 text-violet-400">i-0129bc944f</td>
                    <td className="px-3 py-1.5 font-sans font-medium text-zinc-200">agentflow-mcp-broker</td>
                    <td className="px-3 py-1.5 text-emerald-400">running</td>
                    <td className="px-3 py-1.5">t3.xlarge</td>
                    <td className="px-3 py-1.5">52.87.194.22</td>
                  </tr>
                  <tr className="hover:bg-zinc-800/30">
                    <td className="px-3 py-1.5 text-violet-400">i-0994fa1182</td>
                    <td className="px-3 py-1.5 font-sans font-medium text-zinc-200">n8n-migration-relay</td>
                    <td className="px-3 py-1.5 text-emerald-400">running</td>
                    <td className="px-3 py-1.5">t3.medium</td>
                    <td className="px-3 py-1.5">34.201.10.88</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cursor Virtual Visualizado (Movido pela IA ou pelo Usuário) */}
            <div
              style={{
                left: `${mousePos.x}px`,
                top: `${mousePos.y}px`,
                transition: botMode === "ai_autonomous" ? "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
              }}
              className="absolute pointer-events-none z-30"
            >
              <div className="relative">
                <MousePointer
                  className={cn(
                    "h-5 w-5 drop-shadow-md",
                    botMode === "human_takeover"
                      ? "text-amber-400 fill-amber-400/30"
                      : "text-violet-400 fill-violet-500/30"
                  )}
                />
                {isSimulatingClick && (
                  <span className="absolute -top-1 -left-1 h-7 w-7 rounded-full border-2 border-violet-400 animate-ping" />
                )}
                <div
                  className={cn(
                    "absolute left-4 top-4 rounded px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap shadow-lg border",
                    botMode === "human_takeover"
                      ? "bg-amber-950/90 text-amber-200 border-amber-500/40"
                      : "bg-violet-950/90 text-violet-200 border-violet-500/40"
                  )}
                >
                  {botMode === "human_takeover" ? "Operador" : "Agentflowbot (Playwright)"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
