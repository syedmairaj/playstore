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
}: StagingWorkspacePillarProps) {
  const label = pillar.label[locale];
  const description = pillar.description[locale];
  const IconComponent = pillarIcons[pillar.icon];

  return (
    <motion.div
      layout
      className="space-y-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Pillar Header - Always Visible */}
      <div
        className={`flex items-center gap-2 pb-2 border-b ${pillar.color.header} ${
          isRtl ? "flex-row-reverse" : ""
        }`}
      >
        {/* Icon */}
        <div className="shrink-0 flex items-center">
          {IconComponent ? (
            <IconComponent className={`size-4 ${pillar.color.icon}`} />
          ) : (
            <div className={`size-4 rounded-full ${pillar.color.icon}`} />
          )}
        </div>

        {/* Title and count */}
        <div className={`flex-1 ${isRtl ? "text-right" : "text-left"}`}>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90">
            {label}
          </h3>
        </div>

        {/* Signal count badge */}
        <div className={`text-[10px] font-medium text-white/50`}>
          {pillar.count > 0 ? `(${pillar.count})` : "—"}
        </div>
      </div>

      {/* Pillar Description */}
      <div className={`text-[9px] italic text-white/30 px-1 ${isRtl ? "text-right" : "text-left"}`}>
        {description}
      </div>

      {/* Signals Container */}
      <div
        className={`flex flex-wrap gap-2 p-3 rounded-lg ${pillar.color.chip} border border-white/5 min-h-[60px] flex items-center justify-${
          isRtl ? "start" : "start"
        } ${isRtl ? "flex-row-reverse" : ""}`}
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
          // Empty state
          <div
            className={`flex-1 text-[10px] italic text-white/25 ${
              isRtl ? "text-right" : "text-left"
            }`}
          >
            {locale === "ar"
              ? "لا توجد إشارات مرحلة حالياً"
              : "No signals staged yet"}
          </div>
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
                locale={locale}
                isRtl={isRtl}
                onRemove={onRemoveSignal}
                displayOptions={chipDisplayOptions}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
