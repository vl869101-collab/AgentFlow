"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  count?: number | string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  className,
  ariaLabel = "Abas de navegação",
}: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? items[0]?.id ?? "");
  const active = value ?? internalValue;

  const setActive = (next: string, disabled?: boolean) => {
    if (disabled) return;
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  };

  return (
    <div
      className={cn("flex items-center gap-1 border-b border-white/10 overflow-x-auto", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-controls={`tabpanel-${item.id}`}
            aria-selected={selected}
            disabled={item.disabled}
            onClick={() => setActive(item.id, item.disabled)}
            className={cn(
              "relative inline-flex items-center gap-2 px-3 py-3 text-sm font-medium transition-all duration-150 whitespace-nowrap select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-t-md",
              selected
                ? "text-zinc-50 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]",
              item.disabled && "cursor-not-allowed opacity-40 hover:text-zinc-400 hover:bg-transparent",
            )}
          >
            {item.icon ? (
              <span className="shrink-0 text-current" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-mono",
                  selected
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    : "bg-white/5 text-zinc-400 border border-white/5",
                )}
              >
                {item.count}
              </span>
            ) : null}
            {selected ? (
              <motion.span
                layoutId="active-tab"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
