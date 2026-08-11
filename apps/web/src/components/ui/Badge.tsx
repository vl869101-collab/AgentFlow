import { cn } from "@/lib/utils";

export type BadgeStatus = "success" | "warning" | "error" | "info" | "neutral";

const statusClasses: Record<BadgeStatus, string> = {
  success: "bg-green-500/10 text-green-400 border border-green-500/20",
  warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  error: "bg-red-500/10 text-red-400 border border-red-500/20",
  info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  neutral: "bg-zinc-800 text-zinc-400 border border-white/10",
};

export function Badge({ status = "neutral", children, className }: { status?: BadgeStatus; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", statusClasses[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "success" ? "bg-green-500" : status === "warning" ? "bg-amber-500" : status === "error" ? "bg-red-500" : status === "info" ? "bg-blue-500" : "bg-zinc-500")} />
      {children}
    </span>
  );
}
