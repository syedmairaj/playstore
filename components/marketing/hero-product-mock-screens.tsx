"use client";

import { ArrowRight, Check, Circle, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

/** High-fidelity static “screenshot” of the workspace ASO score card (dark theme). */
export function HeroMockScreenAso() {
  const t = useTranslations("hero");

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
        <div>
          <p className="text-[11px] font-semibold text-white">{t("screen.aso.title")}</p>
          <p className="text-[9px] text-white/45">{t("screen.aso.hint")}</p>
        </div>
        <span className="rounded-md bg-[#22C55E]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#22C55E]">
          {t("screen.aso.liveBadge")}
        </span>
      </div>

      <div className="flex gap-3">
        <div
          className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-[#22C55E]/40 bg-gradient-to-b from-[#22C55E]/15 to-transparent shadow-inner ring-1 ring-white/[0.06]"
          aria-hidden
        >
          <span className="text-xl font-bold tabular-nums leading-none text-white">
            {t("screen.aso.score")}
          </span>
          <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#22C55E]">
            / 100
          </span>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {[
            { done: true, key: "check1" as const },
            { done: false, key: "check2" as const },
            { done: false, key: "check3" as const },
          ].map((row) => (
            <li
              key={row.key}
              className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5"
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {row.done ? (
                  <Check className="h-3 w-3 text-[#22C55E]" strokeWidth={2.5} />
                ) : (
                  <Circle className="h-3 w-3 text-white/25" strokeWidth={2} />
                )}
              </span>
              <span className="text-[10px] leading-snug text-white/75">
                {t(`screen.aso.${row.key}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Before / after listing optimization — mirrors the optimizer’s value in one glance. */
export function HeroMockScreenAi() {
  const t = useTranslations("hero");

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-white">{t("screen.ai.title")}</p>
        <span className="rounded-md border border-[#22C55E]/30 bg-[#22C55E]/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#22C55E]">
          {t("screen.ai.badge")}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5">
        <div className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-white/40">
            {t("screen.ai.beforeLabel")}
          </p>
          <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-white/75">
            {t("screen.ai.beforeTitle")}
          </p>
          <p className="mt-1 line-clamp-3 text-[9px] leading-snug text-white/45">
            {t("screen.ai.beforeShort")}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center justify-center self-center rounded-full border border-white/[0.08] bg-black/30 px-0.5 py-1"
          aria-hidden
        >
          <ArrowRight className="h-3 w-3 text-white/35 rtl:rotate-180" />
        </div>
        <div className="min-w-0 rounded-xl border border-[#22C55E]/25 bg-[#22C55E]/10 p-2 ring-1 ring-[#22C55E]/10">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-[#22C55E]">
            {t("screen.ai.afterLabel")}
          </p>
          <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-white">
            {t("screen.ai.afterTitle")}
          </p>
          <p className="mt-1 line-clamp-3 text-[9px] leading-snug text-white/70">
            {t("screen.ai.afterShort")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-1.5 text-[9px] font-semibold text-[#22C55E]">
        <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
        <span>{t("screen.ai.uplift")}</span>
      </div>
    </div>
  );
}

/** Keyword tracking table — mirrors dashboard structure. */
export function HeroMockScreenKeywords() {
  const t = useTranslations("hero");

  const rows = [
    { term: "t1", rank: "r1", up: true },
    { term: "t2", rank: "r2", up: true },
    { term: "t3", rank: "r3", up: false },
  ] as const;

  return (
    <div className="space-y-3 pt-1">
      <p className="text-[11px] font-semibold text-white">{t("screen.keywords.title")}</p>

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="grid grid-cols-[1fr_auto_auto] gap-1 border-b border-white/[0.06] bg-black/20 px-2 py-1.5 text-[8px] font-semibold uppercase tracking-wide text-white/45">
          <span>{t("screen.keywords.colTerm")}</span>
          <span className="text-center">{t("screen.keywords.colRank")}</span>
          <span className="text-center">{t("screen.keywords.colTrend")}</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.term}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-1 border-b border-white/[0.04] px-2 py-2 text-[10px] last:border-0"
          >
            <span className="truncate text-white/85">{t(`screen.keywords.${row.term}`)}</span>
            <span
              dir="ltr"
              className="text-center font-mono font-semibold text-[#4285F4]"
            >
              {t(`screen.keywords.${row.rank}`)}
            </span>
            <span className="flex justify-center" aria-hidden>
              <MiniTrend up={row.up} />
            </span>
          </div>
        ))}
      </div>

      <p className="flex items-center justify-center gap-1 text-[9px] font-medium text-[#22C55E]">
        <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
        <span>{t("screen.keywords.footerTrend")}</span>
      </p>
    </div>
  );
}

function MiniTrend({ up }: { up: boolean }) {
  const heights = [40, 65, 55] as const;
  return (
    <span className="flex h-5 items-end justify-center gap-px">
      {heights.map((pct, i) => (
        <span
          key={i}
          className={
            up ? "w-[3px] rounded-sm bg-[#22C55E]/80" : "w-[3px] rounded-sm bg-white/25"
          }
          style={{ height: `${pct}%` }}
        />
      ))}
    </span>
  );
}
