import { cn } from "@/lib/utils";

export function LoadingSpinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return <span aria-label="Loading" role="status" className={cn("inline-block animate-spin rounded-full border-2 border-white/20 border-t-violet-400", size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-8 w-8" : "h-5 w-5", className)} />;
}
