/**
 * StagingWorkspace.tsx
 *
 * Main Staging Workspace component - the transparent control center for all signals
 * being staged for AI listing generation.
 *
 * The three-pillar architecture ensures complete visibility and granular control:
 *
 * 1. REVIEW ISSUES (from Reviews module)
 *    ⚠️ Routed to: "What's New" / Pain-point resolution
 *
 * 2. MARKET OPPORTUNITIES (from AI Keyword Spotlight)
 *    📈 Routed to: Title / Short Description / Feature Focus
 *
 * 3. COMPETITOR KEYWORDS (from Competitor Spy module)
 *    🛡️ Routed to: Title / Short Description / ASO optimization
 *
 * Features:
 * - All three pillars always visible (even empty)
 * - Individual chip per signal with inline removal
 * - Dynamic signal counter
 * - Bilingual (EN/AR) with full RTL support
 * - Real-time sync to origin modules
 * - Smooth animations
 * - Loading states
 */

import React, { useMemo, useCallback, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, TrendingUp, Shield } from "lucide-react";
import type {
  StagingWorkspaceState,
  StagingWorkspaceConfig,
  RemovalHandler,
  ReviewIssueSignal,
  MarketOpportunitySignal,
  CompetitorKeywordSignal,
  StagingPillar,
} from "@/lib/client/staging-workspace-types";
import StagingWorkspacePillar from "./StagingWorkspacePillar";

interface StagingWorkspaceProps {
  state: StagingWorkspaceState;
  config: StagingWorkspaceConfig;
  onRemoveSignal: RemovalHandler;
  onSignalsUpdate?: (totalSignals: number) => void;
  /** Rendered after the Active Context header, before the three pillars. */
  topSection?: React.ReactNode;
  /** Rendered after Keyword Tracker (e.g. Review Insights curation panel). */
  middleSection?: React.ReactNode;
  /** Pillars to hide from the stack (signals still count toward the badge). */
  hiddenPillarIds?: Array<StagingPillar["id"]>;
  /** Keyword Tracker count — included in global Signals badge. */
  keywordTrackerCount?: number;
  workspaceId?: string;
  locale?: "en" | "ar";
}

/**
 * Build pillar configuration with labels and styling
 */
function buildPillarsConfig(
  state: StagingWorkspaceState,
  locale: "en" | "ar"
): StagingPillar[] {
  return [
    {
      ...state.reviewIssues,
      label: {
        en: "Review Insights",
        ar: "رؤى المراجعات",
      },
      description: {
        en: "→ user pain points woven into description + what's new",
        ar: "← نقاط ألم المستخدم تُنسج في الوصف + ما هو جديد",
      },
      icon: "AlertTriangle",
      color: {
        icon: "text-rose-400/80",
        header: "border-rose-400/20",
        chip: "bg-rose-500/5",
        text: "text-rose-200/90",
      },
    },
    {
      ...state.marketOpportunities,
      label: {
        en: "Market Intelligence Signals",
        ar: "إشارات ذكاء السوق",
      },
      description: {
        en: "→ user-staged keywords from Market Intel · woven into title + short description",
        ar: "← كلمات اختارها المستخدم من ذكاء السوق · تُنسج في العنوان + الوصف القصير",
      },
      icon: "TrendingUp",
      color: {
        icon: "text-emerald-400/80",
        header: "border-emerald-400/20",
        chip: "bg-emerald-500/5",
        text: "text-emerald-200/90",
      },
    },
    {
      ...state.competitorKeywords,
      label: {
        en: "Competitor Strengths",
        ar: "نقاط قوة المنافس",
      },
      description: {
        en: "→ positioning angles to counter in long description",
        ar: "← زوايا تموضع للرد عليها في الوصف الطويل",
      },
      icon: "Shield",
      color: {
        icon: "text-sky-400/80",
        header: "border-sky-400/20",
        chip: "bg-sky-500/5",
        text: "text-sky-200/90",
      },
    },
  ];
}

