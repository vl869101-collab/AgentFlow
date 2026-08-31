"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  ChevronRight,
  Clock,
  HelpCircle,
  Home,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const topNav = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agentflowbot", href: "/bot", icon: Bot },
  { label: "Personal", href: "/personal", icon: UserRound },
];

const workspaceNav: { label: string; href: string; icon: typeof KeyRound; badge?: string }[] = [];

const footerNav = [
  { label: "Admin Panel", href: "/settings", icon: Settings },
  { label: "Templates", href: "/workflows", icon: LayoutGrid },
  { label: "Insights", href: "/executions", icon: BarChart3 },
  { label: "Help", href: "/", icon: HelpCircle },
];

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M7.5 4.5 L12.5 19.5" stroke="#ff6d3c" strokeWidth="5" strokeLinecap="round" />
      <path d="M12.5 4.5 L7.5 19.5" stroke="#ff4785" strokeWidth="5" strokeLinecap="round" />
      <path d="M16.5 6 L19 6 L17 9" stroke="#ff6d3c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const settingsDrawerItems = [
  { label: "Personal", href: "/settings", icon: UserRound },
  { label: "Users", href: "/settings/users", icon: UserRound },
  { label: "AI Usage", href: "/settings/ai-usage", icon: Sparkles },
  { label: "Roles", href: "/settings/roles", icon: ShieldCheck },
  { label: "External Secrets", href: "/settings/external-secrets", icon: KeyRound },
  { label: "Environments", href: "/settings/environments", icon: LayoutGrid },
  { label: "SSO", href: "/settings/sso", icon: ShieldCheck },
  { label: "Security & policies", href: "/settings/security", icon: ShieldCheck },
  { label: "LDAP", href: "/settings/ldap", icon: UserRound },
  { label: "Log Streaming", href: "/settings/log-streaming", icon: BarChart3 },
  { label: "OpenTelemetry", href: "/settings/opentelemetry", icon: BarChart3 },
  { label: "Community nodes", href: "/settings/community-nodes", icon: LayoutGrid },
  { label: "Instance-level MCP", href: "/mcp", icon: LayoutGrid },
  { label: "Agentflowbot Live", href: "/bot", icon: Bot },
  { label: "Chat Preview", href: "/chat", icon: HelpCircle },
  { label: "AI Assistant Preview", href: "/assistant", icon: Sparkles },
] as const;

