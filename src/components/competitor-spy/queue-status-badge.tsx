"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type QueueStatusBadgeProps = {
  selectedCount: number;
  queuedCount: number;
  isRtl?: boolean;
  className?: string;
};

export function QueueStatusBadge({
  selectedCount,
  queuedCount,
  isRtl = false,
  className,
}: QueueStatusBadgeProps) {
  const t = useTranslations("competitorSpy.queueStatus");

  if (selectedCount === 0) return null;

  const allQueued = queuedCount >= selectedCount && selectedCount > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        allQueued
          ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
          : "bg-amber-500/10 text-amber-200 ring-amber-500/25",
        isRtl && "font-arabic",
        className,
      )}
      role="status"
    >
      {allQueued
        ? t("allQueued", { count: queuedCount })
        : t("partialQueued", { queued: queuedCount, selected: selectedCount })}
    </span>
  );
}
