"use client";

import { cn } from "@/lib/utils";

type Props = {
  variant: "title" | "short" | "long";
  className?: string;
};

export function OptimizerPreviewTextShimmer({ variant, className }: Props) {
  if (variant === "title") {
    return (
      <div className={cn("space-y-2", className)} aria-hidden>
        <div className="relative h-5 w-[78%] overflow-hidden rounded-md bg-gradient-to-r from-zinc-900 to-zinc-800 animate-pulse motion-reduce:animate-none">
          <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent bg-[length:200%_100%]" />
        </div>
      </div>
    );
  }

  if (variant === "short") {
    return (
      <div className={cn("space-y-2", className)} aria-hidden>
        <div className="relative h-3.5 w-full overflow-hidden rounded-md bg-gradient-to-r from-zinc-900 to-zinc-800 animate-pulse motion-reduce:animate-none">
          <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent bg-[length:200%_100%]" />
        </div>
        <div className="relative h-3.5 w-[92%] overflow-hidden rounded-md bg-gradient-to-r from-zinc-900 to-zinc-800 animate-pulse motion-reduce:animate-none">
          <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent bg-[length:200%_100%]" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-2 space-y-2", className)} aria-hidden>
      {["w-full", "w-[96%]", "w-[88%]", "w-[72%]"].map((w) => (
        <div
          key={w}
          className={cn(
            "relative h-2.5 overflow-hidden rounded-sm bg-gradient-to-r from-zinc-900 to-zinc-800 animate-pulse motion-reduce:animate-none",
            w,
          )}
        >
          <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent bg-[length:200%_100%]" />
        </div>
      ))}
    </div>
  );
}
