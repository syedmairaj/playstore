"use client";

import React from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowRight, CheckCircle2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { IssueSeverity, IssueItem } from "@/lib/gemini/generate-review-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline status — drives the CTA state machine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AVAILABLE → user hasn't acted yet
 * STAGED    → successfully POSTed to backlog; nudge them to act on it
 */
export type PipelineStatus = "AVAILABLE" | "STAGED";

// ─────────────────────────────────────────────────────────────────────────────
// Severity styling map
// ─────────────────────────────────────────────────────────────────────────────

type SeverityConfig = {
  badge:       string;
  accentColor: string;
  impactColor: string;
  label:       string;
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
// Pipeline CTA config — one source of truth for every state's copy + style
// ─────────────────────────────────────────────────────────────────────────────

type CtaConfig = {
  label:       string;
  icon:        React.ReactNode;
  className:   string;
  tooltip:     React.ReactNode;
};

const CTA_CONFIG: Record<PipelineStatus, CtaConfig> = {
  AVAILABLE: {
    label: "Add to Optimization Backlog",
    icon:  <PlusCircle className="size-3.5 shrink-0" aria-hidden />,
    className: [
      "bg-emerald-600 text-white",
      "hover:bg-emerald-500 active:bg-emerald-700",
      "border-transparent",
    ].join(" "),
    tooltip: (
      <>
        Save this insight to your workspace backlog.{" "}
        <span className="text-zinc-400">
          Implemented changes are kept for{" "}
          <strong className="text-zinc-200">30 days</strong>; un-implemented
          ideas are stored as active drafts for{" "}
          <strong className="text-zinc-200">90 days</strong>.
        </span>
      </>
    ),
  },
  STAGED: {
    label: "Open in Listing Optimizer →",
    icon:  <ArrowRight className="size-3.5 shrink-0" aria-hidden />,
    className: [
      "bg-zinc-800/80 text-blue-400",
      "hover:bg-zinc-700/80 hover:text-blue-300 active:bg-zinc-900",
      "border border-zinc-700",
    ].join(" "),
    tooltip: (
      <>
        <span className="flex items-center gap-1.5 font-medium text-emerald-400 mb-1">
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          Insight saved to your backlog.
        </span>
        <span className="text-zinc-400">
          Open the Listing Optimizer to rewrite your store metadata and exploit
          this vulnerability — the fastest path to improving conversion rank.
        </span>
      </>
    ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type IssueCardProps = {
  issue:       IssueItem;
  /** workspaceId — used to build the listing-optimizer deep-link in STAGED state. */
  workspaceId: string;
  /**
   * appId — when provided, appended as ?appId= to the listing-optimizer deep-link
   * so the optimizer pre-selects the correct app and loads its queue immediately.
   */
  appId?:      string;
  /** Whether this issue has already been added (initialises state to STAGED). */
  added:       boolean;
  /** Async handler that POSTs to /api/workspaces/[id]/backlog.  Returns true on success. */
  onAdd:       () => Promise<boolean>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function IssueCard({ issue, workspaceId, appId, added, onAdd }: IssueCardProps) {
  const router = useRouter();
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.MEDIUM;
  const impactPct = Math.round(issue.impact * 100);

  // Pipeline state — initialised from prop so hydration matches server render.
  const [status, setStatus] = React.useState<PipelineStatus>(
    added ? "STAGED" : "AVAILABLE",
  );
  const [busy, setBusy] = React.useState(false);

  const cta = CTA_CONFIG[status];

  async function handleClick() {
    if (busy) return;

    if (status === "STAGED") {
      // STAGED → navigate to listing optimizer, pre-selecting the app so the
      // queue is immediately visible without the user having to pick an app.
      const qs = appId ? `?appId=${encodeURIComponent(appId)}` : "";
      router.push(`/app/${workspaceId}/listing-optimizer${qs}`);
      return;
    }

    // AVAILABLE → fire the backlog POST
    setBusy(true);
    try {
      const ok = await onAdd();
      if (ok) setStatus("STAGED");
    } finally {
      setBusy(false);
    }
  }

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

        {/* ── Pipeline CTA ── */}
        <TooltipProvider delayDuration={400}>
          <TooltipRoot>
            <TooltipTrigger asChild>
              {/*
               * <span> is the tooltip anchor + click target.
               * The inner visual button has pointer-events-none so Radix Slot
               * doesn't compete with it for event ownership, and disabled buttons
               * don't swallow hover events that would silence the tooltip.
               */}
              <span
                role="button"
                tabIndex={0}
                aria-busy={busy}
                onClick={handleClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleClick();
                }}
                className={cn(
                  "mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-1.5",
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
                  "sm:w-auto",
                  busy && "opacity-60 cursor-wait",
                  cta.className,
                )}
              >
                {busy ? (
                  <svg
                    className="size-3.5 animate-spin shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                ) : (
                  cta.icon
                )}
                {busy ? "Saving…" : cta.label}
              </span>
            </TooltipTrigger>

            <TooltipContent side="top" className="max-w-[260px]">
              {cta.tooltip}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

