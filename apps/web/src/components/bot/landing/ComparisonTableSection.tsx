"use client";

import { Check, X, Shield, Sparkles, Zap, Terminal } from "lucide-react";
import Link from "next/link";

export function ComparisonTableSection() {
  const comparisonRows = [
    {
      feature: "Adaptação a Mudanças de Layout (Self-Healing)",
      agentFlow: "Sim (Visão computacional + A11y Tree recalibram automaticamente)",
      traditional: "Não (Quebra imediatamente com qualquer alteração de classe ou XPath)",
      isCrucial: true,
    },
    {
      feature: "Transmissão ao Vivo do Desktop Virtual (noVNC / WebRTC)",
      agentFlow: "Sim (60 FPS com áudio e vídeo em tempo real no console)",
      traditional: "Não (Apenas logs de texto ou capturas estáticas pós-falha)",
      isCrucial: true,
    },
    {
      feature: "Assunção de Controle Humano em 1 Clique (Takeover)",
      agentFlow: "Sim (Pausa a IA e transfere teclado/mouse via WebRTC sem desconectar)",
      traditional: "Não (Impossível interagir com sessões headless remotas)",
      isCrucial: true,
    },
    {
      feature: "Injeção de Credenciais Seguras (Zero-Trust Vault)",
      agentFlow: "Sim (Injetadas em memória no socket do Chromium; modelo nunca vê senhas)",
      traditional: "Inseguro (Hardcoded em scripts .env ou arquivos de configuração expostos)",
      isCrucial: false,
    },
    {
      feature: "Integração Nativa com Model Context Protocol (MCP)",
      agentFlow: "Sim (Ferramentas padronizadas prontas para canvas e assistentes de IA)",
      traditional: "Não (APIs proprietárias ou scripts isolados de difícil integração)",
      isCrucial: false,
    },
    {
      feature: "Isolamento Térmico de Container por Execução (gVisor)",
      agentFlow: "Sim (Containers efêmeros descartados após cada tarefa)",
      traditional: "Raro (Executam no host com risco de contaminação e vazamento de cookies)",
      isCrucial: false,
    },
  ];

  return (
    <section id="comparison" className="py-24 bg-zinc-950 relative scroll-mt-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-500/30 text-violet-300 text-xs font-mono mb-4">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>DIRECT BENCHMARK</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
            AgentFlow Bot vs.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400">
              Automação Tradicional
            </span>
          </h2>
          <p className="text-zinc-400 text-base sm:text-lg leading-relaxed">
            Compare o paradigma de agentes com visão computacional contra scripts Selenium/Puppeteer frágeis e RPA legado.
          </p>
        </div>

        {/* Responsive Table Container */}
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/90 text-xs font-mono">
                  <th className="py-4 px-6 text-zinc-400 font-semibold w-1/3">Capacidade / Dimensão</th>
                  <th className="py-4 px-6 text-violet-300 font-bold bg-violet-500/10 border-x border-violet-500/20 w-1/3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-violet-400" />
                      <span>AgentFlow Bot (v2.5 Engine)</span>
                    </div>
                  </th>
                  <th className="py-4 px-6 text-zinc-400 font-medium w-1/3">
                    Selenium / Puppeteer & RPA Legado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs sm:text-sm">
                {comparisonRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      row.isCrucial ? "bg-white/[0.02] hover:bg-white/[0.04]" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td className="py-4 px-6 font-medium text-zinc-200">
                      {row.feature}
                    </td>

                    {/* AgentFlow Column */}
                    <td className="py-4 px-6 bg-violet-500/[0.05] border-x border-violet-500/20 text-zinc-200">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <span className="leading-snug">{row.agentFlow}</span>
                      </div>
                    </td>

                    {/* Traditional Column */}
                    <td className="py-4 px-6 text-zinc-400">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1 rounded bg-red-500/20 text-red-400 mt-0.5 shrink-0">
                          <X className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <span className="leading-snug">{row.traditional}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer Action Note */}
          <div className="p-4 sm:p-6 bg-zinc-950/80 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <span className="text-zinc-400 font-mono">
              Ready to replace fragile scrapers with autonomous vision agents?
            </span>
            <Link
              href="/bot"
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Experimentar Console Agora</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
