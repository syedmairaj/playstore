"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AiSuggestedKeywordsGrid, AiSuggestedKeywordsGridEmpty } from "@/components/keyword-tracker/ai-suggested-keywords-grid";
import {
  addIgnoredDiscoveryKeyword,
  readIgnoredDiscoveryKeywords,
} from "@/lib/keywords/discovery-keyword-preferences";
import type { DiscoveryKeywordSuggestion } from "@/lib/keywords/discovery-ai-suggestions";
import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import {
  fetchStagedDiscoveryKeywords,
  resolveStagedAssetForKeyword,
  stageDiscoveryKeywordToAsset,
} from "@/lib/keywords/discovery-stage-keyword";
import {
  isKeywordTrackedOnApp,
  keywordTrackingMatchKeys,
} from "@/lib/keywords/keyword-tracking-match";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { cn } from "@/lib/utils";

export type DiscoveryKeywordsPanelProps = {
  workspaceId: string;
  appId: string;
  appName: string;
  appCategory?: string | null;
  generationId: string;
  hasAiListingSource?: boolean;
  suggestions: DiscoveryKeywordSuggestion[];
  trackedKeys: Set<string>;
  market: string;
  locale: string;
  isRtl?: boolean;
  mutationPending: boolean;
  trackingAiTerm: string | null;
  blockingError: boolean;
  onTrack: (keyword: string, options?: { background?: boolean }) => Promise<void>;
  onWorkflowChange?: () => void;
};

