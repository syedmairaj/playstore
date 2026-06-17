"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type StagedSignalBadgeProps = {
  isRtl?: boolean;
  className?: string;
};

/** Unified "Staged" pill — consistent across all Active Context pillars. */
export function StagedSignalBadge({ isRtl = false, className }: StagedSignalBadgeProps) {
  const t = useTranslations("optimizer.activeContext");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-emerald-500/35 bg-emerald-500/15",
        "px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300",
        isRtl && "font-arabic",
        className,
      )}
    >
      {t("stagedBadge")}
    </span>
  );
}

export const ACTIVE_CONTEXT_STAGED_ROW_CLASS =
  "border border-emerald-500/30 bg-emerald-500/[0.06] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)]";

export const ACTIVE_CONTEXT_JUST_STAGED_ROW_CLASS =
  "ring-2 ring-emerald-400/45 ring-offset-1 ring-offset-[#0a0e14] motion-safe:animate-pulse";
