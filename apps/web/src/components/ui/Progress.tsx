import { cn } from "@/lib/utils";

export function Progress({ value, label, helper, className }: { value: number; label?: string; helper?: string; className?: string }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("space-y-2", className)}>
      {label || helper ? <div className="flex items-center justify-between gap-4 text-xs"><span className="text-zinc-400">{label}</span><span className="text-zinc-500">{helper ?? `${Math.round(safeValue)}%`}</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
