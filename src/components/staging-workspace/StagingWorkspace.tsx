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
  /** Keyword Tracker count — included in global Signals badge. */
  keywordTrackerCount?: number;
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
        en: "Review Issues",
        ar: "مشكلات المراجعات",
      },
      description: {
        en: "→ addressed in description + what's new",
        ar: "← تُعالَج في الوصف + ما هو جديد",
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
        en: "Market Opportunities",
        ar: "فرص السوق",
      },
      description: {
        en: "→ woven into title + short description",
        ar: "← تُنسج في العنوان + الوصف القصير",
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
        en: "Competitor Keywords",
        ar: "كلمات المنافسين",
      },
      description: {
        en: "→ ASO optimization for title + short description",
        ar: "← تحسين ASO للعنوان + الوصف القصير",
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
  keywordTrackerCount = 0,
}: StagingWorkspaceProps) {
  const [removingSignalId, setRemovingSignalId] = useState<string | null>(null);

  const combinedSignalCount = state.totalSignals + keywordTrackerCount;

  // Notify parent of signal count changes (all Active Context sections)
  useEffect(() => {
    onSignalsUpdate?.(combinedSignalCount);
  }, [combinedSignalCount, onSignalsUpdate]);

  // Build pillar configs
  const pillars = useMemo(
    () => buildPillarsConfig(state, config.locale),
    [state, config.locale]
  );

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
      className={`space-y-6 p-4 rounded-lg bg-gradient-to-b from-white/3 to-white/1 border border-white/5 ${
        config.isRtl ? "dir-rtl" : "dir-ltr"
      }`}
    >
      {/* Header with Signal Counter */}
      <div
        className={`flex items-start justify-between gap-4 ${
          config.isRtl ? "flex-row-reverse" : ""
        }`}
      >
        <div className={`flex-1 ${config.isRtl ? "text-right" : "text-left"}`}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-lg">✨</span>
            {config.locale === "ar" ? "السياق النشط" : "Active Context"}
          </h2>
          <p className="text-[11px] text-white/50 mt-1">
            {config.locale === "ar"
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

      {/* Keyword Tracker — first panel in Active Context */}
      {topSection}

      {/* Three Pillars */}
      <div className="space-y-6">
        {pillars.map((pillar) => (
          <StagingWorkspacePillar
            key={pillar.id}
            pillar={pillar}
            locale={config.locale}
            isRtl={config.isRtl}
            isLoading={state.isLoading && pillar.count === 0}
            onRemoveSignal={handleRemoveSignal}
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

      {combinedSignalCount === 0 && !state.isLoading && (
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
