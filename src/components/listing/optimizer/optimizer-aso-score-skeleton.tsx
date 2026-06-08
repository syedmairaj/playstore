"use client";

import { OptimizerShimmerBar } from "@/components/listing/optimizer/optimizer-shimmer-bar";
import { cn } from "@/lib/utils";

type Props = {
  isRtl?: boolean;
};

export function OptimizerAsoScoreSkeleton({ isRtl = false }: Props) {
  return (
    <article
      className="relative w-full overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-900/50 p-6 sm:p-9"
      aria-hidden
    >
      <div
        className={cn(
          "mb-8 flex flex-wrap items-center justify-between gap-3",
          isRtl && "flex-row-reverse",
        )}
      >
        <OptimizerShimmerBar className="h-3 w-36 rounded-md" />
        <OptimizerShimmerBar className="h-7 w-28 rounded-full" />
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-10">
        <div className="flex flex-col items-center">
          <div className="relative flex size-36 items-center justify-center sm:size-40">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-900 to-zinc-800 animate-pulse motion-reduce:animate-none" />
            <div className="absolute inset-2 rounded-full border border-zinc-700/60 bg-zinc-900/80" />
            <div className="pointer-events-none absolute inset-0 rounded-full animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent bg-[length:200%_100%]" />
            <OptimizerShimmerBar className="h-10 w-16 rounded-lg opacity-80" />
          </div>
          <OptimizerShimmerBar className="mt-4 h-2.5 w-32 rounded-md" />
        </div>

        <div className="w-full min-w-0 flex-1 space-y-4">
          <OptimizerShimmerBar className="h-3.5 w-40 rounded-md" />
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <OptimizerShimmerBar
                  className="h-2.5 w-full max-w-[8rem] rounded-md"
                  delayS={i * 0.06}
                />
                <OptimizerShimmerBar
                  className="h-1.5 w-full rounded-full"
                  delayS={i * 0.06 + 0.03}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
