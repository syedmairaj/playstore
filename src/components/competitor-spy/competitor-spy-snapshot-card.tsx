"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { RankDisplay } from "@/components/keywords/rank-display";
import { CompetitorSpyOpenPlayButton } from "@/components/competitor-spy/competitor-spy-open-play-button";
import { KeywordSurfacesInline } from "@/components/competitor-spy/keyword-surfaces-inline";
import type { RankDisplayLabels } from "@/lib/keywords/format-rank-display";
import { cn } from "@/lib/utils";

const STICKY_TOP_CLASS = "top-24";
const STICKY_TOP_PX = 96;
const STICKY_BOTTOM_PAD_PX = 24;

function useSnapshotStickyEnabled(measureRef: React.RefObject<HTMLDivElement | null>) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const check = () => {
      const h = el.getBoundingClientRect().height;
      setEnabled(window.innerHeight >= h + STICKY_TOP_PX + STICKY_BOTTOM_PAD_PX + 16);
    };

    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    check();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [measureRef]);

  return enabled;
}

export type CompetitorSpySnapshotCardProps = {
  isRtl: boolean;
  workspaceAppName: string;
  competitorDisplayName: string;
  displayName: string;
  categoryLabel: string;
  packageId: string;
  bestRank: number | null;
  metricsKeywordCount: number;
  liveTitle?: string | null;
  rankLabels: RankDisplayLabels;
  workspaceId: string;
  appId?: string;
  onManageCompetitors: () => void;
  manageCompetitorsLabel: string;
  keywordSurfaces?: string[];  // ← NEW: Actual keyword list
};

export function CompetitorSpySnapshotCard({
  isRtl,
  workspaceAppName,
  competitorDisplayName,
  displayName,
  categoryLabel,
  packageId,
  bestRank,
  metricsKeywordCount,
  liveTitle,
  rankLabels,
  workspaceId,
  appId,
  onManageCompetitors,
  manageCompetitorsLabel,
  keywordSurfaces = [],  // ← NEW: Default to empty array
}: CompetitorSpySnapshotCardProps) {
  const t = useTranslations("competitorSpy.snapshot");
  const locale = useLocale();
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const stickyEnabled = useSnapshotStickyEnabled(measureRef);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      setIsStuck(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayName, packageId]);

  const title = (liveTitle?.trim() || displayName).trim() || t("emptyTitle");

  return (
    <aside
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "relative flex min-h-0 w-full min-w-0 flex-col lg:h-full lg:max-w-none",
        isRtl && "font-arabic",
      )}
    >
      <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />

      <div
        className={cn(
          "z-10 w-full min-w-0 lg:self-start",
          stickyEnabled && cn("sticky", STICKY_TOP_CLASS),
        )}
      >
        <div ref={measureRef} className="w-full">
          <div
            className={cn(
              "overflow-visible rounded-2xl border bg-gradient-to-b from-[#0c121a] to-[#080c12] transition-[box-shadow,border-color,ring-color] duration-300",
              "border-white/[0.08] ring-1 ring-white/[0.04]",
              isStuck
                ? "shadow-[0_8px_40px_-12px_rgba(52,168,83,0.32),0_12px_36px_-18px_rgba(0,0,0,0.45)] ring-emerald-500/25"
                : "shadow-[0_8px_28px_-16px_rgba(0,0,0,0.42)]",
            )}
          >
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t("kicker")}
              </p>
              <p className="mt-2 text-sm font-medium text-emerald-100/90">
                {t("versusHeadline", {
                  you: workspaceAppName,
                  them: competitorDisplayName,
                })}
              </p>
              <div
                className={cn(
                  "mt-4 flex gap-4",
                  isRtl ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-lg font-semibold text-emerald-200"
                  aria-hidden
                >
                  {title.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-start">
                  <p className="truncate text-base font-semibold text-white">{title}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {categoryLabel || t("categoryFallback")}
                  </p>
                  <p className="truncate font-mono text-[11px] text-zinc-500" title={packageId}>
                    {packageId}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 w-full border-white/[0.12] bg-[#070a0f] text-zinc-200 hover:bg-white/[0.04]"
                onClick={onManageCompetitors}
              >
                {manageCompetitorsLabel}
              </Button>
            </div>

            <div className="space-y-4 px-5 py-4 sm:px-6">
              {/* Rank Metric */}
              <div className="rounded-xl border border-white/[0.06] bg-[#070a0f] px-3 py-2.5 text-start">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {t("bestRank")}
                </dt>
                <dd className="mt-1 text-base font-semibold text-emerald-200/95">
                  <RankDisplay
                    rank={bestRank}
                    labels={rankLabels}
                    context={{ column: "theirs" }}
                    emphasize
                  />
                </dd>
              </div>

              {/* Inline Expandable Keyword Container - Fetches keywords from staging vault */}
              <div className="rounded-xl border border-white/[0.06] bg-[#070a0f] p-3 text-start">
                <KeywordSurfacesInline
                  keywords={keywordSurfaces || []}
                  count={metricsKeywordCount}
                  isRtl={isRtl}
                  competitorPackageId={packageId}
                  workspaceId={workspaceId}
                  language={isRtl ? "ar" : "en"}
                />
              </div>

              {/* Action — curate keywords via selection bar; no auto-dump to optimizer */}
              <div className="flex flex-col gap-2">
                <CompetitorSpyOpenPlayButton
                  packageId={packageId}
                  isRtl={isRtl}
                  variant="outline"
                  className="w-full border-emerald-500/35 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                />
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {t("curateHint")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
