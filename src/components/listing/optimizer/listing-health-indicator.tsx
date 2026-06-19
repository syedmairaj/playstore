"use client";

import { ChevronRight, HeartPulse, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  buildListingHealthFixes,
  type ListingHealthFixActionId,
} from "@/lib/listing/listing-health-fix-actions";
import type { ListingGenerationWarningsPayload } from "@/lib/listing/listing-generation-warnings";
import { cn } from "@/lib/utils";

type Props = {
  warnings: ListingGenerationWarningsPayload | null | undefined;
  longText?: string;
  lockedKeywords?: string[];
  isRtl?: boolean;
  className?: string;
  onFixAction?: (actionId: ListingHealthFixActionId) => void;
};

const HEALTH_TONE: Record<
  ListingGenerationWarningsPayload["healthLabel"],
  { ring: string; text: string; bg: string; border: string }
> = {
  excellent: {
    ring: "text-emerald-400",
    text: "text-emerald-200",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
  },
  good: {
    ring: "text-sky-400",
    text: "text-sky-200",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
  },
  fair: {
    ring: "text-amber-400",
    text: "text-amber-200",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
  },
  limited: {
    ring: "text-orange-400",
    text: "text-orange-200",
    bg: "bg-orange-500/10",
    border: "border-orange-500/25",
  },
};

export function ListingHealthIndicator({
  warnings,
  longText = "",
  lockedKeywords = [],
  isRtl = false,
  className,
  onFixAction,
}: Props) {
  const t = useTranslations("optimizer.results.modular.listingHealth");

  if (!warnings?.items.length) return null;

  const fixes = buildListingHealthFixes({
    warnings: warnings.items,
    longText,
    lockedKeywords,
  });

  const tone = HEALTH_TONE[warnings.healthLabel];
  const score = warnings.healthScore;
  const circumference = 2 * Math.PI * 18;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      role="region"
      aria-label={t(`label.${warnings.healthLabel}`)}
      className={cn(
        "rounded-xl border px-4 py-3",
        tone.bg,
        tone.border,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden>
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-white/10"
            />
            <circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={tone.ring}
            />
          </svg>
          <span className={cn("absolute text-xs font-semibold", tone.text)}>
            {score}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <HeartPulse className={cn("h-4 w-4", tone.ring)} aria-hidden />
            <p className={cn("text-sm font-medium", tone.text)}>
              {t(`label.${warnings.healthLabel}`)}
            </p>
            <span className="text-xs text-white/45">
              {t("missingData", { percent: warnings.missingDataPercent })}
            </span>
          </div>

          {fixes.length > 0 ? (
            <div className="space-y-2">
              <div
                className={cn(
                  "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70",
                  isRtl && "flex-row-reverse",
                )}
              >
                <Wrench className="size-3.5 shrink-0" aria-hidden />
                {t("fixHeading")}
              </div>
              <ul className="space-y-1.5">
                {fixes.map((fix) => (
                  <li key={fix.id}>
                    <button
                      type="button"
                      onClick={() => onFixAction?.(fix.id)}
                      className={cn(
                        "group flex w-full items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-start text-xs leading-relaxed text-white/85 transition-colors hover:border-sky-400/35 hover:bg-sky-500/10",
                        isRtl && "flex-row-reverse text-end",
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0 text-sky-300/80 transition-transform group-hover:translate-x-0.5",
                          isRtl && "rotate-180 group-hover:-translate-x-0.5",
                        )}
                        aria-hidden
                      />
                      <span>{t(`fixes.${fix.labelKey}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-white/55">{t("hint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
