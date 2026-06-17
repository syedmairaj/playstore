"use client";

import { ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type {
  CompetitorThreatSignal,
  GrowthKeywordSignal,
  MarketIntelligenceReport,
} from "@/lib/market/market-intel-signal-types";

export type MarketIntelCurationState = {
  selectedGrowth: Set<string>;
  selectedThreats: Set<string>;
  staged: Set<string>;
  onToggleGrowth: (key: string) => void;
  onToggleThreat: (key: string) => void;
  growthKey: (signal: GrowthKeywordSignal) => string;
  threatKey: (signal: CompetitorThreatSignal) => string;
};

type Props = {
  report: MarketIntelligenceReport | null;
  loading?: boolean;
  isRtl?: boolean;
  curation?: MarketIntelCurationState;
};

function SpotlightSkeleton({ isRtl }: { isRtl: boolean }) {
  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
        {[88, 72, 104, 80, 96, 64].map((w, i) => (
          <span
            key={i}
            className="inline-block h-[26px] animate-pulse rounded-lg bg-white/[0.06]"
            style={{ width: w }}
            aria-hidden
          />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.05]" />
        <div className={cn("h-3 w-4/5 animate-pulse rounded-full bg-white/[0.04]", isRtl && "ms-auto")} />
      </div>
    </div>
  );
}

function PriorityMeta({
  signal,
  isRtl,
}: {
  signal: { searchVolumeScore: number; conversionImpactScore: number; priorityScore: number };
  isRtl: boolean;
}) {
  const t = useTranslations("market.spotlight");

  return (
    <span
      className={cn(
        "mt-0.5 block text-[10px] tabular-nums text-zinc-500",
        isRtl && "text-end font-arabic",
      )}
    >
      {t("priorityMeta", {
        volume: signal.searchVolumeScore,
        cvr: signal.conversionImpactScore,
        priority: signal.priorityScore,
      })}
    </span>
  );
}

function StagedBadge({ isRtl }: { isRtl: boolean }) {
  const t = useTranslations("market.spotlight");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300",
        isRtl ? "me-1.5 font-arabic" : "ms-1.5",
      )}
    >
      {t("stagedBadge")}
    </span>
  );
}

export function KeywordSpotlightCard({
  report,
  loading = false,
  isRtl = false,
  curation,
}: Props) {
  const t = useTranslations("market.spotlight");

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="rounded-2xl border border-zinc-800 bg-white/[0.03] p-5 ring-1 ring-white/[0.04] transition-[border-color] duration-200 hover:border-zinc-700/80"
    >
      <div className={cn("mb-4 flex items-center gap-2.5", isRtl && "flex-row-reverse")}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
          <Sparkles className="size-3.5 text-emerald-400" aria-hidden />
        </div>
        <div className={isRtl ? "text-right font-arabic" : ""}>
          <h3 className="text-sm font-semibold text-white/95">{t("title")}</h3>
          <p className="text-[11px] text-zinc-500">{t("subtitle")}</p>
        </div>
      </div>

      {loading || !report ? (
        <SpotlightSkeleton isRtl={isRtl} />
      ) : (
        <div className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          {/* Growth Keywords */}
          <section>
            <div className={cn("mb-2 flex items-center gap-2", isRtl && "flex-row-reverse")}>
              <TrendingUp className="size-3.5 text-emerald-400" aria-hidden />
              <p
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider text-zinc-500",
                  isRtl && "font-arabic normal-case",
                )}
              >
                {t("growthKeywords")}
              </p>
            </div>
            <div className="space-y-2">
              {report.growthKeywords.length === 0 ? (
                <p className={cn("text-xs text-zinc-500", isRtl && "text-end font-arabic")}>
                  {t("emptyGrowth")}
                </p>
              ) : (
                report.growthKeywords.map((signal) => {
                  const key = curation?.growthKey(signal) ?? signal.id;
                  const isStaged = curation?.staged.has(key) ?? false;
                  const isSelected = curation?.selectedGrowth.has(key) ?? false;
                  const interactive = Boolean(curation) && !isStaged;

                  const rowClass = cn(
                    "rounded-xl border px-3 py-2 transition-colors",
                    isStaged
                      ? "border-emerald-500/35 bg-emerald-500/[0.08]"
                      : interactive && isSelected
                        ? "border-sky-500/45 bg-sky-500/10 ring-1 ring-sky-400/30 cursor-pointer"
                        : "border-zinc-800/80 bg-zinc-900/40 cursor-pointer hover:border-zinc-700",
                  );

                  const inner = (
                    <div className={cn("flex items-start justify-between gap-2", isRtl && "flex-row-reverse")}>
                      <div className={isRtl ? "text-end font-arabic" : ""}>
                        <p className="text-sm font-medium text-white/90">{signal.term}</p>
                        <PriorityMeta signal={signal} isRtl={isRtl} />
                      </div>
                      {isStaged ? <StagedBadge isRtl={isRtl} /> : null}
                    </div>
                  );

                  if (interactive) {
                    return (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => curation?.onToggleGrowth(key)}
                        aria-pressed={isSelected}
                        className={cn("w-full text-start", rowClass, isRtl && "text-end")}
                      >
                        {inner}
                      </button>
                    );
                  }

                  return (
                    <div key={signal.id} className={rowClass}>
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Competitor Threats */}
          <section>
            <div className={cn("mb-2 flex items-center gap-2", isRtl && "flex-row-reverse")}>
              <ShieldAlert className="size-3.5 text-orange-400" aria-hidden />
              <p
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider text-zinc-500",
                  isRtl && "font-arabic normal-case",
                )}
              >
                {t("competitorThreats")}
              </p>
            </div>
            <div className="space-y-2">
              {report.competitorThreats.length === 0 ? (
                <p className={cn("text-xs text-zinc-500", isRtl && "text-end font-arabic")}>
                  {t("emptyThreats")}
                </p>
              ) : (
                report.competitorThreats.map((signal) => {
                  const key = curation?.threatKey(signal) ?? signal.id;
                  const isStaged = curation?.staged.has(key) ?? false;
                  const isSelected = curation?.selectedThreats.has(key) ?? false;
                  const interactive = Boolean(curation) && !isStaged;

                  const rowClass = cn(
                    "rounded-xl border px-3 py-2 transition-colors",
                    isStaged
                      ? "border-emerald-500/35 bg-emerald-500/[0.08]"
                      : interactive && isSelected
                        ? "border-orange-500/40 bg-orange-500/10 ring-1 ring-orange-400/25 cursor-pointer"
                        : "border-zinc-800/80 bg-zinc-900/40 cursor-pointer hover:border-zinc-700",
                  );

                  const inner = (
                    <div className={cn("space-y-1", isRtl && "text-end font-arabic")}>
                      <div className={cn("flex items-start justify-between gap-2", isRtl && "flex-row-reverse")}>
                        <p className="text-sm font-medium text-white/90">{signal.term}</p>
                        {isStaged ? <StagedBadge isRtl={isRtl} /> : null}
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {t("threatSource", {
                          app: signal.competitorTitle,
                          rank: signal.chartRank ?? "—",
                        })}
                      </p>
                      <PriorityMeta signal={signal} isRtl={isRtl} />
                    </div>
                  );

                  if (interactive) {
                    return (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => curation?.onToggleThreat(key)}
                        aria-pressed={isSelected}
                        className={cn("w-full text-start", rowClass, isRtl && "text-end")}
                      >
                        {inner}
                      </button>
                    );
                  }

                  return (
                    <div key={signal.id} className={rowClass}>
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
