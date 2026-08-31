"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, leftIcon, rightIcon, disabled, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const helpId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full space-y-1.5 text-left">
      {label ? (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium uppercase tracking-wider text-zinc-500"
        >
          {label}
        </label>
      ) : null}
      <div className="relative flex items-center">
        {leftIcon ? (
          <div className="pointer-events-none absolute left-3 flex items-center text-zinc-500" aria-hidden="true">
            {leftIcon}
          </div>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={cn(
            "w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200",
            "focus:border-transparent focus:ring-2 focus:ring-violet-500",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-zinc-950",
            leftIcon && "pl-9",
            rightIcon && "pr-9",
            error && "border-red-500/50 focus:ring-red-500",
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        {rightIcon ? (
          <div className="pointer-events-none absolute right-3 flex items-center text-zinc-500" aria-hidden="true">
            {rightIcon}
          </div>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={helpId} className="text-xs text-zinc-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
});
