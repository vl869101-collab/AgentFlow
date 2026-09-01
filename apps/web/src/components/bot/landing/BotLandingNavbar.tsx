"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Bot, ArrowRight, ShieldCheck, Terminal, Menu, X, Sparkles } from "lucide-react";

export function BotLandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-zinc-950/85 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/40 py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/bot/landing" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-violet-500/25 border border-white/20 group-hover:scale-105 transition-transform duration-150">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold tracking-tight text-zinc-100 flex items-center gap-1.5 text-base">
                AgentFlow <span className="text-violet-400 font-mono">Bot</span>
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[11px] font-mono text-violet-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            v2.5 WebRTC Engine
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-zinc-300">
          <Link href="#features" className="hover:text-violet-400 transition-colors">
            Recursos
          </Link>
          <Link href="#live-sandbox" className="hover:text-violet-400 transition-colors">
            Display noVNC
          </Link>
          <Link href="#architecture" className="hover:text-violet-400 transition-colors">
            Arquitetura
          </Link>
          <Link href="#use-cases" className="hover:text-violet-400 transition-colors">
            Casos de Uso
          </Link>
          <Link href="#comparison" className="hover:text-violet-400 transition-colors">
            Comparativo
          </Link>
          <Link href="#pricing" className="hover:text-violet-400 transition-colors">
            Planos
          </Link>
        </nav>

        {/* Action CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/bot"
            className="text-xs font-mono px-3 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/5 border border-white/10 transition-colors flex items-center gap-1.5"
          >
            <Terminal className="w-3.5 h-3.5 text-violet-400" />
            Console Ativo
          </Link>
          <Link
            href="/bot"
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md shadow-violet-500/20 active:scale-[0.98] transition-all flex items-center gap-1.5"
          >
            <span>Iniciar Bot</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/bot"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white flex items-center gap-1"
          >
            <span>Console</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 border border-white/10"
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-zinc-950/95 backdrop-blur-2xl border-b border-white/10 px-4 pt-3 pb-6 space-y-3 animate-in fade-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-2 text-sm text-zinc-300">
            <Link
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white"
            >
              Recursos de Autonomia
            </Link>
            <Link
              href="#live-sandbox"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white"
            >
              Display noVNC Virtual
            </Link>
            <Link
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white"
            >
              Arquitetura Técnica (MCP + Xvfb)
            </Link>
            <Link
              href="#use-cases"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white"
            >
              Casos de Uso
            </Link>
            <Link
              href="#comparison"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white"
            >
              Tabela Comparativa
            </Link>
            <Link
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white"
            >
              Planos & Capacidade
            </Link>
          </nav>
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <Link
              href="/bot"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-lg bg-violet-600 text-white font-medium text-sm flex items-center justify-center gap-2"
            >
              <Bot className="w-4 h-4" />
              <span>Abrir Bot Console</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