export function DiscoveryKeywordsPanel({
  workspaceId,
  appId,
  appName,
  appCategory,
  generationId,
  hasAiListingSource = false,
  suggestions,
  trackedKeys,
  market,
  locale,
  isRtl = false,
  mutationPending,
  trackingAiTerm,
  blockingError,
  onTrack,
  onWorkflowChange,
}: DiscoveryKeywordsPanelProps) {
  const t = useTranslations("keywordTracker");
  const tAi = useTranslations("keywordTracker.aiSuggestedKeywords");

  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(() =>
    readIgnoredDiscoveryKeywords(workspaceId, appId, generationId),
  );
  const [vaultStaged, setVaultStaged] = useState<Map<string, ListingAssetTarget>>(
    () => new Map(),
  );
  const [localStaged, setLocalStaged] = useState<Map<string, ListingAssetTarget>>(
    () => new Map(),
  );
  const [stagingTerm, setStagingTerm] = useState<string | null>(null);
  const [vaultLoading, setVaultLoading] = useState(true);

  // Remount via parent key handles most resets; also sync when generation changes in place.
  useEffect(() => {
    setIgnoredKeys(readIgnoredDiscoveryKeywords(workspaceId, appId, generationId));
    setLocalStaged(new Map());
    setStagingTerm(null);
  }, [workspaceId, appId, generationId]);

  const refreshStaged = useCallback(async () => {
    setVaultLoading(true);
    try {
      const map = await fetchStagedDiscoveryKeywords(workspaceId, appId);
      setVaultStaged(map);
    } finally {
      setVaultLoading(false);
    }
  }, [workspaceId, appId]);

  useEffect(() => {
    void refreshStaged();
  }, [refreshStaged]);

  const visibleSuggestions = useMemo(() => {
    return suggestions.filter((item) => {
      const keys = keywordTrackingMatchKeys(item.keyword);
      return !keys.some((k) => ignoredKeys.has(k));
    });
  }, [suggestions, ignoredKeys]);

  const handleIgnore = useCallback(
    (keyword: string) => {
      const next = addIgnoredDiscoveryKeyword(
        workspaceId,
        appId,
        generationId,
        keyword,
        ignoredKeys,
      );
      setIgnoredKeys(next);
      toast.message(tAi("ignoredToast", { term: keyword }));
    },
    [workspaceId, appId, generationId, ignoredKeys, tAi],
  );

  const handleStage = useCallback(
    async (keyword: string, asset: ListingAssetTarget) => {
      if (!appId || stagingTerm) return;
      setStagingTerm(keyword);
      try {
        const result = await stageDiscoveryKeywordToAsset({
          workspaceId,
          appId,
          keyword,
          targetAsset: asset,
          market,
          language: locale,
          generationId,
        });
        if (!result.ok) {
          toast.error(tAi("stageError"));
          return;
        }

        const nextLocal = new Map(localStaged);
        for (const key of keywordTrackingMatchKeys(keyword)) {
          nextLocal.set(key, asset);
        }
        setLocalStaged(nextLocal);
        void refreshStaged();
        onWorkflowChange?.();

        toast.success(tAi("stageToast", { term: keyword, asset: tAi(`assets.${asset}`) }));

        const tracked = isKeywordTrackedOnApp(keyword, trackedKeys);
        if (!tracked) {
          void onTrack(keyword, { background: true });
        }
      } finally {
        setStagingTerm(null);
      }
    },
    [
      appId,
      stagingTerm,
      workspaceId,
      market,
      locale,
      generationId,
      localStaged,
      refreshStaged,
      onWorkflowChange,
      tAi,
      trackedKeys,
      onTrack,
    ],
  );

  const workflowSteps = [
    { id: "discovery", label: tAi("workflow.discovery"), active: true, done: true },
    { id: "staging", label: tAi("workflow.staging"), active: true, done: localStaged.size > 0 || vaultStaged.size > 0 },
    { id: "tracking", label: tAi("workflow.tracking"), active: true, done: false },
  ] as const;

  const contextLine = appCategory?.trim()
    ? tAi("contextWithCategory", { app: appName, category: appCategory.trim() })
    : tAi("contextAppOnly", { app: appName });

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/[0.28] via-[#0a0f14] to-[#060a0f] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_28px_56px_-28px_rgba(16,185,129,0.4)]"
      aria-labelledby="ai-suggested-kw-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_100%_0%,rgba(16,185,129,0.16),transparent_52%)]"
        aria-hidden
      />
      <div className="relative space-y-6 px-5 pb-6 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div
          className={cn(
            "flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:items-start sm:justify-between",
            isRtl ? "sm:flex-row-reverse" : "sm:flex-row",
          )}
        >
          <div className="min-w-0 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
              {t("sections.aiSuggestedKicker")}
            </p>
            <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-50/95 ring-1 ring-emerald-500/25">
              <span
                className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.95)]"
                aria-hidden
              />
              <span className="min-w-0 leading-snug">
                {hasAiListingSource ? tAi("sourceLabel") : tAi("sourceContextual")}
              </span>
            </p>
            <div className="space-y-2">
              <h2
                id="ai-suggested-kw-heading"
                className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
              >
                {tAi("titleForApp", { app: appName })}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{contextLine}</p>
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">{tAi("subtitleWorkflow")}</p>
            </div>
            <ol
              className={cn(
                "flex flex-wrap items-center gap-2 text-[11px] font-medium text-zinc-500",
                isRtl && "flex-row-reverse",
              )}
              aria-label={tAi("workflow.aria")}
            >
              {workflowSteps.map((step, index) => (
                <li key={step.id} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
                      step.done
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90"
                        : "border-white/10 bg-white/[0.04] text-zinc-400",
                    )}
                  >
                    {step.done ? <Check className="size-3" aria-hidden /> : null}
                    {step.label}
                  </span>
                  {index < workflowSteps.length - 1 ? (
                    <ArrowRight className="size-3 text-zinc-600" aria-hidden />
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {tAi("pricingNote", { per: AI_CREDIT_COSTS.serper_preview_per_country })}
            </p>
          </div>
        </div>

        {visibleSuggestions.length === 0 ? (
          <AiSuggestedKeywordsGridEmpty message={tAi("allIgnored")} isRtl={isRtl} />
        ) : (
          <AiSuggestedKeywordsGrid
            suggestions={visibleSuggestions}
            isRtl={isRtl}
            disabled={mutationPending || blockingError}
            loading={vaultLoading && vaultStaged.size === 0}
            stagingTerm={stagingTerm}
            trackingTerm={trackingAiTerm}
            resolveStaged={(kw) =>
              resolveStagedAssetForKeyword(kw, vaultStaged, localStaged)
            }
            isTracked={(kw) => isKeywordTrackedOnApp(kw, trackedKeys)}
            onStage={(kw, asset) => void handleStage(kw, asset)}
            onTrack={(kw) => void onTrack(kw)}
            onIgnore={handleIgnore}
            onViewSearchVolumeHistory={(kw, isTracked) => {
              if (isTracked) {
                toast.info(tAi("menuViewSearchVolume"), {
                  description: tAi("searchVolumeHistoryTrackedHint"),
                });
                return;
              }
              toast.info(tAi("menuViewSearchVolume"), {
                description: tAi("searchVolumeHistoryHint"),
              });
            }}
          />
        )}
      </div>
    </section>
  );
}
