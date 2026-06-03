"use client";

import { cn } from "@/lib/utils";

type OptimizerShimmerBarProps = {
  className?: string;
  /** Stagger animation delay in seconds (for long-desc lines). */
  delayS?: number;
};

export function OptimizerShimmerBar({
  className,
  delayS = 0,
}: OptimizerShimmerBarProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg",
        "bg-gradient-to-r from-zinc-900 to-zinc-800",
        "animate-pulse motion-reduce:animate-none",
        className,
      )}
      style={delayS > 0 ? { animationDelay: `${delayS}s` } : undefined}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent bg-[length:200%_100%]" />
    </div>
  );
}
