"use client";

import { Check, Crosshair, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { OptimizerShimmerBar } from "@/components/listing/optimizer/optimizer-shimmer-bar";
import { RankDisplay } from "@/components/keywords/rank-display";
import type { RankDisplayLabels } from "@/lib/keywords/format-rank-display";
import { cn } from "@/lib/utils";

const GAP_ANALYZING_PLACEHOLDER_ROWS = 4;

export type CompetitorSpyGapRow = {
  keyword: string;
  opportunity: "high" | "medium";
  yourRank: number | null;
  competitorRank: number | null;
};

export type CompetitorSpyGapEmptyVariant = "noCompetitors" | "noGaps" | "analyzing";

type Props = {
  isRtl: boolean;
  rows: CompetitorSpyGapRow[];
  emptyVariant: CompetitorSpyGapEmptyVariant | null;
  onEmptyCta?: () => void;
  blockingError: boolean;
  keywordTrackerEnabled: boolean;
  hasApps: boolean;
  trackPending: string | null;
  isTracked: (term: string) => boolean;
  onTrack: (term: string) => void;
  rankLabels: RankDisplayLabels;
  workspaceAppLive: boolean;
};

function RankCell({
  rank,
  rankLabels,
  workspaceAppLive,
  dash,
  emphasize,
  column,
}: {
  rank: number | null;
  rankLabels: RankDisplayLabels;
  workspaceAppLive: boolean;
  dash: string;
  emphasize?: boolean;
  column: "yours" | "theirs";
}) {
  return (
    <RankDisplay
      rank={rank}
      labels={rankLabels}
      context={{
        column,
        workspaceAppLive: column === "yours" ? workspaceAppLive : true,
      }}
      emptyFallback={dash}
      emphasize={emphasize}
    />
  );
}

function GapEmptyBlock({
  isRtl,
  title,
  body,
  ctaLabel,
  onCta,
  blockingError,
}: {
  isRtl: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  onCta?: () => void;
  blockingError: boolean;
}) {
  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/[0.1] bg-[#080c12] px-6 py-12 text-center",
        isRtl && "font-arabic",
      )}
    >
      <Crosshair className="size-10 text-emerald-500/40" aria-hidden />
      <GapEmptyCopy title={title} body={body} />
      {onCta ? (
        <Button
          type="button"
          disabled={blockingError}
          onClick={onCta}
          className="border border-emerald-400/30 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}

function GapEmptyCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-md space-y-1.5">
      <p className="text-base font-medium text-zinc-200">{title}</p>
      <p className="text-sm leading-relaxed text-zinc-500">{body}</p>
    </div>
  );
}

function GapAnalyzingPlaceholder({ isRtl }: { isRtl: boolean }) {
  const t = useTranslations("competitorSpy.gap");

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1018] text-zinc-100",
        isRtl && "font-arabic",
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="hidden md:block">
        <div className="border-b border-white/[0.06] bg-[#070a0f] px-5 py-3">
          <div className="flex gap-8">
            <OptimizerShimmerBar className="h-3 w-24" />
            <OptimizerShimmerBar className="h-3 w-20" delayS={0.05} />
            <OptimizerShimmerBar className="h-3 w-16" delayS={0.1} />
            <OptimizerShimmerBar className="ms-auto h-3 w-20" delayS={0.15} />
          </div>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {Array.from({ length: GAP_ANALYZING_PLACEHOLDER_ROWS }, (_, i) => (
            <li key={i} className="flex items-center gap-6 px-5 py-4">
              <OptimizerShimmerBar className="h-4 w-36" delayS={i * 0.08} />
              <OptimizerShimmerBar className="h-6 w-16 rounded-full" delayS={i * 0.08 + 0.04} />
              <OptimizerShimmerBar className="h-4 w-12" delayS={i * 0.08 + 0.08} />
              <OptimizerShimmerBar className="h-4 w-12" delayS={i * 0.08 + 0.12} />
              <OptimizerShimmerBar className="ms-auto h-8 w-28 rounded-lg" delayS={i * 0.08 + 0.16} />
            </li>
          ))}
        </ul>
      </div>
      <ul className="divide-y divide-white/[0.06] md:hidden">
        {Array.from({ length: GAP_ANALYZING_PLACEHOLDER_ROWS }, (_, i) => (
          <li key={i} className="space-y-3 px-4 py-4">
            <OptimizerShimmerBar className="h-4 w-3/4 max-w-[220px]" delayS={i * 0.08} />
            <div className="flex gap-4">
              <OptimizerShimmerBar className="h-3 w-20" delayS={i * 0.08 + 0.05} />
              <OptimizerShimmerBar className="h-3 w-20" delayS={i * 0.08 + 0.1} />
            </div>
            <OptimizerShimmerBar className="h-9 w-full rounded-lg" delayS={i * 0.08 + 0.14} />
          </li>
        ))}
      </ul>
      <p className="border-t border-white/[0.06] px-5 py-4 text-center text-sm text-zinc-400">
        {t("analyzingPlaceholder")}
      </p>
    </div>
  );
}

