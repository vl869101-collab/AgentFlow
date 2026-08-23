"use client";

import { useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChevronLeft } from "lucide-react";

const providers = [
  { name: "OpenAI", icon: "◉" },
  { name: "Anthropic", icon: "A" },
  { name: "Google", icon: "◆" },
  { name: "Azure (API Key)", icon: "▲" },
  { name: "Azure (Entra ID)", icon: "▲" },
  { name: "Ollama", icon: "●" },
  { name: "AWS Bedrock", icon: "aws" },
  { name: "Vercel AI Gateway", icon: "▲" },
  { name: "xAI Grok", icon: "xAI" },
  { name: "Groq", icon: "◎" },
  { name: "OpenRouter", icon: "↗" },
  { name: "DeepSeek", icon: "◈" },
  { name: "Cohere", icon: "⬡" },
  { name: "Mistral Cloud", icon: "M" },
  { name: "NVIDIA Nemotron", icon: "■" },
];

function SettingsSubNav() {
  const items = [
    { label: "Personal", href: "/personal" },
    { label: "Users", href: "/settings" },
    { label: "AI Usage", href: "/settings" },
    { label: "Roles", badge: "New", href: "/settings" },
    { label: "External Secrets", href: "/settings" },
    { label: "Environments", href: "/settings" },
    { label: "SSO", href: "/settings" },
    { label: "Security & policies", href: "/settings" },
    { label: "LDAP", href: "/settings" },
    { label: "Log Streaming", href: "/settings" },
    { label: "OpenTelemetry", href: "/settings" },
    { label: "Community nodes", href: "/settings" },
    { label: "Instance-level MCP", href: "/settings" },
    { label: "Chat", badge: "Preview", active: true, href: "/chat" },
    { label: "AI Assistant", badge: "Preview", href: "/assistant" },
  ];
  return (
    <div className="w-52 shrink-0 border-r border-white/10 bg-zinc-900/30">
      <div className="p-3">
        <Link href="/settings" className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
          <ChevronLeft className="h-3 w-3" /> Settings
        </Link>
        <div className="mt-4 space-y-0.5">
          {items.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm ${it.active ? "bg-white/10 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}
            >
              <span>{it.label}</span>
              {it.badge ? <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${it.badge === "New" ? "bg-white/10 text-zinc-400" : "bg-violet-500/20 text-violet-300"}`}>{it.badge}</span> : null}
            </Link>
          ))}
        </div>
        <p className="mt-6 px-2.5 text-xs font-medium text-orange-500">Version 2.36.5</p>
      </div>
    </div>
  );
}

export default function ChatSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-4rem)] -m-6">
        <SettingsSubNav />
        <div className="flex-1 bg-zinc-950 p-8">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-xl font-semibold text-zinc-50">Chat</h1>

            <div className="mt-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-200">Enable Chat</p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">When disabled, Chat is hidden across the app and its API endpoints are turned off. You can re-enable it here at any time.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-zinc-700"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "left-4" : "left-0.5"}`} />
              </button>
            </div>

            <div className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-200">Providers</h2>
                <button type="button" className="rounded-md border border-white/10 p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300" aria-label="Refresh">
                  <span className="text-xs">↻</span>
                </button>
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
                <div className="grid grid-cols-[1.6fr_1fr_1fr_32px] gap-4 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-zinc-400">
                  <span>Provider</span>
                  <span>Models</span>
                  <span>Last edited</span>
                  <span />
                </div>
                <div className="divide-y divide-white/10">
                  {providers.map((p) => (
                    <div key={p.name} className="grid grid-cols-[1.6fr_1fr_1fr_32px] items-center gap-4 px-4 py-3 text-sm">
                      <span className="flex items-center gap-2 text-zinc-200">
                        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-white/5 text-[10px] text-zinc-400">{p.icon.slice(0, 2)}</span>
                        {p.name}
                      </span>
                      <span className="text-xs text-zinc-400">All models</span>
                      <span className="text-xs text-zinc-500">-</span>
                      <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300" aria-label={`${p.name} options`}>
                        ⋮
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
