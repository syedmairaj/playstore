/**
 * StagingWorkspacePillar.tsx
 *
 * Pillar container component for the Staging Workspace.
 * Displays a single pillar (Review Issues, Market Opportunities, or Competitor Keywords)
 * with header, signal chips, and empty state.
 *
 * Features:
 * - Always visible header (even with 0 signals)
 * - Itemized signal display as chips
 * - Category context (how signals are routed to AI)
 * - Bilingual support (EN/AR with RTL)
 * - Smooth animations
 * - Responsive wrapping
 */

import React from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { marketIntelSignalsSectionId } from "@/lib/client/market-intel-signals";
import { ActiveContextSlotEmpty } from "@/components/staging-workspace/active-context-slot";
import type {
  StagingPillar,
  StagingSignal,
  ChipDisplayOptions,
  RemovalHandler,
} from "@/lib/client/staging-workspace-types";
import StagingSignalChip from "./StagingSignalChip";

interface StagingWorkspacePillarProps {
  pillar: StagingPillar;
  locale: "en" | "ar";
  isRtl: boolean;
  isLoading?: boolean;
  onRemoveSignal: RemovalHandler;
  chipDisplayOptions?: ChipDisplayOptions;
  workspaceId?: string;
  localeOverride?: "en" | "ar";
}

const pillarIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle: require("lucide-react").AlertTriangle,
  TrendingUp: require("lucide-react").TrendingUp,
  Shield: require("lucide-react").Shield,
  Hash: require("lucide-react").Hash,
};

export default function StagingWorkspacePillar({
  pillar,
  locale,
  isRtl,
  isLoading = false,
  onRemoveSignal,
  chipDisplayOptions = {
    showRemoveButton: true,
    showCategory: true,
    showMetadata: true,
    animateOnRemove: true,
  },
  workspaceId,
  localeOverride,
}: StagingWorkspacePillarProps) {
  const tSlot = useTranslations("optimizer.activeContext");
  const resolvedLocale = localeOverride ?? locale;
  const label = pillar.label[resolvedLocale];
  const description = pillar.description[resolvedLocale];
  const IconComponent = pillarIcons[pillar.icon];
  const isMarketIntelPillar = pillar.id === "market_opportunities";
  const sectionId = isMarketIntelPillar ? marketIntelSignalsSectionId() : undefined;

  return (
    <div id={sectionId} className="space-y-2 scroll-mt-24">
      {/* Pillar Header - Always Visible */}
      <div
        className={`flex items-center gap-2 border-b pb-2 ${pillar.color.header} ${
          isRtl ? "flex-row-reverse" : ""
        }`}
      >
        {IconComponent ? (
          <IconComponent className={`size-4 shrink-0 ${pillar.color.icon}`} />
        ) : (
          <div className={`size-4 shrink-0 rounded-full ${pillar.color.icon}`} />
        )}

        <h3
          className={`flex-1 text-[11px] font-semibold text-white/90 ${
            isRtl ? "font-arabic text-right" : "uppercase tracking-[0.12em]"
          }`}
        >
          {label}
        </h3>

        <span className="shrink-0 text-[10px] font-medium text-white/50 tabular-nums">
          {pillar.count > 0 ? `(${pillar.count})` : "—"}
        </span>
      </div>

      {/* Pillar Description */}
      <div className={`text-[9px] italic text-white/30 px-1 ${isRtl ? "text-right" : "text-left"}`}>
        {description}
      </div>

      {/* Signals Container */}
      <div
        className={`flex flex-wrap gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 min-h-[60px] ${
          isRtl ? "flex-row-reverse" : ""
        }`}
      >
        {isLoading ? (
          // Loading state
          <div className="flex items-center justify-center w-full h-12">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-white/30 animate-bounce"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        ) : pillar.isEmpty ? (
          isMarketIntelPillar && workspaceId ? (
            <ActiveContextSlotEmpty
              message={tSlot("noActiveSignals")}
              ctaLabel={tSlot("openMarketIntelCta")}
              ctaHref={`/app/${workspaceId}/market`}
              ctaClassName="border-emerald-500/25 bg-emerald-500/10 text-emerald-200/80 hover:border-emerald-400/45 hover:bg-emerald-500/18 hover:text-emerald-100"
              isRtl={isRtl}
            />
          ) : (
            <ActiveContextSlotEmpty
              message={tSlot("noActiveSignals")}
              isRtl={isRtl}
            />
          )
        ) : (
          // Signal chips
          <motion.div
            layout
            className={`flex flex-wrap gap-2 w-full ${isRtl ? "justify-end" : "justify-start"}`}
          >
            {pillar.signals.map((signal) => (
              <StagingSignalChip
                key={
                  signal.source === "review_issue"
                    ? `review-${signal.content.trim().toLowerCase()}`
                    : signal.id
                }
                signal={signal}
                locale={resolvedLocale}
                isRtl={isRtl}
                onRemove={onRemoveSignal}
                displayOptions={chipDisplayOptions}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