export function CompetitorSpyKeywordGapTable({
  isRtl,
  rows,
  emptyVariant,
  onEmptyCta,
  blockingError,
  keywordTrackerEnabled,
  hasApps,
  trackPending,
  isTracked,
  onTrack,
  rankLabels,
  workspaceAppLive,
}: Props) {
  const t = useTranslations("competitorSpy.gap");
  const tDash = "—";

  if (rows.length === 0 && emptyVariant === "analyzing") {
    return <GapAnalyzingPlaceholder isRtl={isRtl} />;
  }

  if (rows.length === 0 && emptyVariant) {
    const title =
      emptyVariant === "noCompetitors" ? t("emptyNoCompetitorTitle") : t("emptyNoGapsTitle");
    const body =
      emptyVariant === "noCompetitors" ? t("emptyNoCompetitorBody") : t("emptyNoGapsBody");

    return (
      <GapEmptyBlock
        isRtl={isRtl}
        title={title}
        body={body}
        ctaLabel={t("emptyCta")}
        onCta={onEmptyCta}
        blockingError={blockingError}
      />
    );
  }

  if (rows.length === 0) {
    return <GapAnalyzingPlaceholder isRtl={isRtl} />;
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1018] text-zinc-100",
        isRtl && "font-arabic",
      )}
    >
      <div className="hidden md:block">
        <div className="max-h-[min(520px,70vh)] overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-[1] border-b border-white/[0.06] bg-[#070a0f] text-xs text-zinc-500 backdrop-blur-sm">
              <tr>
                <th className="px-5 py-3 text-start font-medium">{t("columns.keyword")}</th>
                <th className="px-5 py-3 text-start font-medium">{t("columns.opportunity")}</th>
                <th className="px-5 py-3 text-start font-medium">{t("columns.yourRank")}</th>
                <th className="px-5 py-3 text-start font-medium">{t("columns.theirRank")}</th>
                <th className="px-5 py-3 text-end font-medium">{t("columns.action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.keyword}
                  className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3.5 font-medium text-zinc-100">{row.keyword}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        row.opportunity === "high"
                          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                          : "border-amber-400/30 bg-amber-500/10 text-amber-100/90",
                      )}
                    >
                      {row.opportunity === "high" ? t("opportunityHigh") : t("opportunityMedium")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-zinc-300">
                    <RankCell
                      rank={row.yourRank}
                      rankLabels={rankLabels}
                      workspaceAppLive={workspaceAppLive}
                      dash={tDash}
                      column="yours"
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <RankCell
                      rank={row.competitorRank}
                      rankLabels={rankLabels}
                      workspaceAppLive={workspaceAppLive}
                      dash={tDash}
                      emphasize
                      column="theirs"
                    />
                  </td>
                  <td className="px-5 py-3.5 text-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        trackPending === row.keyword.trim().toLowerCase() ||
                        blockingError ||
                        isTracked(row.keyword) ||
                        (keywordTrackerEnabled && !hasApps)
                      }
                      onClick={() => onTrack(row.keyword)}
                      className={cn(
                        "disabled:opacity-40",
                        isTracked(row.keyword)
                          ? "border border-emerald-500/45 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-950/50"
                          : "border border-emerald-400/30 bg-emerald-600 text-white hover:bg-emerald-500",
                      )}
                    >
                      {trackPending === row.keyword.trim().toLowerCase() ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          {t("tracking")}
                        </span>
                      ) : isTracked(row.keyword) ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="size-3.5 shrink-0" aria-hidden />
                          {t("tracked")}
                        </span>
                      ) : (
                        t("track")
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="divide-y divide-white/[0.06] md:hidden">
        {rows.map((row) => (
          <li key={row.keyword} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-zinc-100">{row.keyword}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  row.opportunity === "high"
                    ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-100/90",
                )}
              >
                {row.opportunity === "high" ? t("opportunityHigh") : t("opportunityMedium")}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1">
                {t("columns.yourRank")}:{" "}
                <RankCell
                  rank={row.yourRank}
                  rankLabels={rankLabels}
                  workspaceAppLive={workspaceAppLive}
                  dash={tDash}
                  column="yours"
                />
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-300/90">
                {t("columns.theirRank")}:{" "}
                <RankCell
                  rank={row.competitorRank}
                  rankLabels={rankLabels}
                  workspaceAppLive={workspaceAppLive}
                  dash={tDash}
                  emphasize
                  column="theirs"
                />
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              className={cn(
                "w-full disabled:opacity-40",
                isTracked(row.keyword)
                  ? "border border-emerald-500/45 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-950/50"
                  : "border border-emerald-400/30 bg-emerald-600 text-white hover:bg-emerald-500",
              )}
              disabled={
                trackPending === row.keyword.trim().toLowerCase() ||
                blockingError ||
                isTracked(row.keyword) ||
                (keywordTrackerEnabled && !hasApps)
              }
              onClick={() => onTrack(row.keyword)}
            >
              {trackPending === row.keyword.trim().toLowerCase() ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t("tracking")}
                </span>
              ) : isTracked(row.keyword) ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Check className="size-3.5 shrink-0" aria-hidden />
                  {t("tracked")}
                </span>
              ) : (
                t("track")
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
