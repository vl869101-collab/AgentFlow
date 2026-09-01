"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  Terminal,
  Play,
  Pause,
  RefreshCw,
  Camera,
  ShieldCheck,
  Zap,
  MousePointer,
  Keyboard,
  Cpu,
  Activity,
  Layers,
  Code2,
  ExternalLink,
  CheckCircle2,
  Lock,
  Eye,
  Check,
  ChevronRight,
  Maximize2,
  Globe,
} from "lucide-react";

export function HeroVirtualDisplay() {
  const [activeTab, setActiveTab] = useState<"stream" | "telemetry" | "mcp" | "script">("stream");
  const [protocol, setProtocol] = useState<"webrtc" | "novnc">("webrtc");
  const [isTakeover, setIsTakeover] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stepIndex, setStepIndex] = useState(2);
  const [screenshotTaken, setScreenshotTaken] = useState(false);

  // Simulated live step progress
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev >= 3 ? 0 : prev + 1));
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const thoughtSteps = [
    {
      id: "step-1",
      time: "10:42:19",
      type: "PLAN",
      title: "Parsing Natural Language Goal",
      detail: "Inspecionar painel AWS EC2, auditar CloudWatch alarms e extrair tabela de instâncias ativas.",
      status: stepIndex >= 0 ? "completed" : "running",
    },
    {
      id: "step-2",
      time: "10:42:20",
      type: "NAVIGATE",
      title: "Playwright Session in Xvfb :99",
      detail: "Iniciando sessão isolada gVisor #sbx-9942. Resolvendo networkidle0 e injetando token de sessão.",
      status: stepIndex >= 1 ? "completed" : stepIndex === 0 ? "running" : "pending",
    },
    {
      id: "step-3",
      time: "10:42:32",
      type: "ACTION",
      title: "Clicking button[data-testid='region-selector']",
      detail: "Visão computacional detectou menu regional. Selecionado 'us-east-1 (N. Virginia)'.",
      status: stepIndex >= 2 ? "completed" : stepIndex === 1 ? "running" : "pending",
    },
    {
      id: "step-4",
      time: "10:42:48",
      type: "EXTRACT",
      title: "Structured JSON Schema Extraction",
      detail: "Extraídos 4 registros de instâncias ativas (i-0fa83c799a, i-0129bc944f). Snapshot capturado.",
      status: stepIndex >= 3 ? "completed" : stepIndex === 2 ? "running" : "pending",
    },
  ];

  const handleTakeoverToggle = () => {
    setIsTakeover(!isTakeover);
  };

  const handleCaptureScreenshot = () => {
    setScreenshotTaken(true);
    setTimeout(() => setScreenshotTaken(false), 2000);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background Gradients & Grid Glow */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[450px] bg-gradient-to-tr from-violet-600/15 via-indigo-500/10 to-fuchsia-600/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/2 left-1/4 w-[400px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Eyebrow & Headlines */}
        <div className="text-center max-w-4xl mx-auto mb-12 md:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-950/60 border border-violet-500/30 text-violet-300 text-xs font-mono font-medium mb-6 shadow-inner shadow-violet-500/10 backdrop-blur-md">
            <Zap className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
            <span>BROWSER OPERATING SYSTEM FOR AI AGENTS</span>
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            <span className="text-zinc-400">60 FPS WebRTC Stream</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1] mb-6">
            The AI that sees, clicks, and operates the web{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-300 to-indigo-400">
              for you.
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-zinc-400 font-normal leading-relaxed max-w-3xl mx-auto mb-8">
            Give AgentFlow Bot any goal in plain Portuguese or English. It boots an isolated Chromium sandbox in a virtual display, reasons through complex multi-step workflows, extracts structured data, and lets you take control with one click.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link
              href="/bot"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm sm:text-base shadow-lg shadow-violet-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 border border-white/10"
            >
              <Bot className="w-5 h-5 text-white" />
              <span>Launch Interactive Bot Console</span>
              <ChevronRight className="w-4 h-4 text-violet-200" />
            </Link>

            <a
              href="#live-sandbox"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-zinc-200 font-medium text-sm sm:text-base shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Play className="w-4 h-4 text-violet-400" />
              <span>Watch Live noVNC Demo</span>
            </a>
          </div>

          {/* Trust & Guarantee Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono text-zinc-400 max-w-3xl mx-auto pt-4 border-t border-white/5">
            <div className="flex items-center justify-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Sub-20ms WebRTC Stream</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Isolated Xvfb Displays</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Zero-Trust Vault Ready</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>1-Click Human Takeover</span>
            </div>
          </div>
        </div>

        {/* =========================================================================
         * INTERACTIVE HERO VISUALIZER & noVNC DISPLAY MOCKUP
         * ========================================================================= */}
        <div id="live-sandbox" className="relative max-w-5xl mx-auto scroll-mt-28">
          {/* Card Perimeter Glow */}
          <div className="absolute -inset-1 bg-gradient-to-b from-violet-600/30 via-indigo-500/20 to-transparent rounded-2xl blur-lg opacity-80" />

          <div className="relative rounded-2xl bg-zinc-950 border border-white/15 shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
            {/* Top Browser Bar & System Status */}
            <div className="bg-zinc-900/90 border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
              {/* Left: Window Controls & Title */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/80 border border-red-400/40" />
                  <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400/40" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400/40" />
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400 pl-2 border-l border-white/10">
                  <Globe className="w-3.5 h-3.5 text-violet-400" />
                  <span>Xvfb Chromium Display :99</span>
                </div>
              </div>

              {/* Center: Fake URL / Sandbox Address Bar */}
              <div className="flex-1 max-w-md mx-2 bg-zinc-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-300 flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-1.5 truncate">
                  <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-zinc-500">https://</span>
                  <span className="text-zinc-200 truncate">us-east-1.console.aws.amazon.com/ec2/home</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 ml-2">
                  1080p 60FPS
                </span>
              </div>

              {/* Right: Protocol & Live Status Badge */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-white/10 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setProtocol("webrtc")}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      protocol === "webrtc"
                        ? "bg-violet-600 text-white font-medium shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    WebRTC
                  </button>
                  <button
                    type="button"
                    onClick={() => setProtocol("novnc")}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      protocol === "novnc"
                        ? "bg-violet-600 text-white font-medium shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    noVNC
                  </button>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-semibold">LIVE 24/7</span>
                </div>
              </div>
            </div>

            {/* Sub-Header: Active Task & Telemetry Metrics */}
            <div className="bg-zinc-900/50 border-b border-white/5 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono text-[11px] font-semibold border border-violet-500/30">
                  TASK-082
                </span>
                <span className="font-medium text-zinc-200">
                  Auditing EC2 CloudWatch Alarms & Production Instances
                </span>
                <span className="text-zinc-500 hidden md:inline">|</span>
                <span className="text-zinc-400 font-mono text-[11px] hidden md:inline">
                  Step {stepIndex + 1} of 4: Extracting Critical Metrics
                </span>
              </div>

              <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-400">
                <div className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-cyan-400" />
                  <span>14.2s</span>
                </div>
                <div className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-amber-400" />
                  <span>4.1% CPU</span>
                </div>
                <div className="hidden sm:flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  <span>gVisor #sbx-9942</span>
                </div>
              </div>
            </div>

            {/* Main Stage Grid: Virtual Desktop Stream (Left) + Telemetry / MCP Engine (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px] bg-zinc-950">
              {/* Left Column (8 cols): Simulated Virtual Desktop UI */}
              <div className="lg:col-span-8 relative flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10 bg-zinc-950 overflow-hidden group">
                {/* Virtual Web Content Mockup */}
                <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between relative">
                  {/* Subtle Grid overlay on canvas */}
                  <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

                  {/* Simulated AWS / Web App Header Inside Canvas */}
                  <div className="bg-zinc-900/90 rounded-lg p-3 border border-white/10 mb-4 shadow-md">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center text-[9px] font-bold text-black">
                          AWS
                        </div>
                        <span className="text-xs font-semibold text-white">EC2 Management Console</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        us-east-1 (N. Virginia)
                      </span>
                    </div>

                    {/* Fake Metrics Rows */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-zinc-950 p-2 rounded border border-white/5">
                        <div className="text-[10px] text-zinc-500 font-mono">Running Instances</div>
                        <div className="text-sm font-semibold text-emerald-400 font-mono">4 Active</div>
                      </div>
                      <div className="bg-zinc-950 p-2 rounded border border-white/5">
                        <div className="text-[10px] text-zinc-500 font-mono">CloudWatch Alarms</div>
                        <div className="text-sm font-semibold text-zinc-200 font-mono">0 In Alarm</div>
                      </div>
                      <div className="bg-zinc-950 p-2 rounded border border-white/5">
                        <div className="text-[10px] text-zinc-500 font-mono">Security Groups</div>
                        <div className="text-sm font-semibold text-violet-400 font-mono">12 Configured</div>
                      </div>
                    </div>
                  </div>

                  {/* Fake Interactive Instances Table with Automated Cursor Highlighter */}
                  <div className="bg-zinc-900/80 rounded-lg border border-white/10 overflow-hidden shadow-md flex-1 flex flex-col justify-start">
                    <div className="bg-zinc-850 px-3 py-1.5 border-b border-white/10 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                      <span>Instances (4)</span>
                      <span className="text-violet-400 text-[10px]">Filter: status=running</span>
                    </div>
                    <div className="divide-y divide-white/5 text-[11px] font-mono">
                      <div className="px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <span className="text-zinc-200 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          i-0fa83c799a (prod-api-cluster)
                        </span>
                        <span className="text-zinc-400">t4g.xlarge</span>
                        <span className="text-emerald-400">running</span>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between bg-violet-500/10 border-l-2 border-violet-500 transition-colors relative">
                        <span className="text-violet-200 flex items-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          i-0129bc944f (bot-worker-node)
                        </span>
                        <span className="text-zinc-300">c6i.2xlarge</span>
                        <span className="text-emerald-400">running</span>

                        {/* Animated Autonomous Virtual Cursor Pointer */}
                        <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-violet-600 text-white text-[10px] px-2 py-0.5 rounded shadow-lg animate-bounce">
                          <MousePointer className="w-3 h-3" />
                          <span>Vision Target @e14</span>
                        </div>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <span className="text-zinc-200 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          i-09941bd55e (redis-cluster-cache)
                        </span>
                        <span className="text-zinc-400">r6g.large</span>
                        <span className="text-emerald-400">running</span>
                      </div>
                    </div>
                  </div>

                  {/* Human Takeover Active Banner (When Triggered) */}
                  {isTakeover && (
                    <div className="absolute inset-0 bg-violet-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                      <div className="w-12 h-12 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/50 mb-3 animate-pulse">
                        <Keyboard className="w-6 h-6" />
                      </div>
                      <h4 className="text-lg font-bold text-white mb-1">Human Takeover Active</h4>
                      <p className="text-xs text-zinc-300 max-w-sm mb-4 font-mono">
                        Direct WebRTC input streaming enabled. Mouse and keyboard events routed straight to remote Xvfb container.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsTakeover(false)}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md transition-colors"
                      >
                        Release Control to Bot
                      </button>
                    </div>
                  )}

                  {screenshotTaken && (
                    <div className="absolute top-4 right-4 bg-emerald-500/90 text-white text-xs font-mono px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 animate-in fade-in">
                      <Check className="w-4 h-4" />
                      <span>Snapshot Saved (1920x1080)</span>
                    </div>
                  )}
                </div>

                {/* Bottom Interactive Toolbar */}
                <div className="bg-zinc-900/95 border-t border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTakeoverToggle}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all active:scale-[0.98] ${
                        isTakeover
                          ? "bg-violet-600 text-white shadow-md shadow-violet-500/30"
                          : "bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-white/10 hover:border-violet-500/40"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 text-violet-400" />
                      <span>{isTakeover ? "Release Takeover" : "1-Click Human Takeover"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCaptureScreenshot}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 hover:text-white transition-colors"
                      title="Instant High-Res Screenshot"
                      aria-label="Capturar Screenshot"
                    >
                      <Camera className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPaused(!isPaused)}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 hover:text-white transition-colors"
                      title={isPaused ? "Resume execution" : "Pause execution"}
                      aria-label={isPaused ? "Continuar execução" : "Pausar execução"}
                    >
                      {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                    <span className="hidden sm:inline">Stream Latency:</span>
                    <span className="text-emerald-400 font-semibold">18.4 ms</span>
                  </div>
                </div>
              </div>

              {/* Right Column (4 cols): Live Telemetry, Thought Stream & MCP Badges */}
              <div className="lg:col-span-4 bg-zinc-900/60 flex flex-col">
                {/* Abas de Navegação do Painel */}
                <div className="flex items-center border-b border-white/10 bg-zinc-900/90 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setActiveTab("stream")}
                    className={`flex-1 py-2.5 px-3 text-center transition-colors border-b-2 ${
                      activeTab === "stream"
                        ? "border-violet-500 text-violet-300 font-medium bg-white/5"
                        : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Thought Stream
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("mcp")}
                    className={`flex-1 py-2.5 px-3 text-center transition-colors border-b-2 ${
                      activeTab === "mcp"
                        ? "border-violet-500 text-violet-300 font-medium bg-white/5"
                        : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    MCP Tools
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("script")}
                    className={`flex-1 py-2.5 px-3 text-center transition-colors border-b-2 ${
                      activeTab === "script"
                        ? "border-violet-500 text-violet-300 font-medium bg-white/5"
                        : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    JSON Output
                  </button>
                </div>

                {/* Aba 1: Thought Stream & Live Reasoning */}
                {activeTab === "stream" && (
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3 overflow-y-auto max-h-[380px]">
                    <div className="space-y-3 font-mono text-xs">
                      {thoughtSteps.map((step, idx) => (
                        <div
                          key={step.id}
                          className={`p-3 rounded-lg border transition-all ${
                            step.status === "running"
                              ? "bg-violet-950/40 border-violet-500/40 shadow-sm"
                              : step.status === "completed"
                              ? "bg-zinc-950/60 border-white/5 text-zinc-300"
                              : "bg-zinc-950/30 border-transparent text-zinc-600"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              {step.status === "completed" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : step.status === "running" ? (
                                <RefreshCw className="w-3.5 h-3.5 text-violet-400 animate-spin shrink-0" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-full border border-zinc-700 inline-block" />
                              )}
                              <span className="font-semibold text-violet-300 text-[10px] uppercase">
                                [{step.type}]
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500">{step.time}</span>
                          </div>
                          <p className="text-zinc-200 font-medium text-[11px] mb-0.5">{step.title}</p>
                          <p className="text-zinc-400 text-[10px] leading-relaxed">{step.detail}</p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Autonomy: 99.4%
                      </span>
                      <span>Vision: Claude 3.7 / Grok</span>
                    </div>
                  </div>
                )}

                {/* Aba 2: MCP Tools & Invocations */}
                {activeTab === "mcp" && (
                  <div className="p-4 flex-1 space-y-3 font-mono text-xs overflow-y-auto max-h-[380px]">
                    <div className="text-[11px] text-zinc-400 pb-2 border-b border-white/10">
                      Active Model Context Protocol (MCP) Tools:
                    </div>

                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/5">
                        <div className="flex items-center justify-between text-violet-300 font-medium mb-1">
                          <span>browser_navigate</span>
                          <span className="text-[10px] text-emerald-400">ready</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">
                          Acessa URLs com rotação de proxy residencial e bypass Cloudflare.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/5">
                        <div className="flex items-center justify-between text-violet-300 font-medium mb-1">
                          <span>browser_click</span>
                          <span className="text-[10px] text-emerald-400">ready</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">
                          Executa clique por coordenadas visuais ou referências `@eN` de acessibilidade.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/5">
                        <div className="flex items-center justify-between text-violet-300 font-medium mb-1">
                          <span>browser_extract_json</span>
                          <span className="text-[10px] text-emerald-400">ready</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">
                          Converte tabelas e nós DOM dinâmicos em esquemas tipados JSON.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/5">
                        <div className="flex items-center justify-between text-violet-300 font-medium mb-1">
                          <span>vault_inject_token</span>
                          <span className="text-[10px] text-amber-400">encrypted</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 font-sans">
                          Injeta credenciais seguras sem expor strings ao modelo de linguagem.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Aba 3: Output JSON Schema */}
                {activeTab === "script" && (
                  <div className="p-4 flex-1 flex flex-col font-mono text-xs overflow-y-auto max-h-[380px] bg-zinc-950">
                    <div className="text-[11px] text-zinc-400 pb-2 mb-2 border-b border-white/10 flex items-center justify-between">
                      <span>Live JSON Output Payload:</span>
                      <span className="text-emerald-400 text-[10px]">200 OK</span>
                    </div>
                    <pre className="text-[10px] text-emerald-300/90 leading-relaxed overflow-x-auto select-all">
{`{
  "taskId": "task-aws-ec2-082",
  "status": "success",
  "region": "us-east-1",
  "extractedAt": "2026-09-01T10:42:48Z",
  "instances": [
    {
      "id": "i-0fa83c799a",
      "name": "prod-api-cluster",
      "type": "t4g.xlarge",
      "state": "running"
    },
    {
      "id": "i-0129bc944f",
      "name": "bot-worker-node",
      "type": "c6i.2xlarge",
      "state": "running"
    }
  ],
  "alarms": 0,
  "telemetry": {
    "durationMs": 14200,
    "memoryMb": 218
  }
}`}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
