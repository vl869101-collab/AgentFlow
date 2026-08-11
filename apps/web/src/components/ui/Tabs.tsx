"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export function Tabs({ items, value, defaultValue, onChange, className }: { items: TabItem[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; className?: string }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? items[0]?.id ?? "");
  const active = value ?? internalValue;
  const setActive = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  };

  return (
    <div className={cn("flex items-center gap-1 border-b border-white/10", className)} role="tablist">
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setActive(item.id)}
            className={cn("relative inline-flex items-center gap-2 px-3 py-3 text-sm transition-all duration-200", selected ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300")}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500">{item.count}</span> : null}
            {selected ? <motion.span layoutId="active-tab" className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" /> : null}
          </button>
        );
      })}
    </div>
  );
}
