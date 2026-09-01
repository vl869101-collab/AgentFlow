"use client";

import {
  Zap,
  ShieldCheck,
  MousePointer,
  RefreshCw,
  Lock,
  Layers,
  Sparkles,
  Cpu,
  ArrowRight,
  Eye,
  Radio,
  Clock,
  Terminal,
} from "lucide-react";
import Link from "next/link";

export function AutonomyBentoGrid() {
  return (
    <section id="features" className="py-24 bg-zinc-950 relative scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-500/30 text-violet-300 text-xs font-mono mb-4">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>ENGINEERED FOR PRODUCTION</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
            Everything you need to automate the web{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-300 to-indigo-400">
              without breaking.
            </span>
          </h2>
          <p className="text-zinc-400 text-base sm:text-lg leading-relaxed">
            Built from the ground up on Playwright, virtual framebuffers, and Model Context Protocol to eliminate the fragility of legacy RPA.
          </p>
        </div>

        {/* Bento Grid Layout (6 Core Pillars) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Card 1 (Large - Col span 2 on LG): Dual-Mode Headless & Headed Sandbox */}
          <div className="lg:col-span-2 rounded-2xl bg-zinc-900/70 border border-white/10 p-6 sm:p-8 hover:border-violet-500/40 transition-all duration-200 shadow-xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <Cpu className="w-36 h-36 text-violet-400" />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10">
                  Playwright Cluster
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                Dual-Mode Headless & Headed Sandbox
              </h3>
              <p className="text-sm font-semibold text-violet-300 mb-3">
                Invisible speed or full visual inspection.
              </p>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-xl">
                Run headless background tasks at 10x throughput for massive data extraction pipelines, or switch instantly to headed Xvfb streaming to watch the bot solve complex multi-page flows in real time.
              </p>
            </div>

            {/* Interactive visual detail inside card */}
            <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Headless: 10x Concurrency</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                <span>Headed: Xvfb :99 @ 60FPS</span>
              </div>
            </div>
          </div>

          {/* Card 2: Sub-20ms WebRTC & noVNC Live Stream */}
          <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-6 sm:p-8 hover:border-violet-500/40 transition-all duration-200 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10">
                  WebRTC + noVNC
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Sub-20ms WebRTC Live Stream
              </h3>
              <p className="text-xs font-semibold text-indigo-300 mb-2">
                Pixel-perfect stream directly in your browser.
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Zero plugin installations required. Stream 60 FPS video directly from the virtual display container to your console with crystal-clear mouse tracking and keyboard interaction.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Latency: 18.4ms (Global Edge)</span>
            </div>
          </div>

          {/* Card 3: Instant 1-Click Human Takeover */}
          <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-6 sm:p-8 hover:border-violet-500/40 transition-all duration-200 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <MousePointer className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10">
                  Human-in-the-Loop
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Instant 1-Click Human Takeover
              </h3>
              <p className="text-xs font-semibold text-purple-300 mb-2">
                Step in when human judgment is needed.
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                If a bot hits an unexpected 2FA prompt or an ambiguous layout, click Takeover. The bot pauses, you interact directly with the remote canvas, and the bot resumes where you left off.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-zinc-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-violet-400" />
              <span>Zero session disconnect</span>
            </div>
          </div>

          {/* Card 4: Self-Healing DOM & Auto-Recovery */}
          <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-6 sm:p-8 hover:border-violet-500/40 transition-all duration-200 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10">
                  Vision Reasoning
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Self-Healing DOM & Vision Recovery
              </h3>
              <p className="text-xs font-semibold text-cyan-300 mb-2">
                Never break on class renames or layout shifts.
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Powered by multimodal vision models that locate elements semantically rather than relying on brittle XPath selectors. If a button moves or changes styling, the bot recalibrates instantly.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-cyan-400 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>Accessibility Tree + Visual Match</span>
            </div>
          </div>

          {/* Card 5: Zero-Trust Credential Vault */}
          <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-6 sm:p-8 hover:border-violet-500/40 transition-all duration-200 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Lock className="w-5 h-5" />
                </div>
                <span className="text-xs font-mono px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-white/10">
                  Enterprise Vault
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                Zero-Trust Credential Vault
              </h3>
              <p className="text-xs font-semibold text-emerald-300 mb-2">
                Execute authenticated tasks without leaking keys.
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Passwords, API tokens, and session cookies are injected directly into the secure browser context via encrypted Vault brokers. LLM models never see raw credential strings.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>AES-256-GCM Hardware Encrypted</span>
            </div>
          </div>
        </div>

        {/* Banner CTA */}
        <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-violet-950/80 via-zinc-900 to-indigo-950/80 border border-violet-500/30 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-base sm:text-lg font-bold text-white">
              Native MCP Server & Workflow Canvas Integration
            </h4>
            <p className="text-xs sm:text-sm text-zinc-400">
              Trigger browser bots directly as drag-and-drop nodes in AgentFlow visual orchestrations.
            </p>
          </div>
          <Link
            href="/bot"
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-xs sm:text-sm shadow-md shadow-violet-500/25 active:scale-[0.98] transition-all flex items-center gap-2 shrink-0"
          >
            <span>Explore MCP Server</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
