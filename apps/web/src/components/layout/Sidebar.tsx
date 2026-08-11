"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronRight,
  KeyRound,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Workflows", href: "/workflows", icon: Workflow },
  { label: "Executions", href: "/executions", icon: Activity },
  { label: "Credentials", href: "/credentials", icon: KeyRound },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck, badge: "3" },
];

export function Sidebar({ collapsed, onCollapsedChange, mobileOpen, onMobileClose }: { collapsed: boolean; onCollapsedChange: (value: boolean) => void; mobileOpen: boolean; onMobileClose: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={onMobileClose} aria-hidden="true" />
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-zinc-950/95 px-3 py-4 transition-all duration-200 lg:static lg:z-auto lg:bg-zinc-950", collapsed ? "w-16" : "w-64", mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className={cn("mb-8 flex h-9 items-center", collapsed ? "justify-center" : "justify-between px-2")}>
          <Link href="/" className="flex items-center gap-2" onClick={onMobileClose}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-violet-500/20">A</span>
            {!collapsed ? <span className="text-base font-semibold tracking-tight text-zinc-50">AgentFlow</span> : null}
          </Link>
          <button type="button" className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white lg:hidden" onClick={onMobileClose} aria-label="Close navigation"><X className="h-4 w-4" /></button>
        </div>

        <div className={cn("mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600", collapsed && "text-center")}>{collapsed ? "•" : "Workspace"}</div>
        <nav className="space-y-1" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                title={collapsed ? item.label : undefined}
                className={cn("group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200", collapsed && "justify-center px-0", active ? "bg-white/10 text-zinc-50" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200")}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-300" : "text-zinc-500 group-hover:text-zinc-300")} />
                {!collapsed ? <span className="flex-1">{item.label}</span> : null}
                {!collapsed && item.badge ? <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="my-6 border-t border-white/10" />
        <div className={cn("mb-3 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600", collapsed && "text-center")}>{collapsed ? "•" : "Manage"}</div>
        <Link href="/settings" onClick={onMobileClose} title={collapsed ? "Settings" : undefined} className={cn("group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-500 transition-all duration-200 hover:bg-white/5 hover:text-zinc-200", collapsed && "justify-center px-0", pathname.startsWith("/settings") && "bg-white/10 text-zinc-50")}>
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed ? <span>Settings</span> : null}
        </Link>

        <div className="mt-auto">
          {!collapsed ? (
            <div className="mb-4 rounded-xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-violet-300"><Sparkles className="h-4 w-4" /><span className="text-xs font-semibold">Pro workspace</span></div>
              <p className="text-xs leading-5 text-zinc-500">You have 71% of your monthly execution quota left.</p>
              <Link href="/settings" className="mt-3 flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200">Manage plan <ChevronRight className="h-3 w-3" /></Link>
            </div>
          ) : null}
          <button type="button" onClick={() => onCollapsedChange(!collapsed)} className={cn("hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:flex", collapsed && "justify-center px-0")} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed ? <span>Collapse sidebar</span> : null}
          </button>
        </div>
      </aside>
    </>
  );
}
