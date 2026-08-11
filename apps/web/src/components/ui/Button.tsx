"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "./LoadingSpinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-medium rounded-lg px-4 py-2 hover:opacity-90 transition-opacity",
  secondary: "bg-zinc-800 border border-white/10 text-zinc-300 rounded-lg",
  ghost: "text-zinc-400 hover:text-white hover:bg-white/5",
  danger: "bg-red-500/10 text-red-400 border border-red-500/20",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", loading = false, disabled, size = "md", children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          variant === "secondary" && sizes[size],
          variant === "ghost" && "rounded-lg",
          variant === "danger" && "rounded-lg",
          variant !== "secondary" && variant !== "ghost" && variant !== "danger" && sizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <LoadingSpinner size="sm" /> : null}
        {children}
      </button>
    );
  },
);
