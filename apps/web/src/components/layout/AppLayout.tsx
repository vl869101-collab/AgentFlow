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
      {/* Skip to Main Content Link for A11y / Screen Readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
      >
        Skip to main content
      </a>

      <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950 px-3 lg:hidden" aria-label="Mobile Navigation Header">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-zinc-200">AgentFlow</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-[10px] font-semibold text-white" aria-hidden="true">
            VS
          </span>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={cn("flex-1 focus:outline-none", fullWidth ? "min-h-0" : "p-6")}
          aria-label="Main content"
        >
          {fullWidth ? children : <div className="mx-auto w-full max-w-[1400px]">{children}</div>}
        </main>
      </div>
    </div>
  );
}