export default function StagingWorkspace({
  state,
  config,
  onRemoveSignal,
  onSignalsUpdate,
  topSection,
  middleSection,
  hiddenPillarIds = [],
  keywordTrackerCount = 0,
  workspaceId,
  locale: localeProp,
}: StagingWorkspaceProps) {
  const t = useTranslations("optimizer.activeContext");
  const [removingSignalId, setRemovingSignalId] = useState<string | null>(null);
  const unifiedStack = middleSection != null;

  const combinedSignalCount = state.totalSignals + keywordTrackerCount;

  // Notify parent of signal count changes (all Active Context sections)
  useEffect(() => {
    onSignalsUpdate?.(combinedSignalCount);
  }, [combinedSignalCount, onSignalsUpdate]);

  // Build pillar configs
  const pillars = useMemo(() => {
    const all = buildPillarsConfig(state, config.locale);
    if (hiddenPillarIds.length === 0) return all;
    const hidden = new Set(hiddenPillarIds);
    return all.filter((pillar) => !hidden.has(pillar.id));
  }, [state, config.locale, hiddenPillarIds]);

  // Handle signal removal with visual feedback
  const handleRemoveSignal: RemovalHandler = useCallback(
    async (signalId, source) => {
      setRemovingSignalId(signalId);
      try {
        await onRemoveSignal(signalId, source);
      } finally {
        setRemovingSignalId(null);
      }
    },
    [onRemoveSignal]
  );

  return (
    <div
      className={`space-y-6 scroll-smooth p-4 rounded-lg bg-gradient-to-b from-white/3 to-white/1 border border-white/5 ${
        config.isRtl ? "dir-rtl" : "dir-ltr"
      }`}
    >
      {/* Header with Signal Counter — sticky while scrolling the unified stack */}
      <div
        className={`sticky top-0 z-10 -mx-4 mb-2 border-b border-white/[0.06] bg-gradient-to-b from-[#0a0e14] via-[#0a0e14]/98 to-[#0a0e14]/90 px-4 py-3 backdrop-blur-md ${
          config.isRtl ? "flex-row-reverse" : ""
        } flex items-start justify-between gap-4`}
      >
        <div className={`flex-1 ${config.isRtl ? "text-right" : "text-left"}`}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-lg">✨</span>
            {config.locale === "ar" ? "السياق النشط" : "Active Context"}
          </h2>
          <p className="text-[11px] text-white/50 mt-1">
            {unifiedStack
              ? t("unifiedStackHint")
              : config.locale === "ar"
                ? "سيتم دمج جميع الإشارات أدناه تلقائياً في القائمة. اضغط × لإزالة أي إشارة."
                : "All signals below will be woven into your listing automatically. Click × to remove any signal."}
          </p>
        </div>

        {config.showSignalCounter && (
          <div className="shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <div className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.08em]">
              {config.locale === "ar" ? "الإشارات" : "Signals"}
            </div>
            <div className="text-xl font-bold text-white">{combinedSignalCount}</div>
          </div>
        )}
      </div>

      {/* Error state */}
      {state.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px] text-red-300">
          {state.error}
        </div>
      )}

      {/* Persistent module slots — always mounted to prevent layout shift */}
      <div className="flex flex-col gap-6" data-active-context-slots>
        <div data-slot="keyword-tracker" className="shrink-0">
          {topSection}
        </div>

        {unifiedStack ? (
          <div data-slot="review-insights" className="shrink-0">
            {middleSection}
          </div>
        ) : null}
      </div>

      {/* Market Intelligence + Competitor Strengths pillars */}
      <div className="space-y-6">
        {pillars.map((pillar) => (
          <StagingWorkspacePillar
            key={pillar.id}
            pillar={pillar}
            locale={config.locale}
            isRtl={config.isRtl}
            isLoading={state.isLoading && pillar.count === 0}
            onRemoveSignal={handleRemoveSignal}
            workspaceId={workspaceId}
            localeOverride={localeProp}
            chipDisplayOptions={{
              showRemoveButton: config.enableInlineRemoval,
              showCategory: true,
              showMetadata: true,
              animateOnRemove: config.animateTransitions,
            }}
          />
        ))}
      </div>

      {/* Global state info (development) */}
      {state.isLoading && (
        <div className="text-[10px] text-white/25 italic text-center">
          {config.locale === "ar" ? "جاري التحديث..." : "Updating signals..."}
        </div>
      )}

      {combinedSignalCount === 0 && !state.isLoading && !unifiedStack && (
        <div className={`p-3 rounded-lg bg-white/3 text-[11px] text-white/40 ${
          config.isRtl ? "text-right" : "text-left"
        }`}>
          {config.locale === "ar"
            ? "لم يتم تحديد أي إشارات حتى الآن. قم بزيارة وحدات المراجعات والسوق والمنافسين لإضافة الإشارات."
            : "No signals selected yet. Visit the Reviews, Market Intel, and Competitor Spy modules to add signals."}
        </div>
      )}
    </div>
  );
}
