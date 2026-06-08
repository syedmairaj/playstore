"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { OptimizerActiveAuditorStatus } from "@/components/listing/optimizer/optimizer-active-auditor-status";
import { OptimizerAsoScoreSkeleton } from "@/components/listing/optimizer/optimizer-aso-score-skeleton";
import { OptimizerShimmerBar } from "@/components/listing/optimizer/optimizer-shimmer-bar";
import { cn } from "@/lib/utils";

const LONG_LINE_WIDTHS = ["w-full", "w-[94%]", "w-[88%]", "w-[96%]", "w-[72%]", "w-[58%]"] as const;

type Props = {
  isRtl?: boolean;
};

function SkeletonCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-zinc-800/75",
        "bg-gradient-to-b from-zinc-900/95 to-zinc-800/40 p-5 sm:p-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.03] to-transparent bg-[length:200%_100%]" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function OptimizerListingSkeleton({ isRtl = false }: Props) {
  const t = useTranslations("optimizer");

  return (
    <motion.div
      dir={isRtl ? "rtl" : "ltr"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-8"
      aria-busy="true"
      aria-live="polite"
    >
      <OptimizerActiveAuditorStatus isRtl={isRtl} />

      <OptimizerAsoScoreSkeleton isRtl={isRtl} />

      <div className="space-y-5" aria-hidden>
        {/* Card 1 — Title */}
        <SkeletonCard>
          <OptimizerShimmerBar className="mb-4 h-2.5 w-20 rounded-md opacity-70" />
          <OptimizerShimmerBar className="h-9 w-full max-w-xl rounded-xl sm:h-10" />
        </SkeletonCard>

        {/* Card 2 — Short description */}
        <SkeletonCard>
          <OptimizerShimmerBar className="mb-4 h-2.5 w-28 rounded-md opacity-70" />
          <div className="space-y-3">
            <OptimizerShimmerBar className="h-4 w-full max-w-lg rounded-lg" delayS={0.05} />
            <OptimizerShimmerBar className="h-4 w-[88%] max-w-md rounded-lg" delayS={0.1} />
          </div>
        </SkeletonCard>

        {/* Card 3 — Long description */}
        <SkeletonCard className="min-h-[12rem] sm:min-h-[14rem]">
          <OptimizerShimmerBar className="mb-5 h-2.5 w-32 rounded-md opacity-70" />
          <div className="space-y-2.5">
            {LONG_LINE_WIDTHS.map((width, i) => (
              <OptimizerShimmerBar
                key={width}
                className={cn("h-3 rounded-md", width)}
                delayS={0.04 * i}
              />
            ))}
          </div>
        </SkeletonCard>
      </div>

      <p className="sr-only">{t("results.generatingPreview")}</p>
    </motion.div>
  );
}
