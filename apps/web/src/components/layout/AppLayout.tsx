"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

export function AppLayout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950 px-3 lg:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded p-2 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
          <span className="text-sm font-semibold text-zinc-200">AgentFlow</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-[10px] font-semibold text-white">VS</span>
        </div>
        <main className={cn("flex-1", fullWidth ? "min-h-0" : "p-6")}>{fullWidth ? children : <div className="mx-auto w-full max-w-[1400px]">{children}</div>}</main>
      </div>
    </div>
  );
}
