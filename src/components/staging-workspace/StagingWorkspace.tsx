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
import { ActiveContextSectionZone } from "@/components/staging-workspace/active-context-section-zone";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ACTIVE_CONTEXT_MODULE_ICON_COLOR } from "@/components/staging-workspace/active-context-tokens";
import { cn } from "@/lib/utils";

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
        icon: ACTIVE_CONTEXT_MODULE_ICON_COLOR.reviewInsights,
        header: "border-orange-400/20",
        chip: "bg-orange-500/5",
        text: "text-orange-200/90",
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
        icon: ACTIVE_CONTEXT_MODULE_ICON_COLOR.marketIntel,
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
      icon: "ShieldCheck",
      color: {
        icon: ACTIVE_CONTEXT_MODULE_ICON_COLOR.competitor,
        header: "border-violet-400/20",
        chip: "bg-violet-500/5",
        text: "text-violet-200/90",
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

  const stackSections = useMemo(() => {
    const blocks: { key: string; node: React.ReactNode }[] = [];

    if (topSection) {
      blocks.push({
        key: "keyword-tracker",
        node: (
          <div data-slot="keyword-tracker">{topSection}</div>
        ),
      });
    }

    if (unifiedStack && middleSection) {
      blocks.push({
        key: "review-insights",
        node: (
          <div data-slot="review-insights">{middleSection}</div>
        ),
      });
    }

    for (const pillar of pillars) {
      blocks.push({
        key: pillar.id,
        node: (
          <StagingWorkspacePillar
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
        ),
      });
    }

    return blocks;
  }, [
    topSection,
    unifiedStack,
    middleSection,
    pillars,
    config.locale,
    config.isRtl,
    config.enableInlineRemoval,
    config.animateTransitions,
    state.isLoading,
    handleRemoveSignal,
    workspaceId,
    localeProp,
  ]);

  return (
    <TooltipProvider delayDuration={300}>
    <div
      className={cn(
        "scroll-smooth py-2",
        config.isRtl ? "dir-rtl" : "dir-ltr",
      )}
    >
      {/* Header — SIGNALS badge is the only contained element */}
      <div
        className={cn(
          "sticky top-0 z-10 mb-12 flex items-start justify-between gap-8 pb-2",
          "bg-[#0a0e14]/80 backdrop-blur-md",
          config.isRtl && "flex-row-reverse",
        )}
      >
        <div className={cn("flex-1", config.isRtl ? "text-right" : "text-left")}>
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-white/95">
            <span className="text-sm opacity-80">✨</span>
            {config.locale === "ar" ? "السياق النشط" : "Active Context"}
          </h2>
          <p className="mt-2 max-w-lg text-[11px] font-normal leading-relaxed text-white/32">
            {unifiedStack
              ? t("unifiedStackHint")
              : config.locale === "ar"
                ? "سيتم دمج جميع الإشارات أدناه تلقائياً في القائمة. اضغط × لإزالة أي إشارة."
                : "All signals below will be woven into your listing automatically. Click × to remove any signal."}
          </p>
        </div>

        {config.showSignalCounter && (
          <div className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-2.5">
            <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/30">
              {config.locale === "ar" ? "الإشارات" : "Signals"}
            </div>
            <div className="text-xl font-semibold tabular-nums text-white/90">{combinedSignalCount}</div>
          </div>
        )}
      </div>

      {/* Error state */}
      {state.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px] text-red-300">
          {state.error}
        </div>
      )}

      {/* Module slots — sectional gravity zones, no cards */}
      <div data-active-context-slots className="flex flex-col">
        {stackSections.map((block, index) => (
          <ActiveContextSectionZone
            key={block.key}
            showSectionRule={index > 0}
          >
            {block.node}
          </ActiveContextSectionZone>
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
    </TooltipProvider>
  );
}
