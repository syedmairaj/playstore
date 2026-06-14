"use client";

import React from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StageButtonRefactored } from "@/components/staging/StageButtonRefactored";
import type { IssueSeverity, IssueItem } from "@/lib/gemini/generate-review-analysis";


// ─────────────────────────────────────────────────────────────────────────────
// Severity styling map
// ─────────────────────────────────────────────────────────────────────────────

type SeverityConfig = {
  badge:       string;
  accentColor: string;
  impactColor: string;
  label:       string;
};

const VAULT_SEVERITY: Record<IssueSeverity, "critical" | "medium" | "low"> = {
  CRITICAL: "critical",
  MEDIUM: "medium",
  LOW: "low",
};

const SEVERITY_CONFIG: Record<IssueSeverity, SeverityConfig> = {
  CRITICAL: {
    badge:       "bg-red-500/10 text-red-500 border border-red-500/20",
    accentColor: "bg-red-500",
    impactColor: "text-red-400",
    label:       "Critical",
  },
  MEDIUM: {
    badge:       "bg-amber-500/10 text-amber-500 border border-amber-500/20",
    accentColor: "bg-amber-500",
    impactColor: "text-amber-400",
    label:       "Medium",
  },
  LOW: {
    badge:       "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    accentColor: "bg-blue-500",
    impactColor: "text-blue-400",
    label:       "Low",
  },
};


// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type IssueCardProps = {
  issue:       IssueItem;
  workspaceId: string;
  appId?:      string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function IssueCard({ issue, workspaceId, appId }: IssueCardProps) {
  const locale = useLocale();
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.MEDIUM;
  const impactPct = Math.round(issue.impact * 100);

  return (
    <Card
      className={cn(
        // overflow-visible lets the Tooltip portal escape without clipping.
        // The accent stripe uses rounded-l-xl to respect the card corners.
        "relative overflow-visible border border-zinc-800 bg-zinc-900/50 rounded-xl",
        "text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.06)]",
        "transition-shadow hover:shadow-[0_0_0_1px_rgba(16,185,129,0.14)]",
      )}
    >
      {/* Left accent stripe */}
      <div
        className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", config.accentColor)}
        aria-hidden
      />

      {/* Impact % — top-right */}
      <span
        aria-label={`Impact: ${impactPct}% of sampled reviews mention this issue`}
        className={cn(
          "absolute right-3 top-3 text-[11px] font-medium tabular-nums whitespace-nowrap",
          config.impactColor,
        )}
      >
        Impact: {impactPct}%
      </span>

      <CardHeader className="space-y-2 pb-2 pl-6 pr-16">
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            config.badge,
          )}
        >
          {config.label}
        </span>

        <CardTitle className="text-sm font-semibold leading-snug text-white">
          {issue.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pt-0 pl-6">
        <p className="text-xs leading-relaxed text-zinc-400">{issue.description}</p>

        {issue.quote && (
          <blockquote className="border-l border-zinc-700 pl-3 text-[11px] italic leading-relaxed text-zinc-500">
            &ldquo;{issue.quote}&rdquo;
          </blockquote>
        )}

        {/* ── Staging Vault CTA ── */}
        <StageButtonRefactored
          module="reviews"
          signalType="review_issue"
          content={issue.title}
          source="review_analysis"
          sourceContext="common_issues_theme"
          sourceContextId={issue.id || issue.title}
          workspaceId={workspaceId}
          sourceAppId={appId}
          language={locale === "ar" ? "ar" : "en"}
          metadata={{
            description: issue.description,
            severity: VAULT_SEVERITY[issue.severity] ?? "medium",
            impactPercent: impactPct,
            quote: issue.quote,
          }}
          variant="primary"
          size="md"
          className="mt-1 w-full sm:w-auto"
        />
      </CardContent>
    </Card>
  );
}

