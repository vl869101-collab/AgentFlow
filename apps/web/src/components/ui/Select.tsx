import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? props.name ?? generatedId;
  return (
    <div className="space-y-2">
      {label ? <label htmlFor={selectId} className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</label> : null}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn("w-full appearance-none bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent", className)}
          {...props}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      </div>
    </div>
  );
});
