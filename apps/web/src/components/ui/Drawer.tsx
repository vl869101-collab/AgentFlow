"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  position?: "right" | "bottom" | "left";
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
  footer?: ReactNode;
}

const positionVariants = {
  right: {
    initial: { x: "100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "100%", opacity: 0 },
    container: "fixed inset-y-0 right-0 border-l",
  },
  left: {
    initial: { x: "-100%", opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: "-100%", opacity: 0 },
    container: "fixed inset-y-0 left-0 border-r",
  },
  bottom: {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
    container: "fixed inset-x-0 bottom-0 border-t max-h-[85vh]",
  },
};

const sizeClasses = {
  right: {
    sm: "w-72 md:w-80",
    md: "w-80 md:w-96",
    lg: "w-96 md:w-[480px]",
    xl: "w-full md:max-w-2xl",
    full: "w-screen",
  },
  left: {
    sm: "w-72 md:w-80",
    md: "w-80 md:w-96",
    lg: "w-96 md:w-[480px]",
    xl: "w-full md:max-w-2xl",
    full: "w-screen",
  },
  bottom: {
    sm: "h-64",
    md: "h-80",
    lg: "h-96",
    xl: "h-[600px]",
    full: "h-full",
  },
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  position = "right",
  size = "md",
  className,
  footer,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  const currentVariant = positionVariants[position];
  const sizeClass = sizeClasses[position][size];

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div
            role="presentation"
            aria-hidden="true"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />

          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={currentVariant.initial}
            animate={currentVariant.animate}
            exit={currentVariant.exit}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "z-50 flex flex-col bg-zinc-950/95 backdrop-blur-xl border-white/10 shadow-2xl shadow-black/80 outline-none",
              currentVariant.container,
              sizeClass,
              className,
            )}
          >
            {title ? (
              <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-zinc-50">{title}</h2>
                  {description ? (
                    <p className="mt-0.5 text-xs text-zinc-400">{description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Fechar painel"
                  title="Fechar (Esc)"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>

            {footer ? (
              <div className="border-t border-white/10 p-4 bg-zinc-900/50 shrink-0">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
