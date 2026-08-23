"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
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
  Workflow,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const topNav = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Personal", href: "/workflows", icon: UserRound },
];

const workspaceNav = [
  { label: "Credentials", href: "/credentials", icon: KeyRound },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck, badge: "3" },
  { label: "Billing", href: "/billing", icon: CreditCard },
];

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

export function Sidebar({ collapsed, onCollapsedChange, mobileOpen, onMobileClose }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);

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
              <button type="button" className="rounded p-1.5 hover:bg-white/5 hover:text-zinc-200" aria-label="New workflow"><Plus className="h-4 w-4" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-white/5 hover:text-zinc-200" aria-label="Search"><Search className="h-4 w-4" /></button>
              <button type="button" className="rounded p-1.5 hover:bg-white/5 hover:text-zinc-200 lg:hidden" onClick={onMobileClose} aria-label="Close navigation"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
        </div>

        {/* AI Assistant */}
        {!collapsed ? (
          <Link href="/workflows" onClick={onMobileClose} className="mx-2 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100">
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
                title={collapsed ? item.label : undefined}
                className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", collapsed && "justify-center px-0", active ? "bg-white/5 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-500")} />
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mx-2 my-4 border-t border-white/10" />

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
                title={collapsed ? item.label : undefined}
                className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", collapsed && "justify-center px-0", active ? "bg-white/5 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-500")} />
                {!collapsed ? <span className="flex-1">{item.label}</span> : null}
                {!collapsed && item.badge ? <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto" />

        {/* Footer nav */}
        <nav className="space-y-0.5 border-t border-white/10 px-2 py-2" aria-label="Utility navigation">
          {footerNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onMobileClose}
                title={collapsed ? item.label : undefined}
                className={cn("group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", collapsed && "justify-center px-0", active ? "bg-white/5 text-zinc-50" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-500")} />
                {!collapsed ? <span className="flex-1">{item.label}</span> : null}
                {!collapsed ? <ChevronRight className="h-3.5 w-3.5 text-zinc-600 transition-transform group-hover:translate-x-0.5" /> : null}
              </Link>
            );
          })}
        </nav>

        {/* Profile + collapse */}
        <div className="border-t border-white/10 p-2">
          {collapsed ? (
            <button type="button" onClick={() => onCollapsedChange(false)} className="flex w-full items-center justify-center rounded-md px-3 py-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200" title="Expand sidebar"><PanelLeftOpen className="h-4 w-4" /></button>
          ) : (
            <>
              <div className="relative">
                <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-white/5" aria-expanded={profileOpen}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-semibold text-white">VS</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-zinc-200">Victor Silva</span><span className="block text-[10px] text-zinc-600">Admin</span></span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-600 transition-transform", profileOpen && "rotate-180")} />
                </button>
                {profileOpen ? (
                  <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg border border-white/10 bg-zinc-900 p-1.5 shadow-2xl shadow-black/40">
                    <div className="border-b border-white/10 px-3 py-2.5"><p className="text-xs font-medium text-zinc-200">victor@northstar.dev</p><p className="mt-0.5 text-[10px] text-zinc-600">Northstar Labs</p></div>
                    <Link href="/settings" onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><Settings className="h-3.5 w-3.5" /> Account settings</Link>
                    <Link href="/" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><span className="h-3.5 w-3.5" /> Sign out</Link>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => onCollapsedChange(true)} className="hidden w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:flex" title="Collapse sidebar"><PanelLeftClose className="h-4 w-4" /><span>Collapse sidebar</span></button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
