/**
 * Keyword Tracker Staging Button
 *
 * Stages a keyword to the Staging Vault with rank context.
 * Used in: AI Suggested Keywords & Keyword Watchlist Table
 */

"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";

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
  language = "en",
  onStaged,
  variant = "primary",
  size = "sm",
  className,
  label,
}: KeywordTrackerStagingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [staged, setStaged] = useState(false);
  const { showToast } = useToast();

  const isRtl = ["ar", "he", "fa", "ur"].includes(language);

  const handleStage = async () => {
    if (loading || staged) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalType: "keyword",
            content: keyword,
            source: "keyword_tracker",
            sourceAppId: appId,
            language,
            metadata: {
              countryCode: market?.toUpperCase() || "US",
              currentRank,
              previousRank,
              searchVolume,
              difficulty,
              market,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to stage keyword: ${response.status}`);
      }

      const data = await response.json();
      setStaged(true);

      showToast({
        type: "success",
        title: language === "ar" ? "تمت الإضافة بنجاح" : "Keyword Staged",
        message:
          language === "ar"
            ? `تمت إضافة الكلمة المفتاحية "${keyword}" إلى الخزنة`
            : `"${keyword}" staged to vault`,
        duration: 3000,
      });

      onStaged?.();
    } catch (error) {
      console.error("[KeywordTrackerStaging] Error:", error);

      showToast({
        type: "error",
        title: language === "ar" ? "خطأ في الإضافة" : "Failed to Stage",
        message:
          error instanceof Error
            ? error.message
            : language === "ar"
              ? "حدث خطأ. حاول مجددا."
              : "An error occurred. Try again.",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Styling variants
  const variantStyles: Record<string, string> = {
    primary: staged
      ? "bg-emerald-500/20 hover:bg-emerald-500/20 text-emerald-300"
      : "bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300",
    secondary:
      "bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-100",
    ghost: "bg-transparent hover:bg-white/5 text-zinc-300",
  };

  const sizeStyles: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-2.5 text-base",
  };

  const buttonContent = staged ? (
    <>
      <Check className="size-4 shrink-0" />
      <span>{label || (language === "ar" ? "تمت الإضافة" : "Staged")}</span>
    </>
  ) : loading ? (
    <>
      <Loader2 className="size-4 animate-spin shrink-0" />
      <span>{language === "ar" ? "جاري الإضافة..." : "Staging..."}</span>
    </>
  ) : (
    <span>{label || (language === "ar" ? "إضافة إلى الخزنة" : "Stage Keyword")}</span>
  );

  return (
    <button
      onClick={handleStage}
      disabled={loading || staged}
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "rounded-lg font-medium transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      title={label || keyword}
      aria-label={label || keyword}
    >
      {buttonContent}
    </button>
  );
}
