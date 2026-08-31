import { cn } from "@/lib/utils";

export type BadgeStatus = "success" | "warning" | "error" | "info" | "neutral" | "ai";

export interface BadgeProps {
  status?: BadgeStatus;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const statusClasses: Record<BadgeStatus, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  error: "bg-red-500/10 text-red-400 border border-red-500/20",
  info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  ai: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  neutral: "bg-zinc-800/80 text-zinc-300 border border-white/10",
};

const dotClasses: Record<BadgeStatus, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-red-400",
  info: "bg-blue-400",
  ai: "bg-purple-400",
  neutral: "bg-zinc-400",
};

export function Badge({
  status = "neutral",
  children,
  className,
  dot = true,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm select-none",
        statusClasses[status],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[status])}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
