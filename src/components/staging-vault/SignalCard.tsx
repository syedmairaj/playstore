/**
 * SignalCard Component
 *
 * Reusable card component for displaying staged signals from the staging vault.
 * Handles RTL/LTR rendering, metadata display, and context labeling.
 *
 * Used by:
 * - ListingOptimizer dashboard
 * - SignalPanel components
 * - OptimizerFilterMenu
 */

import React from "react";
import type { StagedSignal } from "@/lib/staging-vault/useOptimizerSync";

interface SignalCardProps {
  signal: StagedSignal;
  onSelect?: (signal: StagedSignal) => void;
  onAction?: (action: string, signal: StagedSignal) => void;
  showContext?: boolean;
  showMetadata?: boolean;
  compact?: boolean;
}

/**
 * Get human-readable label for source context
 */
function getContextLabel(context: StagedSignal["source_context"]): string {
  const labels: Record<StagedSignal["source_context"], string> = {
    common_issues_theme: "Common Issue",
    competitor_weakness: "Competitor Weakness",
    competitor_sentiment: "Sentiment",
    keyword_spotlight: "Keyword Spotlight",
    keyword_tracker_alert: "Keyword Alert",
    market_opportunity: "Market Opportunity",
    listing_analysis: "Listing Analysis",
    manual: "Manual",
  };
  return labels[context] || context;
}

/**
 * Get severity color
 */
function getSeverityColor(severity?: string): string {
  switch (severity) {
    case "critical":
      return "text-red-600 bg-red-50";
    case "high":
      return "text-orange-600 bg-orange-50";
    case "medium":
      return "text-yellow-600 bg-yellow-50";
    case "low":
      return "text-blue-600 bg-blue-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
}

/**
 * Get signal type badge color
 */
function getSignalTypeColor(
  signalType: StagedSignal["signal_type"]
): string {
  switch (signalType) {
    case "review_issue":
      return "bg-red-100 text-red-800";
    case "competitor_weakness":
      return "bg-orange-100 text-orange-800";
    case "keyword":
      return "bg-green-100 text-green-800";
    case "optimization_insight":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export const SignalCard: React.FC<SignalCardProps> = ({
  signal,
  onSelect,
  onAction,
  showContext = true,
  showMetadata = true,
  compact = false,
}) => {
  const direction = signal.is_rtl ? "rtl" : "ltr";

  return (
    <div
      className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
        compact ? "border-gray-200" : "border-gray-300"
      }`}
      onClick={() => onSelect?.(signal)}
      dir={direction}
    >
      {/* Header with Type Badge and Context */}
      <div className="flex items-start justify-between mb-2">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSignalTypeColor(
            signal.signal_type
          )}`}
        >
          {signal.signal_type.replace("_", " ")}
        </span>

        {showContext && (
          <span className="text-xs text-gray-500">
            {getContextLabel(signal.source_context)}
          </span>
        )}
      </div>

      {/* Main Content */}
      <h3
        className={`font-semibold text-gray-900 mb-2 ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        {signal.content}
      </h3>

      {/* Metadata Row */}
      {showMetadata && signal.metadata && (
        <div className={`space-y-1 mb-3 ${compact ? "text-xs" : "text-sm"}`}>
          {/* Severity */}
          {signal.metadata.severity && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Severity:</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(
                  signal.metadata.severity as string
                )}`}
              >
                {String(signal.metadata.severity)}
              </span>
            </div>
          )}

          {/* Impact Percent */}
          {signal.metadata.impactPercent !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Impact:</span>
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{
                    width: `${signal.metadata.impactPercent}%`,
                  }}
                />
              </div>
              <span className="text-gray-600 font-medium">
                {signal.metadata.impactPercent}%
              </span>
            </div>
          )}

          {/* Quote (for review issues) */}
          {signal.metadata.topQuote && (
            <div className="bg-gray-50 p-2 rounded mt-2 italic text-gray-700 border-l-2 border-blue-400">
              "{signal.metadata.topQuote}"
            </div>
          )}

          {/* Search Volume (for keywords) */}
          {signal.metadata.searchVolume !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Search Volume:</span>
              <span className="font-medium">
                {Number(signal.metadata.searchVolume).toLocaleString()}
              </span>
            </div>
          )}

          {/* Difficulty (for keywords) */}
          {signal.metadata.difficulty !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Difficulty:</span>
              <span className="font-medium">
                {signal.metadata.difficulty}/100
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer: Language Badge + Timestamp + Actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
        <div className="flex items-center gap-2">
          {/* Language */}
          <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
            {signal.language.toUpperCase()}
            {signal.is_rtl && " (RTL)"}
          </span>

          {/* Timestamp */}
          <span className="text-xs text-gray-500">
            {new Date(signal.created_at).toLocaleDateString(
              signal.language === "ar" ? "ar-SA" : "en-US",
              {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }
            )}
          </span>
        </div>

        {/* Action Button */}
        {onAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction("apply", signal);
            }}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            Apply
          </button>
        )}
      </div>

      {/* Context ID (debug info) */}
      <div className="mt-2 text-xs text-gray-400">
        <span title={signal.source_context_id}>
          ID: {signal.source_context_id.substring(0, 12)}...
        </span>
      </div>
    </div>
  );
};

export default SignalCard;
