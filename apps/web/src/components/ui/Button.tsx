"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "./LoadingSpinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  isLoading?: boolean; // Brand Voice / Design System alias compatibility
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-medium shadow-md shadow-violet-500/20 hover:opacity-90 active:scale-[0.98]",
  secondary:
    "bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-750 hover:text-white hover:border-white/20 active:scale-[0.98]",
  ghost:
    "text-zinc-400 hover:text-white hover:bg-white/5 active:bg-white/10 active:scale-[0.98]",
  danger:
    "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-5 py-2.5 text-sm rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      isLoading,
      disabled,
      children,
      leftIcon,
      rightIcon,
      type = "button",
      ...props
    },
    ref,
  ) {
    const isSpinnerActive = isLoading ?? loading;
    const isDisabled = disabled || isSpinnerActive;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 cursor-pointer select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
          variants[variant],
          sizes[size],
          className,
        )}
        disabled={isDisabled}
        aria-busy={isSpinnerActive}
        {...props}
      >
        {isSpinnerActive ? (
          <LoadingSpinner size={size === "lg" ? "md" : "sm"} className="shrink-0" />
        ) : leftIcon ? (
          <span className="shrink-0" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        {children}
        {!isSpinnerActive && rightIcon ? (
          <span className="shrink-0" aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </button>
    );
  },
);
