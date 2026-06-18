"use client";

import type { ReactNode } from "react";
import { Anchor, Copy, Layers, RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrchestrationProtocol } from "@/lib/listing/orchestration-protocol.schema";
import { cn } from "@/lib/utils";

type ModuleId = "anchor" | "conversion" | "expansion";

type Props = {
  orchestration: OrchestrationProtocol;
  isRtl?: boolean;
  onApplyShortVariation?: (text: string) => void;
  onRegenerateModule?: (moduleId: ModuleId) => void;
  regeneratingModule?: ModuleId | null;
};

export function OrchestrationModulesPanel({
  orchestration,
  isRtl = false,
  onApplyShortVariation,
  onRegenerateModule,
  regeneratingModule = null,
}: Props) {
  const t = useTranslations("optimizer.results.orchestration");
  const { anchor, conversion, expansion } = orchestration.modules;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 sm:p-5",
        isRtl && "font-arabic",
      )}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
        <Sparkles className="size-4 shrink-0 text-violet-300" aria-hidden />
        <div className={cn("min-w-0", isRtl && "text-end")}>
          <p className="text-sm font-semibold text-white">{t("heading")}</p>
          <p className="text-xs text-white/50">{t("subheading")}</p>
        </div>
      </div>

      {/* Phase 1 — Anchor */}
      <ModuleCard
        phase={t("phase1")}
        title={t("anchorTitle")}
        moduleId="anchor"
        isRtl={isRtl}
        onRegenerate={onRegenerateModule}
        busy={regeneratingModule === "anchor"}
        regenerateLabel={t("regenerateModule")}
      >
        <p className="text-lg font-semibold text-white">{anchor.title}</p>
        <p className="mt-2 text-xs text-white/45">{t("keywordAnchor")}</p>
        <p className="mt-1 text-sm text-violet-200/90">{anchor.keywordAnchor}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {anchor.lockedKeywords.map((kw) => (
            <span
              key={`locked-${kw}`}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200"
            >
              {t("lockedTag")}: {kw}
            </span>
          ))}
          {anchor.aiSuggestedKeywords.map((kw) => (
            <span
              key={`ai-${kw}`}
              className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200"
            >
              {t("aiTag")}: {kw}
            </span>
          ))}
        </div>
        {anchor.hybridRationale ? (
          <p className="mt-3 text-xs leading-relaxed text-white/55">{anchor.hybridRationale}</p>
        ) : null}
      </ModuleCard>

      {/* Phase 2 — Conversion */}
      <ModuleCard
        phase={t("phase2")}
        title={t("conversionTitle")}
        moduleId="conversion"
        isRtl={isRtl}
        onRegenerate={onRegenerateModule}
        busy={regeneratingModule === "conversion"}
        regenerateLabel={t("regenerateModule")}
      >
        <div className="space-y-3">
          {conversion.shortVariations.map((variation) => (
            <div
              key={variation.variationId}
              className={cn(
                "rounded-xl border border-zinc-800/80 bg-black/20 p-3",
                variation.variationId === conversion.selectedVariationId &&
                  "border-emerald-500/35 ring-1 ring-emerald-500/20",
              )}
            >
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2",
                  isRtl && "flex-row-reverse",
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {variation.profileLabel}
                </p>
                {variation.variationId === conversion.selectedVariationId ? (
                  <span className="text-[10px] font-medium text-emerald-400">{t("activeShort")}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-white/90">{variation.shortDescription}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/50">{variation.rationale}</p>
              {onApplyShortVariation ? (
                <button
                  type="button"
                  onClick={() => onApplyShortVariation(variation.shortDescription)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  <Copy className="size-3" aria-hidden />
                  {t("useAsShort")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </ModuleCard>

      {/* Phase 3 — Expansion */}
      <ModuleCard
        phase={t("phase3")}
        title={t("expansionTitle")}
        moduleId="expansion"
        isRtl={isRtl}
        onRegenerate={onRegenerateModule}
        busy={regeneratingModule === "expansion"}
        regenerateLabel={t("regenerateModule")}
      >
        <div className="space-y-4">
          <BlockSection label={t("blockHook")} isRtl={isRtl}>
            <p className="text-[11px] font-medium text-rose-300/80">
              {expansion.blocks.hook.painPointLabel}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-white/85 whitespace-pre-wrap">
              {expansion.blocks.hook.content}
            </p>
          </BlockSection>

          <BlockSection label={t("blockFeatures")} isRtl={isRtl}>
            {expansion.blocks.features.categories.map((cat) => (
              <div key={cat.label} className="mt-2">
                <p className="text-xs font-semibold text-zinc-300">{cat.label}</p>
                <ul className="mt-1 space-y-1">
                  {cat.bullets.map((bullet) => (
                    <li key={bullet} className="text-sm text-white/80">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </BlockSection>

          <BlockSection label={t("blockTrust")} isRtl={isRtl}>
            <p className="text-sm leading-relaxed text-white/85 whitespace-pre-wrap">
              {expansion.blocks.trustClosing.content}
            </p>
            <p className="mt-2 text-sm font-medium text-emerald-300/90">
              {expansion.blocks.trustClosing.cta}
            </p>
          </BlockSection>
        </div>
      </ModuleCard>
    </div>
  );
}

function ModuleCard({
  phase,
  title,
  moduleId,
  children,
  isRtl,
  onRegenerate,
  busy,
  regenerateLabel,
}: {
  phase: string;
  title: string;
  moduleId: ModuleId;
  children: ReactNode;
  isRtl: boolean;
  onRegenerate?: (id: ModuleId) => void;
  busy: boolean;
  regenerateLabel: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4">
      <div
        className={cn(
          "mb-3 flex flex-wrap items-center justify-between gap-2",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
          {moduleId === "anchor" ? (
            <Anchor className="size-3.5 text-violet-300" aria-hidden />
          ) : (
            <Layers className="size-3.5 text-violet-300" aria-hidden />
          )}
          <div className={isRtl ? "text-end" : undefined}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">
              {phase}
            </p>
            <p className="text-sm font-medium text-white">{title}</p>
          </div>
        </div>
        {onRegenerate ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRegenerate(moduleId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", busy && "animate-spin")} aria-hidden />
            {regenerateLabel}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function BlockSection({
  label,
  children,
  isRtl,
}: {
  label: string;
  children: ReactNode;
  isRtl: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-zinc-800/60 bg-black/25 p-3", isRtl && "text-end")}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      {children}
    </div>
  );
}
