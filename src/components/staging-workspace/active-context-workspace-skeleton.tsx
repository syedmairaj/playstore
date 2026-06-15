"use client";

import { OptimizerShimmerBar } from "@/components/listing/optimizer/optimizer-shimmer-bar";

type ActiveContextWorkspaceSkeletonProps = {
  isRtl?: boolean;
  /** Include Keyword Tracker panel placeholder (first block in Active Context). */
  showKeywordTracker?: boolean;
};

/**
 * High-fidelity placeholder for Staging Workspace — matches pillar + chip layout
 * to avoid layout shift while queue / vault data hydrates (SWR).
 */
export function ActiveContextWorkspaceSkeleton({
  isRtl = false,
  showKeywordTracker = true,
}: ActiveContextWorkspaceSkeletonProps) {
  const dir = isRtl ? "rtl" : "ltr";

  return (
    <div
      dir={dir}
      className="space-y-6 rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4"
      aria-busy="true"
      aria-label={isRtl ? "جاري تحميل السياق النشط" : "Loading Active Context"}
    >
      <div className={`flex items-start justify-between gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className={`flex-1 space-y-2 ${isRtl ? "text-right" : "text-left"}`}>
          <OptimizerShimmerBar className="h-4 w-36 rounded-md" />
          <OptimizerShimmerBar className="h-3 w-full max-w-md rounded-md opacity-70" />
        </div>
        <OptimizerShimmerBar className="h-14 w-16 shrink-0 rounded-lg" delayS={0.05} />
      </div>

      {showKeywordTracker ? (
        <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <OptimizerShimmerBar className="h-3 w-28 rounded-md" delayS={0.08} />
          <div className="flex flex-wrap gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <OptimizerShimmerBar
                key={i}
                className="h-9 w-24 rounded-lg"
                delayS={0.1 + i * 0.04}
              />
            ))}
          </div>
        </div>
      ) : null}

      {[0, 1, 2].map((pillar) => (
        <div key={pillar} className="space-y-2">
          <div className={`flex items-center gap-2 pb-2 ${isRtl ? "flex-row-reverse" : ""}`}>
            <OptimizerShimmerBar className="size-4 shrink-0 rounded-full" delayS={0.12 + pillar * 0.06} />
            <OptimizerShimmerBar className="h-3 w-32 rounded-md" delayS={0.14 + pillar * 0.06} />
          </div>
          <OptimizerShimmerBar className="h-2 w-48 max-w-full rounded-md opacity-60" delayS={0.16 + pillar * 0.06} />
          <div className="flex min-h-[60px] flex-wrap gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            {[0, 1].map((chip) => (
              <OptimizerShimmerBar
                key={chip}
                className="h-9 w-36 max-w-full rounded-lg"
                delayS={0.18 + pillar * 0.06 + chip * 0.03}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
