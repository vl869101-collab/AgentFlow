"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
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
  RotateCcw,
  RotateCw,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Tablet,
  Video,
  Wifi,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  BotMode,
  BrowserViewportState,
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
    pageTitle: "Amazon EC2 Console | Global Cloud Infrastructure",
    zoom: 100,
    isFullscreen: false,
    resolution: { width: 1920, height: 1080, name: "Desktop 1080p" },
    isLoading: false,
    fps: 60,
    latencyMs: 18,
    bandwidthMbps: 5.2,
    cursorActivity: "inspecting",
  });

  const [mousePos, setMousePos] = useState({ x: 420, y: 260 });
  const [isSimulatingClick, setIsSimulatingClick] = useState(false);
  const [isTypingAnimation, setIsTypingAnimation] = useState(false);
  const [searchValue, setSearchValue] = useState("instance-state-name: running");
  const [selectedInstanceId, setSelectedInstanceId] = useState("i-0fa83c799a");

  const containerRef = useRef<HTMLDivElement>(null);

  // Simulação contínua e realista de movimento do mouse/cursor em modo IA (Grok Agent)
  useEffect(() => {
    if (botMode !== "ai_autonomous") return;

    const waypoints = [
      { x: 280, y: 160, act: "clicking", search: "tag:Environment=production" },
      { x: 540, y: 290, act: "inspecting", search: "state:running" },
      { x: 380, y: 350, act: "typing", search: "metric:CPUUtilization" },
      { x: 680, y: 210, act: "clicking", search: "region:us-east-1" },
    ];

    let step = 0;
    const interval = setInterval(() => {
      const target = waypoints[step % waypoints.length];
      step += 1;

      setMousePos({ x: target.x, y: target.y });
      setViewport((prev) => ({ ...prev, cursorActivity: target.act as BrowserViewportState["cursorActivity"] }));

      if (target.act === "clicking") {
        setIsSimulatingClick(true);
        setTimeout(() => setIsSimulatingClick(false), 240);
      } else if (target.act === "typing") {
        setIsTypingAnimation(true);
        setTimeout(() => setIsTypingAnimation(false), 800);
      }
    }, 2800);

    return () => clearInterval(interval);
  }, [botMode]);

  const handleZoom = (delta: number) => {
    setViewport((prev) => ({
      ...prev,
      zoom: Math.min(Math.max(prev.zoom + delta, 60), 160),
    }));
  };

  const handleRefresh = () => {
    setViewport((prev) => ({ ...prev, isLoading: true }));
    setTimeout(() => {
      setViewport((prev) => ({ ...prev, isLoading: false }));
    }, 700);
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
      {/* Barra de Navegador Grok Bot / Browser Chrome Top */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/90 px-4 py-2 backdrop-blur-md">
        {/* Navigation Buttons + URL Bar */}
        <div className="flex flex-1 items-center gap-2 min-w-[300px]">
          <div className="flex items-center gap-1 text-zinc-400">
            <button
              type="button"
              className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              title="Voltar"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              title="Avançar"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className={cn(
                "rounded p-1 hover:bg-white/5 hover:text-zinc-200 transition-transform",
                viewport.isLoading && "animate-spin text-cyan-400"
              )}
              title="Recarregar página"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 shadow-inner">
            <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-mono">
              <Shield className="h-3 w-3 text-emerald-400" />
              <span>https://</span>
            </span>
            <input
              type="text"
              readOnly
              value={viewport.currentUrl.replace("https://", "")}
              className="w-full bg-transparent font-mono text-[11px] text-zinc-200 outline-none truncate"
            />
            {viewport.isLoading ? (
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            )}
          </div>
        </div>

        {/* Telemetria, Protocolo e Controles */}
        <div className="flex items-center gap-2">
          {/* Protocol Switcher */}
          <div className="flex items-center rounded-lg border border-white/10 bg-zinc-950 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onProtocolChange("webrtc")}
              className={cn(
                "rounded px-2.5 py-0.5 font-medium transition-all",
                streamProtocol === "webrtc"
                  ? "bg-white text-zinc-950 shadow-xs font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              WebRTC
            </button>
            <button
              type="button"
              onClick={() => onProtocolChange("novnc")}
              className={cn(
                "rounded px-2.5 py-0.5 font-medium transition-all",
                streamProtocol === "novnc"
                  ? "bg-white text-zinc-950 shadow-xs font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              noVNC
            </button>
          </div>

          {/* Telemetria de Streaming */}
          <div className="hidden sm:flex items-center gap-2 rounded-md border border-white/10 bg-zinc-950 px-2.5 py-1 text-[10px] text-zinc-400 font-mono">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <Wifi className="h-3 w-3" />
              {viewport.fps} FPS
            </span>
            <span className="text-zinc-700">|</span>
            <span>{viewport.latencyMs}ms</span>
            <span className="text-zinc-700">|</span>
            <span>{viewport.bandwidthMbps} MB/s</span>
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-zinc-950 p-0.5">
            <button
              type="button"
              onClick={() => handleZoom(-10)}
              className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              title="Reduzir"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-1 text-[10px] font-mono text-zinc-300 w-9 text-center">
              {viewport.zoom}%
            </span>
            <button
              type="button"
              onClick={() => handleZoom(10)}
              className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              title="Ampliar"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md border border-white/10 bg-zinc-950 p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
            title={viewport.isFullscreen ? "Sair de tela cheia" : "Tela cheia"}
          >
            {viewport.isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Banner de Modo de Controle (Autonomous vs Manual Takeover) */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-1.5 text-xs font-medium border-b transition-colors",
          botMode === "human_takeover"
            ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
            : "bg-zinc-900/60 border-white/5 text-zinc-300"
        )}
      >
        <div className="flex items-center gap-2">
          {botMode === "human_takeover" ? (
            <>
              <Hand className="h-3.5 w-3.5 text-amber-400 animate-bounce" />
              <span>
                <strong>Modo Operador Ativo:</strong> Teclado e mouse conectados diretamente ao viewport sandbox.
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
              <span>
                <strong>Navegação Autônoma em Tempo Real:</strong> Grok AI executando rotina de extração e monitoramento.
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onTakeoverToggle}
          className={cn(
            "rounded-md px-2.5 py-0.5 text-[11px] font-bold transition-all border shadow-xs",
            botMode === "human_takeover"
              ? "bg-amber-400 text-zinc-950 hover:bg-amber-300 border-amber-300"
              : "bg-white text-zinc-950 hover:bg-zinc-200 border-white"
          )}
        >
          {botMode === "human_takeover" ? "Restaurar Autonomia da IA" : "Assumir Controle Manual"}
        </button>
      </div>

      {/* Live Monitor Canvas Viewport Central */}
      <div
        onClick={handleCanvasClick}
        className={cn(
          "flex-1 relative overflow-auto bg-zinc-950 flex items-center justify-center p-3",
          botMode === "human_takeover" ? "cursor-crosshair" : "cursor-default"
        )}
      >
        {/* Janela de Navegador em Alta Definição */}
        <div
          style={{ transform: `scale(${viewport.zoom / 100})`, transformOrigin: "center center" }}
          className="relative w-[940px] h-[550px] rounded-xl border border-white/15 bg-zinc-950 shadow-2xl overflow-hidden transition-transform duration-100 flex flex-col"
        >
          {/* Header da Aba do Navegador */}
          <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-3 py-1.5 text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="flex items-center gap-1.5 rounded-t-md bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200 font-medium border-t border-x border-white/10">
                <Globe className="h-3 w-3 text-cyan-400" />
                <span className="max-w-[280px] truncate">{viewport.pageTitle}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span>{viewport.resolution.width}x{viewport.resolution.height}</span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-emerald-400 font-bold border border-emerald-500/20">
                LIVE SANDBOX
              </span>
            </div>
          </div>

          {/* Interface Renderizada da Aplicação (AWS EC2 Console Mock) */}
          <div className="flex-1 bg-zinc-950 p-4 text-xs text-zinc-200 overflow-hidden relative font-sans">
            {/* Topbar da Aplicação Simulada */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-900/80 px-3.5 py-2 mb-3.5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/20 border border-amber-500/40 text-amber-400 font-black text-[11px]">
                  AWS
                </div>
                <span className="font-bold text-zinc-100 tracking-wide text-xs">EC2 Management Console</span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-400 text-[11px]">Instances (Global View)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="rounded-md bg-zinc-950 px-2 py-0.5 text-zinc-300 border border-white/10">
                  Region: <strong className="text-amber-400">us-east-1</strong>
                </span>
                <span className="text-zinc-500">Acc: 8492-3841-9012</span>
              </div>
            </div>

            {/* Metric Cards do Navegador */}
            <div className="grid grid-cols-4 gap-3 mb-3.5">
              <div className="rounded-lg border border-white/10 bg-zinc-900/50 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Instâncias Ativas</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-extrabold text-emerald-400">4</span>
                  <span className="text-[10px] text-zinc-400">em execução</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-900/50 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Security Groups</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-extrabold text-zinc-200">12</span>
                  <span className="text-[10px] text-emerald-400">TLS 1.3 OK</span>
                </div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-red-400 block">CloudWatch Alarms</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-extrabold text-red-400">1 Crítico</span>
                  <span className="text-[10px] text-red-300">CPU &gt; 90%</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-900/50 p-3 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Load Balancers</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-extrabold text-zinc-200">2 ALB</span>
                  <span className="text-[10px] text-emerald-400">100% Healthy</span>
                </div>
              </div>
            </div>

            {/* Tabela de Instâncias com Linha Destacada */}
            <div className="rounded-lg border border-white/10 bg-zinc-900/40 overflow-hidden shadow-sm">
              <div className="border-b border-white/10 bg-zinc-900/80 px-3 py-2 text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5 text-zinc-400" />
                  Instâncias EC2 em Execução
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-zinc-950", isTypingAnimation && "ring-1 ring-cyan-400")}>
                    {searchValue}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">4 registros</span>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/5 bg-zinc-950/40 text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                  <tr>
                    <th className="px-3.5 py-2">Instance ID</th>
                    <th className="px-3.5 py-2">Name</th>
                    <th className="px-3.5 py-2">Status</th>
                    <th className="px-3.5 py-2">Instance Type</th>
                    <th className="px-3.5 py-2">Public IPv4</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px] text-zinc-300">
                  <tr
                    onClick={() => setSelectedInstanceId("i-0fa83c799a")}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedInstanceId === "i-0fa83c799a" ? "bg-red-950/30 text-white" : "hover:bg-white/[0.02]"
                    )}
                  >
                    <td className="px-3.5 py-2 text-cyan-400 font-bold">i-0fa83c799a</td>
                    <td className="px-3.5 py-2 font-sans font-medium text-zinc-100">agentflow-core-worker-01</td>
                    <td className="px-3.5 py-2 text-red-400 font-semibold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                      ALARM (CPU 94.8%)
                    </td>
                    <td className="px-3.5 py-2">c6i.2xlarge</td>
                    <td className="px-3.5 py-2">54.210.82.11</td>
                  </tr>
                  <tr
                    onClick={() => setSelectedInstanceId("i-0129bc944f")}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedInstanceId === "i-0129bc944f" ? "bg-white/5" : "hover:bg-white/[0.02]"
                    )}
                  >
                    <td className="px-3.5 py-2 text-cyan-400 font-bold">i-0129bc944f</td>
                    <td className="px-3.5 py-2 font-sans font-medium text-zinc-200">agentflow-mcp-broker</td>
                    <td className="px-3.5 py-2 text-emerald-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      running
                    </td>
                    <td className="px-3.5 py-2">t3.xlarge</td>
                    <td className="px-3.5 py-2">52.87.194.22</td>
                  </tr>
                  <tr
                    onClick={() => setSelectedInstanceId("i-0994fa1182")}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedInstanceId === "i-0994fa1182" ? "bg-white/5" : "hover:bg-white/[0.02]"
                    )}
                  >
                    <td className="px-3.5 py-2 text-cyan-400 font-bold">i-0994fa1182</td>
                    <td className="px-3.5 py-2 font-sans font-medium text-zinc-200">n8n-migration-relay</td>
                    <td className="px-3.5 py-2 text-emerald-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      running
                    </td>
                    <td className="px-3.5 py-2">t3.medium</td>
                    <td className="px-3.5 py-2">34.201.10.88</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cursor Virtual Animado da IA / Operador */}
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
                    "h-5 w-5 drop-shadow-lg",
                    botMode === "human_takeover"
                      ? "text-amber-400 fill-amber-400/40"
                      : "text-cyan-400 fill-cyan-400/40"
                  )}
                />
                {isSimulatingClick && (
                  <span className="absolute -top-2 -left-2 h-9 w-9 rounded-full border-2 border-cyan-400 animate-ping opacity-90" />
                )}
                <div
                  className={cn(
                    "absolute left-4 top-4 rounded-md px-2 py-0.5 text-[9px] font-mono whitespace-nowrap shadow-xl border backdrop-blur-md",
                    botMode === "human_takeover"
                      ? "bg-amber-950/90 text-amber-200 border-amber-500/40"
                      : "bg-zinc-950/95 text-cyan-200 border-cyan-500/40"
                  )}
                >
                  {botMode === "human_takeover" ? (
                    <span>Human Operator</span>
                  ) : (
                    <span>Grok Agent ({viewport.cursorActivity})</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
