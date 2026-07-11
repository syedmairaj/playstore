"use client";

import { Shield, Swords, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ActiveContextStrategyMode } from "@/lib/optimization-queue/resolve-strategy-mode";
import { cn } from "@/lib/utils";

export type StrategicRationaleCardProps = {
  rationale: NonNullable<ListingGenerationOutput["strategicRationale"]>;
  strategyMode?: ActiveContextStrategyMode;
  isRtl?: boolean;
  className?: string;
};

export function StrategicRationaleCard({
  rationale,
  strategyMode = "defensive",
  isRtl = false,
  className,
}: StrategicRationaleCardProps) {
  const t = useTranslations("optimizer.results.strategyRationale");
  const isDefensive = strategyMode === "defensive";

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-4 sm:p-5",
        isDefensive
          ? "border-sky-500/20 bg-sky-500/[0.04]"
          : "border-orange-500/20 bg-orange-500/[0.04]",
        isRtl && "font-arabic text-end",
        className,
      )}
      dir={isRtl ? "rtl" : "ltr"}
      aria-labelledby="strategic-rationale-heading"
    >
      <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
        {isDefensive ? (
          <Shield className="size-4 shrink-0 text-sky-400" aria-hidden />
        ) : (
          <Swords className="size-4 shrink-0 text-orange-400" aria-hidden />
        )}
        <div className={cn("min-w-0", isRtl && "text-end")}>
          <h3
            id="strategic-rationale-heading"
            className="text-sm font-semibold tracking-tight text-white"
          >
            {t("heading")}
          </h3>
          <p className="text-[11px] text-white/45">
            {isDefensive ? t("modeDefensive") : t("modeOffensive")}
          </p>
        </div>
      </div>

      <dl className="space-y-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {t("intentLabel")}
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-white/75">
            {rationale.strategicIntent}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {t("resolutionLabel")}
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-white/75">
            {rationale.exploitationResolutionSummary}
          </dd>
        </div>
        <div>
          <dt className={cn("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40", isRtl && "flex-row-reverse justify-end")}>
            <Target className="size-3 shrink-0" aria-hidden />
            {t("roiLabel")}
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-white/75">
            {rationale.roiPrediction}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export type MetadataVariantToggleProps = {
  value: "aggressive" | "growth";
  onChange: (value: "aggressive" | "growth") => void;
  hasAggressive: boolean;
  hasGrowth: boolean;
  isRtl?: boolean;
  className?: string;
  /** When true, labels map to dynamic tone A/B arms (e.g. Friendly · 50%). */
  toneAbMode?: boolean;
  /** Override Arm A label when toneAbMode (from deploy plan). */
  armALabel?: string;
  /** Override Arm B label when toneAbMode (from deploy plan). */
  armBLabel?: string;
};

export function MetadataVariantToggle({
  value,
  onChange,
  hasAggressive,
  hasGrowth,
  isRtl = false,
  className,
  toneAbMode = false,
  armALabel,
  armBLabel,
}: MetadataVariantToggleProps) {
  const t = useTranslations("optimizer.results.metadataVariant");

  if (!hasAggressive && !hasGrowth) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        isRtl && "flex-row-reverse",
        className,
      )}
      role="group"
      aria-label={t("ariaLabel")}
    >
      <span className="text-[11px] font-medium text-zinc-500">{t("label")}</span>
      <button
        type="button"
        disabled={!hasAggressive}
        aria-pressed={value === "aggressive"}
        onClick={() => onChange("aggressive")}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
          value === "aggressive"
            ? "border-orange-500/40 bg-orange-500/15 text-orange-200"
            : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600",
          !hasAggressive && "pointer-events-none opacity-40",
        )}
      >
        {toneAbMode ? (armALabel ?? t("aggressiveAb")) : t("aggressive")}
      </button>
      <button
        type="button"
        disabled={!hasGrowth}
        aria-pressed={value === "growth"}
        onClick={() => onChange("growth")}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
          value === "growth"
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
            : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600",
          !hasGrowth && "pointer-events-none opacity-40",
        )}
      >
        {toneAbMode ? (armBLabel ?? t("growthAb")) : t("growth")}
      </button>
    </div>
  );
}
