"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Check,
  Zap,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  Sparkles,
  Bot,
  HelpCircle,
} from "lucide-react";

export function PricingAndFaqSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "Como o AgentFlow Bot lida com Cloudflare, CAPTCHAs e bloqueios anti-bot?",
      a: "O AgentFlow Bot utiliza impressões digitais de Chromium autênticas em modo gráfico Xvfb, trajetórias de mouse orgânicas com jitter de aceleração e integração com pools de proxies residenciais. Diferente de scrapers em modo headless padrão, o bot renderiza a pilha gráfica completa, superando verificações de humanidade com taxa de sucesso acima de 99%.",
    },
    {
      q: "Posso interagir diretamente com o navegador enquanto o bot está operando?",
      a: "Sim. Com o recurso de 1-Click Human Takeover, você assume o controle imediato do mouse e teclado através do canvas WebRTC/noVNC. Você pode resolver um 2FA complexo ou aprovar uma transação sensível e devolver o controle para a IA com um único clique sem reiniciar a sessão.",
    },
    {
      q: "Minhas senhas e chaves de acesso são expostas ao modelo de linguagem (LLM)?",
      a: "Não. As credenciais ficam armazenadas de forma criptografada no AgentFlow Vault e são injetadas diretamente na memória do socket do navegador. O modelo de IA recebe apenas confirmações semânticas e tokens de sucesso, nunca a senha em texto puro.",
    },
    {
      q: "É possível acionar fluxos do bot via API, Webhooks ou Canvas de Workflows?",
      a: "Sim! O AgentFlow Bot é nativamente exposto como um servidor Model Context Protocol (MCP) e possui endpoints REST/Webhook. Você pode acionar ações de navegador a partir de nós visuais no canvas, bots de Slack ou GitHub Actions.",
    },
    {
      q: "O que acontece se a página alvo alterar o layout ou trocar as classes CSS?",
      a: "Como o AgentFlow Bot utiliza raciocínio visual multimodal (visão computacional + A11y Tree), ele localiza elementos pelo significado e contexto visual em vez de depender de seletores CSS estáticos. Se um botão mudar de cor ou for movido de lugar, o agente percebe a nova disposição e adapta-se automaticamente.",
    },
  ];

  return (
    <div className="bg-zinc-950">
      {/* =========================================================================
       * PRICING TIERS SECTION
       * ========================================================================= */}
      <section id="pricing" className="py-24 border-t border-white/5 relative scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-500/30 text-violet-300 text-xs font-mono mb-4">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span>SIMPLE, PREDICTABLE CAPACITY</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
              Start free. Scale your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400">
                browser fleet on demand.
              </span>
            </h2>
            <p className="text-zinc-400 text-base sm:text-lg leading-relaxed">
              Transparent compute hours. No hidden proxy fees. Unlimited custom workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-12">
            {/* Tier 1: Starter */}
            <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <div className="text-xs font-mono text-zinc-400 uppercase mb-2">Starter (Free)</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl sm:text-4xl font-bold text-white font-mono">R$ 0</span>
                  <span className="text-xs text-zinc-400">/ mês</span>
                </div>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Ideal para desenvolvedores individuais e testes de prototipação autônoma.
                </p>

                <ul className="space-y-3 text-xs text-zinc-300 mb-8">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>50 execuções autônomas / mês</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Preview noVNC 720p 30 FPS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>3 sandboxes concorrentes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Ferramentas MCP padrão</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/bot"
                className="w-full text-center py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-white/10 transition-colors"
              >
                Começar Gratuitamente
              </Link>
            </div>

            {/* Tier 2: Professional (Featured) */}
            <div className="rounded-2xl bg-gradient-to-b from-violet-950/50 via-zinc-900/90 to-zinc-900 border-2 border-violet-500/50 p-6 sm:p-8 flex flex-col justify-between relative shadow-2xl shadow-violet-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-violet-600 text-white font-mono text-[10px] font-bold tracking-wide uppercase shadow-md">
                Mais Popular
              </div>

              <div>
                <div className="text-xs font-mono text-violet-300 uppercase mb-2">Professional</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl sm:text-4xl font-bold text-white font-mono">R$ 290</span>
                  <span className="text-xs text-zinc-400">/ mês</span>
                </div>
                <p className="text-xs text-zinc-300 mb-6 leading-relaxed">
                  Para equipes de automação e operações que demandam alta performance contínua.
                </p>

                <ul className="space-y-3 text-xs text-zinc-200 mb-8">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-400 shrink-0 font-bold" />
                    <span className="font-semibold text-white">1.500 execuções autônomas / mês</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>WebRTC Ultra-Low Latency 1080p 60 FPS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>12 sandboxes isoladas concorrentes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>1-Click Human Takeover & Flight Logs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>Rotação de Proxies Residenciais</span>
                  </li>
                </ul>
              </div>

              <Link
                href="/bot"
                className="w-full text-center py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-violet-500/25 active:scale-[0.98] transition-all"
              >
                Assinar Plano Pro
              </Link>
            </div>

            {/* Tier 3: Enterprise */}
            <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-6 sm:p-8 flex flex-col justify-between hover:border-white/20 transition-all">
              <div>
                <div className="text-xs font-mono text-zinc-400 uppercase mb-2">Enterprise Fleet</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl sm:text-4xl font-bold text-white font-mono">Custom</span>
                  <span className="text-xs text-zinc-400">/ sob demanda</span>
                </div>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Infraestrutura dedicada on-premise ou Kubernetes para operações de altíssima escala.
                </p>

                <ul className="space-y-3 text-xs text-zinc-300 mb-8">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Capacidade ilimitada de navegadores</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Clusters dedicados gVisor / Kubernetes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>SSO / SAML e RBAC granular</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>SLA de 99.95% & Suporte 24/7 dedicado</span>
                  </li>
                </ul>
              </div>

              <a
                href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Gostaria%20de%20conversar%20sobre%20o%20plano%20Enterprise%20do%20AgentFlow%20Bot."
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-white/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                <span>Falar com Arquiteto</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
       * FAQ SECTION
       * ========================================================================= */}
      <section className="py-20 border-t border-white/5 bg-zinc-950/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-500/30 text-violet-300 text-xs font-mono mb-4">
              <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
              <span>FREQUENTLY ASKED QUESTIONS</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white">
              Tudo o que você precisa saber sobre o AgentFlow Bot
            </h3>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-zinc-900/60 border border-white/10 overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-semibold text-zinc-100">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      openFaq === idx ? "rotate-180 text-violet-400" : ""
                    }`}
                  />
                </button>

                {openFaq === idx && (
                  <div className="px-4 pb-5 sm:px-5 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-white/5 pt-3 animate-in fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
       * FINAL HIGH-CONVERSION CTA SECTION
       * ========================================================================= */}
      <section className="py-24 relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-violet-950/40 to-zinc-950 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-violet-600/20 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-violet-500/30 border border-white/20">
            <Bot className="w-7 h-7 text-white" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-6 leading-tight">
            Put your repetitive web tasks on{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400">
              autopilot today.
            </span>
          </h2>

          <p className="text-base sm:text-lg text-zinc-300 font-normal leading-relaxed max-w-2xl mx-auto mb-10">
            Junte-se a equipes de engenharia e operações que executam milhares de tarefas autônomas diariamente. Comece a criar seu primeiro fluxo em menos de 2 minutos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link
              href="/bot"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm sm:text-base shadow-xl shadow-violet-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 border border-white/10"
            >
              <Bot className="w-5 h-5" />
              <span>Launch AgentFlow Bot Console Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <a
              href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Gostaria%20de%20ver%20uma%20demonstra%C3%A7%C3%A3o%20ao%20vivo%20do%20AgentFlow%20Bot%20para%20minha%20empresa."
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-emerald-500/40 text-emerald-300 font-medium text-sm sm:text-base shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Falar no WhatsApp com Especialista</span>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>14-day full access trial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Deploy in under 120 seconds</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
       * FOOTER SECTION
       * ========================================================================= */}
      <footer className="bg-zinc-950 border-t border-white/10 py-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-violet-400" />
                <span className="font-bold text-white">AgentFlow Bot</span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                Autonomous Browser Infrastructure & Flight-Control AI.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-white mb-3">Produto</h5>
              <ul className="space-y-2 text-zinc-400">
                <li><Link href="/bot" className="hover:text-white transition-colors">Bot Console</Link></li>
                <li><Link href="/workflows" className="hover:text-white transition-colors">Workflow Canvas</Link></li>
                <li><Link href="/mcp" className="hover:text-white transition-colors">MCP Server Hub</Link></li>
                <li><Link href="/credentials" className="hover:text-white transition-colors">Credentials Vault</Link></li>
              </ul>
            </div>

            <div>
              <h5 className="font-semibold text-white mb-3">Recursos</h5>
              <ul className="space-y-2 text-zinc-400">
                <li><a href="#live-sandbox" className="hover:text-white transition-colors">noVNC Live Preview</a></li>
                <li><a href="#architecture" className="hover:text-white transition-colors">Arquitetura Técnica</a></li>
                <li><a href="#features" className="hover:text-white transition-colors">Documentação</a></li>
                <li><span className="text-zinc-500">Speed Test WebRTC</span></li>
              </ul>
            </div>

            <div>
              <h5 className="font-semibold text-white mb-3">Segurança & Legal</h5>
              <ul className="space-y-2 text-zinc-400">
                <li><span className="hover:text-white transition-colors">Termos de Uso</span></li>
                <li><span className="hover:text-white transition-colors">Privacidade</span></li>
                <li><span className="hover:text-white transition-colors">SOC 2 Compliance</span></li>
                <li><span className="text-emerald-400">Status 99.98%</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-zinc-500">
            <span>© 2026 AgentFlow Inc. All rights reserved.</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Cluster Health: 99.98%
              </span>
              <span>•</span>
              <span>Global Latency: 18ms</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
