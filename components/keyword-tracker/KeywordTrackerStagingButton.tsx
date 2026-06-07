/**
 * Keyword Tracker Staging Button
 *
 * REFACTORED: Now uses StageButtonRefactored for unified staging across all modules.
 * Stages a keyword to the Staging Vault with rank context.
 * Used in: AI Suggested Keywords & Keyword Watchlist Table
 */

"use client";

import { StageButtonRefactored } from "@/components/staging/StageButtonRefactored";
import { useLocale } from "next-intl";

interface KeywordTrackerStagingButtonProps {
  workspaceId: string;
  appId: string;
  keyword: string;
  currentRank?: number;
  previousRank?: number;
  searchVolume?: number;
  difficulty?: number;
  market?: string;
  language?: string;
  onStaged?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function KeywordTrackerStagingButton({
  workspaceId,
  appId,
  keyword,
  currentRank,
  previousRank,
  searchVolume,
  difficulty,
  market,
  language,
  onStaged,
  variant = "primary",
  size = "sm",
  className,
  label,
}: KeywordTrackerStagingButtonProps) {
  const locale = useLocale();
  const effectiveLanguage = language || locale;

  return (
    <StageButtonRefactored
      module="keyword_tracker"
      signalType="keyword"
      content={keyword}
      source="keyword_tracker"
      sourceContext="keyword_tracker_alert"
      sourceContextId={`${keyword}_${market || "US"}`}
      workspaceId={workspaceId}
      sourceAppId={appId}
      language={effectiveLanguage as "en" | "ar"}
      metadata={{
        countryCode: market?.toUpperCase() || "US",
        currentRank,
        previousRank,
        searchVolume,
        difficulty,
        market,
      }}
      variant={variant}
      size={size}
      className={className}
      label={label || (effectiveLanguage === "ar" ? "إضافة إلى الخزنة" : "Stage Keyword")}
      onStaged={onStaged}
    />
  );
}
