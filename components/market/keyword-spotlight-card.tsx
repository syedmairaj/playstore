"use client";

import { Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KeywordSpotlightResult } from "@/app/api/market/keyword-spotlight/route";

type Props = {
  spotlight: KeywordSpotlightResult | null;
  loading?: boolean;
  isRtl?: boolean;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SpotlightSkeleton({ isRtl }: { isRtl: boolean }) {
  return (
    <div className="space-y-4">
      {/* Keyword chips skeleton */}
      <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
        {[88, 72, 104, 80, 96, 64, 112, 76].map((w, i) => (
          <span
            key={i}
            className="inline-block h-[26px] animate-pulse rounded-lg bg-white/[0.06]"
            style={{ width: w }}
            aria-hidden
          />
        ))}
      </div>
      {/* Narrative skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.05]" />
        <div className={cn("h-3 w-4/5 animate-pulse rounded-full bg-white/[0.04]", isRtl && "ms-auto")} />
      </div>
      {/* Tip skeleton */}
      <div className="h-12 w-full animate-pulse rounded-xl bg-white/[0.04]" />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KeywordSpotlightCard({ spotlight, loading = false, isRtl = false }: Props) {
  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="rounded-2xl border border-zinc-800 bg-white/[0.03] p-5 ring-1 ring-white/[0.04] transition-[border-color] duration-200 hover:border-zinc-700/80"
    >
      {/* Header */}
      <div className={cn("mb-4 flex items-center gap-2.5", isRtl && "flex-row-reverse")}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
          <Sparkles className="size-3.5 text-emerald-400" aria-hidden />
        </div>
        <div className={isRtl ? "text-right font-arabic" : ""}>
          <h3 className="text-sm font-semibold text-white/95">AI Keyword Spotlight</h3>
          <p className="text-[11px] text-zinc-500">
            {isRtl ? "الكلمات المهيمنة على هذه الفئة الآن" : "What's dominating this category right now"}
          </p>
        </div>
      </div>

      {loading || !spotlight ? (
        <SpotlightSkeleton isRtl={isRtl} />
      ) : (
        <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          {/* Trending keyword chips */}
          <div>
            <p className={cn(
              "mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500",
              isRtl && "text-end font-arabic normal-case",
            )}>
              {isRtl ? "الكلمات المفتاحية الرائجة" : "Trending keywords"}
            </p>
            <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
              {spotlight.trendingKeywords.map((kw, i) => (
                <span
                  key={`${i}-${kw}`}
                  className={cn(
                    "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    i < 3
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700/60 bg-zinc-800/60 text-zinc-300",
                  )}
                >
                  {i < 3 && (
                    <span
                      className={cn(
                        "inline-block size-1.5 rounded-full bg-emerald-400 shrink-0",
                        isRtl ? "ms-1.5" : "me-1.5",
                      )}
                      aria-hidden
                    />
                  )}
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Narrative */}
          <p className={cn(
            "text-sm leading-relaxed text-zinc-400",
            isRtl && "text-end font-arabic",
          )}>
            {spotlight.narrative}
          </p>

          {/* ASO Tip */}
          <div className={cn("flex gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3", isRtl && "flex-row-reverse")}>
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
            <div className={isRtl ? "text-end" : ""}>
              <p className={cn(
                "mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400/80",
                isRtl && "font-arabic normal-case",
              )}>
                {isRtl ? "نصيحة ASO" : "ASO tip"}
              </p>
              <p className={cn(
                "text-xs leading-relaxed text-amber-100/80",
                isRtl && "font-arabic",
              )}>
                {spotlight.asoTip}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
