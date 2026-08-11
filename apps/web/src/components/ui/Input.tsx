import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const helpId = `${inputId}-help`;
  return (
    <div className="space-y-2">
      {label ? (
        <label htmlFor={inputId} className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all duration-200",
          error && "border-red-500/50 focus:ring-red-500",
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? helpId : undefined}
        {...props}
      />
      {error ? <p id={helpId} className="text-xs text-red-400">{error}</p> : hint ? <p id={helpId} className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
});
