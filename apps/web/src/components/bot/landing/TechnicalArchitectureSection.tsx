"use client";

import { useState } from "react";
import {
  Layers,
  Cpu,
  ShieldCheck,
  Zap,
  Terminal,
  ArrowRight,
  Server,
  Lock,
  Eye,
  CheckCircle2,
  Database,
  Radio,
  FileCode,
} from "lucide-react";

export function TechnicalArchitectureSection() {
  const [activeStep, setActiveStep] = useState<number>(0);

  const architectureNodes = [
    {
      id: "orchestrator",
      title: "1. Orchestrator & LLM Core",
      badge: "Claude 3.7 / Grok Vision",
      icon: Cpu,
      description:
        "Recebe o objetivo em linguagem natural, gera o plano de execução, avalia visualmente o DOM a 60 FPS e orquestra chamadas de ferramentas MCP padronizadas.",
      details: [
        "Raciocínio multimodal contínuo (visão + texto)",
        "Decomposição automática de fluxos multi-páginas",
        "Detecção de layout shifts e auto-recuperação sem quebra de seletores",
      ],
    },
    {
      id: "mcp-server",
      title: "2. Protocolo MCP & Vault Seguro",
      badge: "Model Context Protocol",
      icon: Server,
      description:
        "Camada de barramento que expõe ferramentas padronizadas (browser_click, browser_type, browser_extract) e injeta credenciais do Vault sem vazamento.",
      details: [
        "Injeção de cookies e tokens via socket seguro",
        "Zero exposição de senhas em texto puro nos prompts",
        "Controle granular de permissões e auditoria OpenTelemetry",
      ],
    },
    {
      id: "sandbox",
      title: "3. Container gVisor & Xvfb Display",
      badge: "Xvfb :99 Isolated Display",
      icon: ShieldCheck,
      description:
        "Ambiente virtual isolado com framebuffer gráfico Xvfb, áudio virtual e proteção de host em container gVisor efêmero.",
      details: [
        "Display virtual nativo com suporte a aceleração gráfica",
        "Isolamento térmico e de memória por sessão",
        "Descarte automático de dados e cookies pós-execução",
      ],
    },
    {
      id: "playwright",
      title: "4. Cluster Playwright & WebRTC Stream",
      badge: "Sub-20ms noVNC / WebRTC",
      icon: Radio,
      description:
        "Motor de controle de navegador Chromium com anti-bot stealth, rotação de proxy residencial e streaming ao vivo para o console do operador.",
      details: [
        "Trajetórias de mouse orgânicas e bypass Cloudflare",
        "Captura de vídeo em 60 FPS direto para o canvas web",
        "Assunção de controle humano instantânea (Human Takeover)",
      ],
    },
  ];

  return (
    <section id="architecture" className="py-24 bg-zinc-950/70 relative border-t border-white/5 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 text-xs font-mono mb-4">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>SECURITY-FIRST ARCHITECTURE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Zero-trust containment.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400">
              Ephemeral by design.
            </span>
          </h2>
          <p className="text-zinc-400 text-base sm:text-lg leading-relaxed">
            Enterprise security teams approve AgentFlow Bot because every action runs in an isolated container that terminates after execution.
          </p>
        </div>

        {/* Interactive Architecture Flow Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-16">
          {/* Left Flow Steps Selector (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            {architectureNodes.map((node, index) => {
              const Icon = node.icon;
              const isSelected = activeStep === index;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${
                    isSelected
                      ? "bg-zinc-900 border-violet-500/50 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/30"
                      : "bg-zinc-950/80 border-white/5 hover:border-white/15 hover:bg-zinc-900/40 text-zinc-400"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? "bg-violet-600 text-white shadow-md shadow-violet-500/30"
                        : "bg-zinc-800 text-zinc-400 border border-white/10"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-sm font-semibold truncate ${isSelected ? "text-white" : "text-zinc-300"}`}>
                        {node.title}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                        {node.badge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed font-normal">
                      {node.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Detailed Visual Blueprint (7 cols) */}
          <div className="lg:col-span-7 bg-zinc-900/80 border border-white/10 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
            {/* Background Grid Accent */}
            <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between h-full min-h-[380px]">
              <div>
                <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
                      {(() => {
                        const CurrentIcon = architectureNodes[activeStep].icon;
                        return <CurrentIcon className="w-5 h-5" />;
                      })()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {architectureNodes[activeStep].title}
                      </h3>
                      <span className="text-xs font-mono text-violet-400">
                        {architectureNodes[activeStep].badge}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Active Subsystem
                  </span>
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed mb-6">
                  {architectureNodes[activeStep].description}
                </p>

                {/* Key Technical Properties */}
                <div className="space-y-3 mb-6">
                  <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    Core Specifications & Security Controls:
                  </h4>
                  <ul className="space-y-2">
                    {architectureNodes[activeStep].details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Code / Command Flow Preview */}
              <div className="mt-4 p-3 rounded-lg bg-zinc-950 border border-white/10 font-mono text-[11px] text-zinc-400 flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <Terminal className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="text-zinc-500">$</span>
                  <span className="text-zinc-300 truncate">
                    mcp-agentflow-bot --display=:99 --sandbox=gvisor --webrtc-port=8080
                  </span>
                </div>
                <span className="text-emerald-400 text-[10px] shrink-0 ml-2">RUNNING</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Architectural Security Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/15 transition-all">
            <ShieldCheck className="w-6 h-6 text-violet-400 mb-3" />
            <h4 className="text-sm font-semibold text-white mb-2">gVisor Sandboxes</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Cada sessão roda em container isolado com restrição total de I/O de disco e rede privada.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/15 transition-all">
            <Lock className="w-6 h-6 text-indigo-400 mb-3" />
            <h4 className="text-sm font-semibold text-white mb-2">Zero-Trust Credential Vault</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Senhas e certificados são injetados no socket sem nunca trafegar em texto puro pelo modelo.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/15 transition-all">
            <Eye className="w-6 h-6 text-cyan-400 mb-3" />
            <h4 className="text-sm font-semibold text-white mb-2">Visual Flight Recorder</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Cada clique, scroll e chamada de rede é gravada em logs imutáveis OpenTelemetry para auditoria.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/15 transition-all">
            <Database className="w-6 h-6 text-emerald-400 mb-3" />
            <h4 className="text-sm font-semibold text-white mb-2">Strict Egress Filter</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Filtro DNS customizado e IP allowlisting que bloqueiam conexões a intranets não autorizadas.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
