"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const titles: Record<string, string> = {
  "/dashboard": "Overview",
  "/workflows": "Workflows",
  "/executions": "Executions",
  "/credentials": "Credentials",
  "/approvals": "Approvals",
  "/settings": "Settings",
};

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const title = Object.entries(titles).find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] ?? "Workflow editor";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-zinc-950/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
        <div className="flex min-w-0 items-center gap-2 text-sm"><span className="hidden text-zinc-600 sm:inline">Workspace</span><span className="hidden text-zinc-700 sm:inline">/</span><span className="truncate font-medium text-zinc-200">{title}</span></div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <button type="button" className="hidden items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-500 hover:border-white/20 hover:text-zinc-300 md:flex" aria-label="Search"><Search className="h-3.5 w-3.5" /> Search <span className="ml-4 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-600">⌘K</span></button>
        <button type="button" className="relative rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-zinc-200" aria-label="Notifications"><Bell className="h-4 w-4" /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-violet-400" /></button>
        <div className="relative">
          <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-white/5" aria-expanded={profileOpen}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 text-xs font-semibold text-white">VS</span>
            <span className="hidden text-left sm:block"><span className="block text-xs font-medium text-zinc-200">Victor Silva</span><span className="block text-[10px] text-zinc-600">Admin</span></span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-zinc-600 sm:block" />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 top-12 w-52 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl shadow-black/40">
              <div className="border-b border-white/10 px-3 py-2.5"><p className="text-xs font-medium text-zinc-200">victor@northstar.dev</p><p className="mt-0.5 text-[10px] text-zinc-600">Northstar Labs</p></div>
              <Link href="/settings" onClick={() => setProfileOpen(false)} className={cn("mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white")}><UserRound className="h-3.5 w-3.5" /> Account settings</Link>
              <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"><span className="h-3.5 w-3.5" /> Sign out</Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