export function Sidebar({ collapsed, onCollapsedChange, mobileOpen, onMobileClose }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [variableHover, setVariableHover] = useState(false);
  const [settingsFlyoutOpen, setSettingsFlyoutOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) setPlusMenuOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsFlyoutOpen(false);
    }
    if (plusMenuOpen || settingsFlyoutOpen) document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [plusMenuOpen, settingsFlyoutOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={onMobileClose} aria-hidden="true" />
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-zinc-950 transition-all duration-200 lg:static lg:z-auto", collapsed ? "w-16" : "w-56", mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        {/* Execution quota status */}
        <div className={cn("px-4 pt-4", collapsed && "hidden")}>
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> 11 days left</span>
            <span className="text-zinc-600">0/1000 Executions</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[18%] rounded-full bg-violet-500" />
          </div>
        </div>

        {/* Logo row */}
        <div className={cn("flex items-center px-4 pt-4", collapsed ? "justify-center px-2" : "justify-between")}>
          <Link href="/" className="flex items-center gap-2" onClick={onMobileClose}>
            <LogoMark className="h-6 w-6 shrink-0" />
            {!collapsed ? <span className="text-[15px] font-semibold tracking-tight text-zinc-50">AgentFlow</span> : null}
          </Link>
          {!collapsed ? (
            <div className="flex items-center gap-0.5 text-zinc-500">
              <div className="relative" ref={plusMenuRef}>
                <button type="button" onClick={() => setPlusMenuOpen((value) => !value)} className={cn("rounded p-1.5 hover:bg-white/5 hover:text-zinc-200", plusMenuOpen && "bg-white/10 text-zinc-200")} aria-label="New workflow" aria-expanded={plusMenuOpen}><Plus className="h-4 w-4" /></button>
                {plusMenuOpen ? (
                  <div className="absolute left-0 top-9 z-20 w-48 rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-2xl shadow-black/40">
                    <Link href="/workflows" onClick={() => setPlusMenuOpen(false)} className="block px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">New workflow</Link>
                    <Link href="/credentials" onClick={() => setPlusMenuOpen(false)} className="block px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">New credential</Link>
                    <div className="relative" onMouseEnter={() => setVariableHover(true)} onMouseLeave={() => setVariableHover(false)}>
                      <button type="button" className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5 hover:text-zinc-100", variableHover ? "bg-white/5 text-zinc-100" : "text-zinc-300")}>
                        <span>New variable</span><ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                      </button>
                      {variableHover ? (
                        <div className="absolute left-full top-0 ml-1 w-44 rounded-lg border border-white/10 bg-zinc-900 py-1 shadow-2xl shadow-black/40">
                          <p className="px-3 py-1.5 text-xs font-medium text-zinc-500">Create in</p>
                          <button type="button" onClick={() => setPlusMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100"><LayoutGrid className="h-3.5 w-3.5 text-zinc-500" /> Global</button>
                          <button type="button" onClick={() => setPlusMenuOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100"><UserRound className="h-3 w-3 text-zinc-500" /> Personal</button>
                        </div>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => setPlusMenuOpen(false)} className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">New data table</button>
                    <button type="button" onClick={() => setPlusMenuOpen(false)} className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">New project</button>
                    <button type="button" onClick={() => setPlusMenuOpen(false)} className="block w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">New AI chat</button>
                  </div>
                ) : null}
              </div>
              <button type="button" className="rounded p-1.5 hover:bg-white/5 hover:text-zinc-200" aria-label="Search"><Search className="h-4 w-4" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-white/5 hover:text-zinc-200 lg:hidden" onClick={onMobileClose} aria-label="Close navigation"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
        </div>

        {/* AI Assistant */}
        {!collapsed ? (
          <Link href="/assistant" onClick={onMobileClose} className="mx-2 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="flex-1">AI Assistant</span>
            <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">Preview</span>
          </Link>
        ) : null}

        {/* Nav */}
        <nav className="mt-3 space-y-0.5 px-2" aria-label="Main navigation">
          {topNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onMobileClose}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                  collapsed && "justify-center px-0",
                  active ? "bg-white/5 text-zinc-50 font-medium" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-500")} aria-hidden="true" />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mx-2 my-4 border-t border-white/10" role="separator" />

        {/* Workspace extras */}
        <nav className="space-y-0.5 px-2" aria-label="Workspace navigation">
          {workspaceNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                  collapsed && "justify-center px-0",
                  active ? "bg-white/5 text-zinc-50 font-medium" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-500")} aria-hidden="true" />
                {!collapsed ? <span className="flex-1">{item.label}</span> : null}
                {!collapsed && item.badge ? <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto" />

        {/* Footer nav */}
        <nav className="space-y-0.5 border-t border-white/10 px-2 py-2" aria-label="Utility navigation">
          {footerNav.filter((i) => i.label !== "Settings").map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onMobileClose}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500",
                  collapsed && "justify-center px-0",
                  active ? "bg-white/5 text-zinc-50 font-medium" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-500")} aria-hidden="true" />
                {!collapsed ? <span className="flex-1">{item.label}</span> : null}
                {!collapsed ? <ChevronRight className="h-3.5 w-3.5 text-zinc-600 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
              </Link>
            );
          })}
          {!collapsed ? (
            <div className="relative" ref={settingsRef}>
              <button type="button" onClick={() => setSettingsFlyoutOpen((v) => !v)} className={cn("group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors", settingsFlyoutOpen || pathname.startsWith("/settings") || pathname.startsWith("/mcp") ? "bg-white/5 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")} aria-expanded={settingsFlyoutOpen}>
                <Settings className={cn("h-4 w-4 shrink-0", settingsFlyoutOpen ? "text-violet-500" : "text-zinc-500")} />
                <span className="flex-1">Settings</span>
                <ChevronRight className={cn("h-3.5 w-3.5 text-zinc-600 transition-transform", settingsFlyoutOpen && "rotate-90")} />
              </button>
              {settingsFlyoutOpen ? (
                <div className="absolute bottom-0 left-full z-50 ml-2 w-56 rounded-xl border border-white/10 bg-zinc-900 py-2 shadow-2xl shadow-black/50">
                  {settingsDrawerItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.label} href={item.href} onClick={() => { setSettingsFlyoutOpen(false); onMobileClose(); }} className={cn("flex items-center gap-2.5 px-3.5 py-2 text-sm", isActive(item.href) ? "bg-violet-500/10 text-violet-300" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="my-2 border-t border-white/10" />
                  <button type="button" onClick={() => { setSettingsFlyoutOpen(false); try { localStorage.removeItem("agentflow_token"); localStorage.removeItem("agentflow_user"); window.location.href = "/login"; } catch {} }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-300">Sign out</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {collapsed ? (
            <Link href="/settings" onClick={onMobileClose} title="Settings" className={cn("flex items-center justify-center rounded-md px-0 py-2 text-sm", isActive("/settings") ? "bg-white/5 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")}>
              <Settings className={cn("h-4 w-4", isActive("/settings") ? "text-violet-500" : "text-zinc-500")} />
            </Link>
          ) : null}
        </nav>

        {/* Collapse only - profile removed per n8n original, Settings via footerNav */}
        <div className="border-t border-white/10 p-2">
          {collapsed ? (
            <button type="button" onClick={() => onCollapsedChange(false)} className="flex w-full items-center justify-center rounded-md px-3 py-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200" title="Expand sidebar"><PanelLeftOpen className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={() => onCollapsedChange(true)} className="hidden w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:flex" title="Collapse sidebar"><PanelLeftClose className="h-4 w-4" /><span>Collapse sidebar</span></button>
          )}
        </div>
      </aside>
    </>
  );
}
