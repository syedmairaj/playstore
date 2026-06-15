"use client";

import React, { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { stageReviewIssueClient } from "@/lib/client/review-insight-staging";
import type { IssueSeverity, IssueItem } from "@/lib/gemini/generate-review-analysis";

type SeverityConfig = {
  badge: string;
  accentColor: string;
  impactColor: string;
  label: string;
};

const SEVERITY_CONFIG: Record<IssueSeverity, SeverityConfig> = {
  CRITICAL: {
    badge: "bg-red-500/10 text-red-500 border border-red-500/20",
    accentColor: "bg-red-500",
    impactColor: "text-red-400",
    label: "Critical",
  },
  MEDIUM: {
    badge: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
    accentColor: "bg-amber-500",
    impactColor: "text-amber-400",
    label: "Medium",
  },
  LOW: {
    badge: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    accentColor: "bg-blue-500",
    impactColor: "text-blue-400",
    label: "Low",
  },
};

export type IssueCardProps = {
  issue: IssueItem;
  workspaceId: string;
  appId?: string;
  packageName: string;
  countryCode: string;
  langCode: string;
  competitorName?: string | null;
  isStaged?: boolean;
  onStaged?: () => void;
};

export function IssueCard({
  issue,
  workspaceId,
  appId,
  packageName,
  countryCode,
  langCode,
  competitorName,
  isStaged = false,
  onStaged,
}: IssueCardProps) {
  const locale = useLocale();
  const t = useTranslations("reviews.commonIssues");
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.MEDIUM;
  const impactPct = Math.round(issue.impact * 100);
  const [staging, setStaging] = useState(false);
  const [staged, setStaged] = useState(isStaged);

  const handleStage = useCallback(async () => {
    if (staged || staging) return;
    setStaging(true);
    try {
      const result = await stageReviewIssueClient(workspaceId, {
        packageName,
        countryCode,
        langCode,
        locale: locale === "ar" ? "ar" : "en",
        appId,
        competitorName: competitorName ?? null,
        sourceType: "common_issues_cluster",
        sourceContextId: issue.id || issue.title,
        issue: {
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          impact: issue.impact,
          quote: issue.quote,
        },
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setStaged(true);
      onStaged?.();
      toast.success(t("addedToActiveContext"));
    } catch {
      toast.error(t("stageFailed"));
    } finally {
      setStaging(false);
    }
  }, [
    appId,
    competitorName,
    countryCode,
    issue,
    langCode,
    locale,
    onStaged,
    packageName,
    staged,
    staging,
    t,
    workspaceId,
  ]);

  return (
    <Card
      className={cn(
        "relative overflow-visible border border-zinc-800 bg-zinc-900/50 rounded-xl",
        "text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.06)]",
        "transition-shadow hover:shadow-[0_0_0_1px_rgba(16,185,129,0.14)]",
      )}
    >
      <div
        className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", config.accentColor)}
        aria-hidden
      />

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

        {staged ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
            <Check className="size-3.5 shrink-0" aria-hidden />
            {t("inActiveContext")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={staging}
            onClick={() => void handleStage()}
            className="mt-1 w-full bg-emerald-600 text-white hover:bg-emerald-500 sm:w-auto"
          >
            {staging ? (
              <>
                <Loader2 className="me-1.5 size-3.5 animate-spin shrink-0" aria-hidden />
                {t("staging")}
              </>
            ) : (
              t("stageIssue")
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
