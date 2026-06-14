"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Calendar, Inbox, Info, Loader2, MessageSquareQuote, RefreshCw, Sparkles, Trash2, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewsTab } from "@/components/reviews/ReviewsTab";
import { IssueCard } from "@/components/reviews/IssueCard";
import { SyncInsightsCta } from "@/components/reviews/sync-insights-cta";
import { AiCreditsModal } from "@/components/ui/ai-credits-modal";
import { AppSourceSelector, type AppSourceOption } from "@/components/reviews/AppSourceSelector";
import type { WorkspaceAppListRow } from "@/lib/workspace/workspace-apps-list";
import type { ReviewRow } from "@/components/reviews/reviews-types";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips trailing app-store platform labels from competitor display names so
 * tab labels stay clean (e.g. "MyFitnessPal: Calorie Counter" not
 * "MyFitnessPal: Calorie Counter - Apps on Google Play").
 */
function stripStorePlatformSuffix(name: string): string {
  return name
    .replace(/\s*[-–—]\s*(Apps on Google Play|Google Play|iOS App Store|App Store)\s*$/i, "")
    .trim();
}

/**
 * Derives the primary market country code from the workspace's configured
 * target_countries list.  Falls back to "us" when unset or malformed.
 *
 * The sync route accepts any ISO 3166-1 alpha-2 string and passes it to
 * google-play-scraper, so we only need to normalise to lowercase two-char form.
 */
function primaryCountryCode(app: WorkspaceAppListRow | undefined): string {
  const first = app?.target_countries?.[0];
  if (typeof first === "string") {
    const cc = first.trim().toLowerCase();
    if (cc.length === 2) return cc;
  }
  return "us";
}

/**
 * Client-side mirror of country-lang-map.ts for the primary (first) hl only.
 *
 * Used as a fallback when the sync route response does not include a `langs`
 * array — e.g. the fetch failed or returned no reviews but we still need to
 * know which lang the cache probe should use so the panel can show the lock
 * banner rather than being stuck at "idle" indefinitely.
 *
 * Only the primary lang is needed here; the full ordered list lives server-side
 * in country-lang-map.ts (server-only, not importable in a client component).
 */
const COUNTRY_PRIMARY_LANG: Record<string, string> = {
  // Asia Pacific
  in: "en", jp: "ja", kr: "ko", cn: "zh-CN", tw: "zh-TW",
  th: "th", vn: "vi", id: "id",
  // Middle East / MENA
  ae: "en", sa: "en", eg: "ar", tr: "tr",
  // Europe
  de: "de", fr: "fr", es: "es", it: "it", nl: "nl",
  pl: "pl", ru: "ru", pt: "pt-PT", se: "sv", no: "no",
  dk: "da", fi: "fi",
  // Americas
  us: "en", gb: "en", au: "en", ca: "en",
  br: "pt-BR", mx: "es", ar: "es", co: "es",
};

/**
 * Returns the primary BCP-47 language tag for a given ISO 3166-1 alpha-2
 * country code.  Mirrors the first entry in COUNTRY_LANG_MAP from
 * country-lang-map.ts.  Falls back to "en".
 */
function primaryLangForCountry(countryCode: string): string {
  return COUNTRY_PRIMARY_LANG[countryCode.toLowerCase()] ?? "en";
}


/**
 * Converts an ISO 8601 timestamp into a human-readable relative label.
 * e.g. "just now" | "3 hours ago" | "2 days ago" | "5 days ago"
 */
function formatRelativeTime(isoString: string): string {
  const diffMs   = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2)   return "just now";
  if (diffMins < 60)  return `${diffMins} minutes ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  const diffDays  = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

/** Shared tooltip copy for the 7-day cache policy. */
const CACHE_POLICY_TOOLTIP =
  "This analysis is securely cached for 7 days. You can browse, read, and cross-reference this data completely free of charge during this duration. Use the Re-Analyze action only if you need to force a fresh real-time scan of live store reviews.";

// ─────────────────────────────────────────────────────────────────────────────
// CommonIssuesPanel — self-contained, remounts on every tab switch
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CommonIssuesPanel types
// ─────────────────────────────────────────────────────────────────────────────

type CommonIssuesPanelProps = {
  workspaceId: string;
  packageName: string;    // Android package id for this tab
  countryCode: string;    // ISO 3166-1 alpha-2 market, e.g. "us"
  langCode: string;       // primary BCP-47 lang for this market, e.g. "en"
  reviewTexts: string[];  // ≤2★ review bodies from parent’s live sync
  /**
   * Count of ≤2★ reviews already scraped for this tab.
   * Passed from the parent so the paywall card can show a data-driven badge
   * (or a disabled fallback button) before the user spends credits.
   * Equals reviewTexts.length at render time.
   */
  rawReviewCount: number;
  /**
   * true while the parent’s sync fetch for this tab is still in flight.
   * Used to differentiate "sync pending" (spinner label) from "sync done,
   * genuinely zero reviews" (permanent disabled button label).
   */
  isSyncLoading: boolean;
  /**
   * Titles of backlog items that are staged (isImplemented=false).
   * Drives IssueCard.added — if the title is in this set the card shows
   * "Open in Listing Optimizer →" instead of "Add to Optimization Backlog".
   * Derived from backlogItems (DB) so it is always correct after page refresh.
   * Optimistic adds are reflected here via the parent's stagedTitles memo.
   */
  stagedTitles: ReadonlySet<string>;
  /**
   * appId of the workspace's own app — passed to IssueCard so the "Open in
   * Listing Optimizer" deep-link appends ?appId= and pre-selects the app.
   */
  appId?: string;
  /**
   * Titles of ALL backlog items (staged + archived).
   * IssueCards whose title matches are hidden from Active Insights entirely —
   * they live in the queue or history archive, not here.
   */
  excludeTitles?: ReadonlySet<string>;
  /** Called with the dedup key AND the full IssueItem so the parent can POST to the backlog API.
   *  Returns true on success so IssueCard can advance its pipeline state. */
  onAddImprovement: (id: string, issue: IssueItem) => Promise<boolean>;
};

/** Flat shape returned by both GET and POST /reviews/analyze */
type AnalyzeResponse = {
  success?: boolean;
  hasBeenAnalyzed?: boolean;
  insights?: IssueItem[];
  /** ISO 8601 timestamp of when the cached result was last written. Present on hasBeenAnalyzed=true responses. */
  updatedAt?: string;
  /** Only present on GET cache-miss responses (hasBeenAnalyzed=false). */
  rawReviewCount?: number;
  bridge?: { savedCount: number };
  usage?: { monthlyUsed: number; monthlyLimit: number };
  error?: {
    code?: string;
    message?: string;
    remaining?: number;
    topUpRequired?: boolean;
    monthlyUsed?: number;
    monthlyLimit?: number;
  };
};

type ReviewUsageSnapshot = {
  creditCost: number;
  monthlyUsed: number;
  monthlyLimit: number;
  creditsRemaining: number | null;
  workspacePlan: string;
  resetsAt?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// CommonIssuesPanel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CommonIssuesPanel — self-contained state machine for the Common Issues section.
 *
 * State variables (explicit booleans, not an enum) match the backend contract:
 *
 *   isLoading        true while the GET cache probe or POST Gemini call is in flight
 *   hasBeenAnalyzed  mirrors json.hasBeenAnalyzed — the sole paywall gate
 *   insights         mirrors json.insights — [] until analysis completes
 *   isAnalyzing      true only while the POST is in flight (distinct from probe loading)
 *
 * Flush hook: when packageName or countryCode changes, all state is instantly
 * reset to the initial "loading" baseline before the new probe fires. This
 * prevents stale data from a prior tab bleeding into the next tab’s render.
 *
 * Render matrix (evaluated top-to-bottom, first match wins):
 *
 *   isLoading === true
 *     → STATE A: animated spinner ("Checking for cached analysis…")
 *
 *   isAnalyzing === true
 *     → STATE A′: emerald spinner ("AI is analysing competitive gaps…")
 *
 *   hasBeenAnalyzed === false
 *     → STATE B: paywall banner ("Unlock Competitive Vulnerability Mapping")
 *                button disabled when reviewTexts=[] (reviews still loading)
 *
 *   hasBeenAnalyzed === true AND insights.length === 0
 *     → STATE C: "No Pain-Point Clusters Found" alert container
 *
 *   hasBeenAnalyzed === true AND insights.length > 0
 *     → STATE D: IssueCard grid
 */
function CommonIssuesPanel({
  workspaceId,
  packageName,
  countryCode,
  langCode,
  reviewTexts,
  rawReviewCount,
  isSyncLoading,
  stagedTitles,
  appId,
  excludeTitles,
  onAddImprovement,
}: CommonIssuesPanelProps) {
  const tSync = useTranslations("reviews.syncInsights");
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [isLoading, setIsLoading]               = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing]           = useState<boolean>(false);
  const [hasBeenAnalyzed, setHasBeenAnalyzed]   = useState<boolean>(false);
  const [insights, setInsights]                 = useState<IssueItem[]>([]);
  /** ISO 8601 string of the last Gemini write — null until first hasBeenAnalyzed=true */
  const [analysedAt, setAnalysedAt]             = useState<string | null>(null);
  const [usage, setUsage] = useState<ReviewUsageSnapshot>({
    creditCost: 3,
    monthlyUsed: 0,
    monthlyLimit: 5,
    creditsRemaining: null,
    workspacePlan: "free",
    resetsAt: undefined,
  });
  const [topUpOpen, setTopUpOpen] = useState(false);

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/reviews/usage`, {
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        creditCost?: number;
        monthlyUsed?: number;
        monthlyLimit?: number;
        creditsRemaining?: number | null;
        workspacePlan?: string;
        resetsAt?: string;
      };
      if (!json.ok) return;
      setUsage({
        creditCost: json.creditCost ?? 3,
        monthlyUsed: json.monthlyUsed ?? 0,
        monthlyLimit: json.monthlyLimit ?? 5,
        creditsRemaining: json.creditsRemaining ?? null,
        workspacePlan: json.workspacePlan ?? "free",
        resetsAt: json.resetsAt,
      });
    } catch {
      /* non-fatal */
    }
  }, [workspaceId]);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage, packageName, countryCode]);

  // ── State flushing hook ────────────────────────────────────────────────────
  //
  // Fires synchronously whenever packageName or countryCode changes (i.e. the
  // user switches to a different competitor tab or the workspace market changes).
  //
  // Instantly clears all state values so the UI never shows stale data from the
  // previous tab while the new cache probe is in flight.
  useEffect(() => {
    setInsights([]);
    setHasBeenAnalyzed(false);
    setIsAnalyzing(false);
    setIsLoading(true);
    setAnalysedAt(null);
  }, [packageName, countryCode]);

  // ── Cache probe — fires after every flush ─────────────────────────────────
  //
  // GET /reviews/analyze?packageName=…&langCode=…&country=…
  //
  // Depends on packageName and countryCode so it re-runs whenever the flush
  // hook resets state. AbortController cancels mid-flight fetches when the
  // user switches tabs again before the probe completes.
  //
  // Response shape: flat { success, hasBeenAnalyzed, insights }
  //   hasBeenAnalyzed=false → STATE B (paywall)
  //   hasBeenAnalyzed=true  → STATE C or D depending on insights.length
  useEffect(() => {
    if (!packageName) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const url =
          `/api/workspaces/${workspaceId}/reviews/analyze` +
          `?packageName=${encodeURIComponent(packageName)}` +
          `&langCode=${encodeURIComponent(langCode)}` +
          `&country=${encodeURIComponent(countryCode)}`;

        const res = await fetch(url, {
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const json = (await res.json()) as AnalyzeResponse;

        if (!json.success) {
          // Auth / server error — show paywall as safe fallback; never blank
          setHasBeenAnalyzed(false);
          setIsLoading(false);
          return;
        }

        // Read the authoritative flag directly from the response
        const analyzed = json.hasBeenAnalyzed === true;
        const rows     = Array.isArray(json.insights) ? json.insights : [];

        setHasBeenAnalyzed(analyzed);
        setInsights(analyzed ? rows : []);
        if (analyzed && json.updatedAt) setAnalysedAt(json.updatedAt);
        setIsLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Network error — safe fallback to paywall
        setHasBeenAnalyzed(false);
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [workspaceId, packageName, langCode, countryCode]);

  // ── runAnalysis — Sync Insights / Re-Analyze (POST /reviews/analyze) ─────
  const runAnalysis = useCallback(
    async (force = false) => {
      if (reviewTexts.length === 0) return;

      setIsAnalyzing(true);
      setIsLoading(false);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/reviews/analyze`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageName,
            langCode,
            country: countryCode,
            reviewTexts,
            force,
          }),
        });

        const json = (await res.json()) as AnalyzeResponse;

        if (!json.success) {
          if (
            json.error?.code === "insufficient_credits" ||
            res.status === 402
          ) {
            setTopUpOpen(true);
            toast.error(tSync("insufficientCredits"));
          } else if (json.error?.code === "monthly_limit_reached") {
            setUsage((prev) => ({
              ...prev,
              monthlyUsed: json.error?.monthlyUsed ?? prev.monthlyUsed,
              monthlyLimit: json.error?.monthlyLimit ?? prev.monthlyLimit,
            }));
            toast.error(tSync("monthlyLimitReached", {
              used: json.error.monthlyUsed ?? usage.monthlyUsed,
              limit: json.error.monthlyLimit ?? usage.monthlyLimit,
            }));
          } else {
            toast.error(json.error?.message ?? tSync("analysisFailed"));
          }
          setIsAnalyzing(false);
          if (!force) setHasBeenAnalyzed(false);
          return;
        }

        if (!json.hasBeenAnalyzed) {
          setIsAnalyzing(false);
          setHasBeenAnalyzed(false);
          return;
        }

        const rows = Array.isArray(json.insights) ? json.insights : [];
        setInsights(rows);
        setHasBeenAnalyzed(true);
        if (json.updatedAt) setAnalysedAt(json.updatedAt);
        setIsAnalyzing(false);

        if (json.usage) {
          setUsage((prev) => ({
            ...prev,
            monthlyUsed: json.usage!.monthlyUsed,
            monthlyLimit: json.usage!.monthlyLimit,
          }));
        } else {
          void refreshUsage();
        }

        if (rows.length > 0) {
          toast.success(tSync("syncSuccess"));
        }

        if (json.bridge && json.bridge.savedCount > 0) {
          toast.success(
            tSync("bridgeSuccess", { count: json.bridge.savedCount }),
          );
        }
      } catch {
        toast.error(tSync("networkError"));
        setIsAnalyzing(false);
        if (!force) setHasBeenAnalyzed(false);
      }
    },
    [
      workspaceId,
      packageName,
      langCode,
      countryCode,
      reviewTexts,
      refreshUsage,
      tSync,
      usage.monthlyLimit,
    ],
  );

  const handleReveal = useCallback(() => void runAnalysis(false), [runAnalysis]);
  const handleReAnalyze = useCallback(() => void runAnalysis(true), [runAnalysis]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render — strict top-to-bottom condition matrix
  // ─────────────────────────────────────────────────────────────────────────

  // ── STATE A: Loading — cache probe in flight ───────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0a0e14] px-4 py-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-emerald-400/60" aria-hidden />
        <p className="text-xs text-zinc-500">Checking for cached analysis…</p>
      </div>
    );
  }

  // ── STATE A′: Analyzing — POST + Gemini in flight ─────────────────────────
  if (isAnalyzing) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-emerald-400" aria-hidden />
        <p className="text-xs text-emerald-300/80">
          AI is analysing competitive gaps — this takes a few seconds…
        </p>
      </div>
    );
  }

  // ── STATE B: hasBeenAnalyzed === false — paywall ───────────────────────────
  //
  // Three sub-variants based on rawReviewCount (= activeLowRatingTexts.length):
  //
  //   rawReviewCount === 0 AND sync still loading (reviewTexts just arrived as [])
  //     → "Waiting for reviews…" disabled button — sync in flight
  //
  //   rawReviewCount === 0 AND sync complete (reviews arrived, genuinely none)
  //     → "No Recent Reviews Found in This Market" disabled button — can’t run
  //
  //   rawReviewCount  > 0
  //     → Active button + "📊 Found N negative reviews waiting for semantic analysis" badge
  if (!hasBeenAnalyzed) {
    const hasReviews = rawReviewCount > 0;

    return (
      <>
        <SyncInsightsCta
          isRtl={isRtl}
          isSyncLoading={isSyncLoading}
          isAnalyzing={isAnalyzing}
          hasReviews={hasReviews}
          rawReviewCount={rawReviewCount}
          creditCost={usage.creditCost}
          monthlyUsed={usage.monthlyUsed}
          monthlyLimit={usage.monthlyLimit}
          creditsRemaining={usage.creditsRemaining}
          onSyncInsights={handleReveal}
        />
        <AiCreditsModal
          open={topUpOpen}
          onOpenChange={setTopUpOpen}
          balance={usage.creditsRemaining ?? 0}
          variant={(usage.creditsRemaining ?? 0) === 0 ? "empty" : "low"}
          workspacePlan={usage.workspacePlan}
          workspaceId={workspaceId}
        />
      </>
    );
  }

  // ── Shared values for STATE C + STATE D ─────────────────────────────────────
  const freshnessLabel = analysedAt ? formatRelativeTime(analysedAt) : "recently";
  const canReAnalyze   = reviewTexts.length > 0;

  // ── Shared sub-footer — rendered identically in STATE C and STATE D ─────────
  //
  // Left:  "📅 Analysis Freshness: [relative time]"  +  Radix Tooltip on Info icon
  // Right: "🔄 Re-Analyze (3 Credits)"  outline button — POSTs { force: true }
  //
  // TooltipProvider is scoped to this footer so it doesn't conflict with any
  // parent provider higher in the tree.
  const FreshnessFooter = (
    <TooltipProvider delayDuration={150}>
      <div className="flex w-full items-center justify-between border-t border-zinc-900 mt-6 pt-4">

        {/* ── Left: freshness label + policy tooltip ── */}
        <Tooltip
          side="top"
          className="max-w-[300px]"
          content={CACHE_POLICY_TOOLTIP}
          asChild
        >
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 whitespace-nowrap cursor-help">
            <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span>
              Data updated:{" "}
              <span className="font-medium text-zinc-300">
                {freshnessLabel.charAt(0).toUpperCase() + freshnessLabel.slice(1)}
              </span>
            </span>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-400 cursor-help shrink-0 transition-colors" />
            </TooltipTrigger>
          </div>
        </Tooltip>

        {/* ── Right: Re-Analyze CTA ── */}
        <SyncInsightsCta
          variant="compact"
          showReAnalyze
          isRtl={isRtl}
          isAnalyzing={isAnalyzing}
          hasReviews={canReAnalyze}
          rawReviewCount={reviewTexts.length}
          creditCost={usage.creditCost}
          monthlyUsed={usage.monthlyUsed}
          monthlyLimit={usage.monthlyLimit}
          creditsRemaining={usage.creditsRemaining}
          onSyncInsights={handleReveal}
          onReAnalyze={handleReAnalyze}
        />
      </div>
    </TooltipProvider>
  );

  const topUpModal = (
    <AiCreditsModal
      open={topUpOpen}
      onOpenChange={setTopUpOpen}
      balance={usage.creditsRemaining ?? 0}
      variant={(usage.creditsRemaining ?? 0) === 0 ? "empty" : "low"}
      workspacePlan={usage.workspacePlan}
      workspaceId={workspaceId}
    />
  );

  // ── STATE C: hasBeenAnalyzed === true AND insights.length === 0 ────────────
  // Gemini ran but found no clusters — review volume too low to surface patterns.
  if (insights.length === 0) {
    return (
      <div>
        <div className="flex flex-col items-center gap-3 rounded-t-2xl border border-b-0 border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-zinc-700/60 bg-zinc-800/80 text-zinc-500">
            <Inbox className="size-6" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-zinc-200">
              No Pain-Point Clusters Found
            </p>
            <p className="max-w-md text-xs leading-relaxed text-zinc-500">
              AI analysis ran but found no clear pain-point clusters in this
              app&apos;s recent 1–2★ reviews for this market. This typically means
              review volume is too low to surface patterns. Check back after more
              reviews arrive.
            </p>
          </div>
        </div>
        {FreshnessFooter}
        {topUpModal}
      </div>
    );
  }

  // ── STATE D: hasBeenAnalyzed === true AND insights.length > 0 ─────────────
  // Full IssueCard grid — titles, descriptions, severity badges, impact metrics.
  //
  // excludeTitles filters out insights whose title matches an archived backlog
  // item so there is no duplication between Active Insights and History Archive.
  // When the user restores from archive the title disappears from excludeTitles
  // and the card reappears here automatically.
  const visibleInsights = excludeTitles && excludeTitles.size > 0
    ? insights.filter((issue) => !excludeTitles.has(issue.title))
    : insights;

  if (visibleInsights.length === 0) {
    // All insights are currently in the archive — show a gentle nudge.
    return (
      <div>
        <div className="flex flex-col items-center gap-3 rounded-t-2xl border border-b-0 border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-zinc-700/60 bg-zinc-800/80 text-emerald-500">
            <Inbox className="size-6" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-zinc-200">
              All Insights Moved to History Archive
            </p>
            <p className="max-w-md text-xs leading-relaxed text-zinc-500">
              Every identified pain point has been exploited and moved to your
              Optimization History Archive. Switch to the archive tab to review
              or restore any item.
            </p>
          </div>
        </div>
        {FreshnessFooter}
        {topUpModal}
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleInsights.map((issue, idx) => {
          // Key is scoped to package + country + position so it is unique across
          // all tabs and survives re-ordering in future without collisions.
          const issueId = `${packageName}:${countryCode}:${idx}`;
          return (
            <IssueCard
              key={issueId}
              issue={issue}
              workspaceId={workspaceId}
              appId={appId}
              added={stagedTitles.has(issue.title)}
              onAdd={() => onAddImprovement(issueId, issue)}
            />
          );
        })}
      </div>
      {FreshnessFooter}
      {topUpModal}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared parent types
// ─────────────────────────────────────────────────────────────────────────────



function RatingSparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return <span className="text-xs text-zinc-500">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.08, max - min);
  return (
    <div className="flex h-10 max-w-[140px] items-end gap-0.5" aria-hidden title={label}>
      {values.map((v, i) => {
        const norm = (v - min) / span;
        const h = 8 + norm * 24;
        return (
          <div
            key={`${i}-${v}`}
            className="w-1.5 shrink-0 rounded-sm bg-emerald-500/80 ring-1 ring-emerald-400/15"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RatingGauge — semi-circle SVG arc gauge for Card 1
// ─────────────────────────────────────────────────────────────────────────────
//
// Canvas: 80 × 48 px (viewBox matches).
// The semicircle sits centred horizontally.  cx=40, cy=44, r=36.
// It arcs from the bottom-left (4, 44) over the top to bottom-right (76, 44).
//
// Arc path (sweep-flag=1 = clockwise = fills left→right as rating rises):
//   M 4 44   → start at left endpoint  (cx - r, cy)
//   A 36 36 0 0 1 76 44 → sweep clockwise to right endpoint (cx + r, cy)
//
// Arc length = π × r = π × 36 ≈ 113.1 px
//
// stroke-dashoffset drives fill:
//   offset = arcLen × (1 − rating / 5)
//   4.1★  → offset = 113.1 × (1 − 4.1/5) ≈ 20.4  (arc ~82% filled)
//
// Entrance animation: ref-driven reset to arcLen → transition to target,
// same pattern as CreditDonutGauge which is confirmed working.

const G_CX  = 40;
const G_CY  = 44;
const G_R   = 36;
const G_LEN = Math.PI * G_R;                          // ≈ 113.1
const G_PATH = `M ${G_CX - G_R} ${G_CY} A ${G_R} ${G_R} 0 0 1 ${G_CX + G_R} ${G_CY}`;

type RatingGaugeProps = {
  rating: number | null;   // 0–5, or null = not live
  shimmer: boolean;
};

function RatingGauge({ rating, shimmer }: RatingGaugeProps) {
  const fillRef  = useRef<SVGPathElement>(null);
  const isLive   = rating !== null;
  const safe     = Math.max(0, Math.min(5, rating ?? 0));
  const target   = G_LEN * (1 - safe / 5);

  const color = !isLive ? "#71717a"
    : safe >= 4 ? "#10b981"
    : safe >= 3 ? "#f59e0b"
    : "#f43f5e";

  // Animate fill path from empty → target whenever rating changes
  useEffect(() => {
    const el = fillRef.current;
    if (!el || !isLive) return;
    el.style.transition = "none";
    el.style.strokeDashoffset = String(G_LEN);
    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1), stroke 0.35s ease";
      el.style.strokeDashoffset = String(target);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, isLive]);

  return (
    <svg
      width="80" height="48"
      viewBox="0 0 80 48"
      fill="none"
      aria-hidden
      style={{ opacity: shimmer ? 0.35 : 1, transition: "opacity 0.3s ease" }}
    >
      {/* Track */}
      <path d={G_PATH} stroke="rgba(255,255,255,0.08)" strokeWidth="7" strokeLinecap="round" />

      {/* Live fill */}
      {isLive && (
        <path
          ref={fillRef}
          d={G_PATH}
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={G_LEN}
          strokeDashoffset={G_LEN}   // JS overrides post-mount
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
      )}

      {/* Zero-state dashed overlay */}
      {!isLive && (
        <path d={G_PATH} stroke="rgba(113,113,122,0.35)" strokeWidth="5"
          strokeLinecap="round" strokeDasharray="5 4" />
      )}

      {/* Star scale ticks at 1★ intervals */}
      {[1, 2, 3, 4, 5].map((star) => {
        const angle = Math.PI * (1 - (star - 1) / 4); // 180°→0° left to right
        const tx = G_CX - G_R * Math.cos(angle);
        const ty = G_CY - G_R * Math.sin(angle);
        return (
          <circle key={star} cx={tx} cy={ty} r="1.5"
            fill="rgba(255,255,255,0.18)" />
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SentimentDonut — full-circle ring for Card 3
// ─────────────────────────────────────────────────────────────────────────────
//
// Canvas: 64 × 64 px.  cx=32, cy=32, r=26.
// circumference = 2π × 26 ≈ 163.36 px
// Rotated –90° so arc starts at 12 o'clock.
// strokeWidth=7 makes the ring visually prominent at 64px.
//
// Entrance animation: same ref → reset → rAF → transition pattern.

const D_CX = 32;
const D_CY = 32;
const D_R  = 26;
const D_C  = 2 * Math.PI * D_R;   // ≈ 163.36

type SentimentDonutProps = {
  pct: number | null;   // 0–100, or null = not live
  shimmer: boolean;
};

function SentimentDonut({ pct, shimmer }: SentimentDonutProps) {
  const fillRef = useRef<SVGCircleElement>(null);
  const isLive  = pct !== null;
  const safe    = Math.max(0, Math.min(100, pct ?? 0));
  const target  = D_C - (D_C * safe) / 100;

  useEffect(() => {
    const el = fillRef.current;
    if (!el || !isLive) return;
    el.style.transition = "none";
    el.style.strokeDashoffset = String(D_C);
    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)";
      el.style.strokeDashoffset = String(target);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, isLive]);

  return (
    <svg
      width="64" height="64"
      viewBox="0 0 64 64"
      aria-hidden
      style={{
        transform: "rotate(-90deg)",
        opacity: shimmer ? 0.35 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* Track ring */}
      <circle cx={D_CX} cy={D_CY} r={D_R}
        fill="none"
        stroke={isLive ? "rgba(255,255,255,0.08)" : "rgba(113,113,122,0.2)"}
        strokeWidth="7"
        strokeDasharray={isLive ? undefined : "5 4"}
      />

      {/* Emerald fill — animated */}
      {isLive && (
        <circle
          ref={fillRef}
          cx={D_CX} cy={D_CY} r={D_R}
          fill="none"
          stroke="#10b981"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={D_C}
          strokeDashoffset={D_C}   // JS overrides
          style={{ filter: "drop-shadow(0 0 5px #10b98166)" }}
        />
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source review cache types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keyed map of fetched reviews, indexed by source identifier:
 *   "my-app"       → primary app's live reviews
 *   "<packageId>"  → that competitor's live reviews
 *
 * Storing results in a map guarantees that data from one source can never
 * bleed into another tab.
 */
type ReviewsBySource = Record<string, ReviewRow[]>;

/**
 * Tracks which hl (language) passes were used for each source.
 * Populated from the `langs` field in the sync route response.
 *   "my-app"       → e.g. ["en"] or ["en", "ar"] for UAE workspaces
 *   "<packageId>"  → same, keyed per competitor
 */
type LangsBySource = Record<string, string[]>;

/** Parallel loading-state map keyed by the same source identifiers. */
type LoadingBySource = Record<string, boolean>;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewsClientProps = {
  workspaceId: string;
  apps: WorkspaceAppListRow[];
  appsLoadError?: string | null;
};

export function ReviewsClient({ workspaceId, apps, appsLoadError }: ReviewsClientProps) {
  const t = useTranslations("reviews");
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  // ── Backlog queue state ──────────────────────────────────────────────────
  // Mirrors workspace_listing_backlog — active (not implemented) + archived (implemented)
  type BacklogItem = {
    id: string;
    packageName: string;
    countryCode: string;
    issueTitle: string;
    issueDescription: string;
    severity: "CRITICAL" | "MEDIUM" | "LOW";
    impact: number;        // 0.0–1.0
    isImplemented: boolean;
    createdAt: string;
    updatedAt: string;
  };
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [backlogError, setBacklogError] = useState(false);
  // "active" = Active Insights tab, "archive" = Optimization History Archive tab
  const [insightsTab, setInsightsTab] = useState<"active" | "archive">("active");
  // Per-item busy state for stage-exploit / restore buttons
  const [backlogBusy, setBacklogBusy] = useState<Record<string, boolean>>({});

  // App selector — "my-app" | competitor packageId
  const [selectedAppFilter, setSelectedAppFilter] = useState<string>("my-app");
  const [competitorOptions, setCompetitorOptions] = useState<AppSourceOption[]>([]);
  const [competitorsLoading, setCompetitorsLoading] = useState(true);

  // Per-source review state — one independent bucket per packageId / "my-app"
  const [reviewsBySource, setReviewsBySource] = useState<ReviewsBySource>({});
  const [langsBySource, setLangsBySource] = useState<LangsBySource>({});
  const [loadingBySource, setLoadingBySource] = useState<LoadingBySource>({});
  // fetchedSources intentionally removed — langsBySource itself serves as the
  // dedup guard (if langsBySource[sourceId] exists, sync already completed).
  // This avoids the React Strict Mode double-invoke problem where a ref written
  // before the async work persists through cleanup, blocking the second mount.

  // ── Fix 1: derive geo-country from workspace target_countries ──────────────
  // primaryCountryCode reads apps[0].target_countries[0], normalises to
  // lowercase two-char ISO code, and falls back to "us".  This value is
  // appended as &country=<cc> on every sync URL so the scraper returns reviews
  // native to the workspace's configured market rather than always defaulting
  // to the US store.
  const countryCode = useMemo(() => primaryCountryCode(apps[0]), [apps]);

  // ── Competitors list ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/competitors`, {
          credentials: "same-origin",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          competitors?: {
            id: string;
            displayName: string;
            packageId: string;
            iconUrl?: string | null;
          }[];
        };
        if (!cancelled && json.ok && Array.isArray(json.competitors)) {
          setCompetitorOptions(
            json.competitors.map((c) => ({
              id: c.packageId,
              label: stripStorePlatformSuffix(c.displayName),
              packageId: c.packageId,
              iconUrl: c.iconUrl ?? null,
            })),
          );
        }
      } catch {
        // silently ignore — filter just won't show competitors
      } finally {
        if (!cancelled) setCompetitorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // ── Primary app reviews — geo-localized ───────────────────────────────────
  // Dedup guard: if langsBySource["my-app"] already exists the sync ran — skip.
  // This is Strict Mode-safe: unlike a ref written before the async work, state
  // persists through cleanup+remount so the second mount correctly bails out.
  // AbortController handles cleanup so the fetch is cancelled on unmount without
  // blocking the finally block from writing langsBySource on the successful run.
  useEffect(() => {
    const app = apps[0];
    const packageName =
      typeof app?.package_name === "string" && app.package_name.trim()
        ? app.package_name.trim()
        : null;
    // Skip if no package name configured, or sync already completed for this source
    if (!packageName || langsBySource["my-app"]) return;

    const controller = new AbortController();
    setLoadingBySource((prev) => ({ ...prev, "my-app": true }));

    void (async () => {
      let resolvedLangs: string[] | null = null;
      try {
        const url =
          `/api/workspaces/${workspaceId}/reviews/sync` +
          `?appId=${encodeURIComponent(app.id)}` +
          `&country=${encodeURIComponent(countryCode)}` +
          `&num=100`;

        const res = await fetch(url, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { reviews?: ReviewRow[]; langs?: string[] };
        };

        resolvedLangs = Array.isArray(json.data?.langs) ? json.data!.langs! : null;

        if (json.ok && Array.isArray(json.data?.reviews)) {
          setReviewsBySource((prev) => ({ ...prev, "my-app": json.data!.reviews! }));
        }
      } catch (err) {
        // AbortError = cleanup fired before response — do not write state
        if (err instanceof Error && err.name === "AbortError") return;
        // Any other network error: fall through to finally, write lang fallback
      } finally {
        // Only write state when the fetch was not aborted.
        // AbortError returns early above, so reaching here means the fetch completed.
        const langs = resolvedLangs ?? [primaryLangForCountry(countryCode)];
        setLangsBySource((prev) => ({ ...prev, "my-app": langs }));
        setLoadingBySource((prev) => ({ ...prev, "my-app": false }));
      }
    })();

    return () => controller.abort();
  }, [workspaceId, apps, countryCode, langsBySource]);

  // ── Competitor reviews — geo-localized, lazy, per packageId ──────────────
  // Dedup guard: if langsBySource[sourceId] already exists the sync ran — skip.
  // Same Strict Mode-safe pattern as the primary-app effect above.
  useEffect(() => {
    if (selectedAppFilter === "my-app") return;
    const sourceId = selectedAppFilter;
    // Skip if sync already completed for this competitor
    if (langsBySource[sourceId]) return;

    const controller = new AbortController();
    setLoadingBySource((prev) => ({ ...prev, [sourceId]: true }));

    void (async () => {
      let resolvedLangs: string[] | null = null;
      try {
        const url =
          `/api/workspaces/${workspaceId}/reviews/sync` +
          `?packageName=${encodeURIComponent(sourceId)}` +
          `&country=${encodeURIComponent(countryCode)}` +
          `&num=100`;

        const res = await fetch(url, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { reviews?: ReviewRow[]; langs?: string[] };
        };

        resolvedLangs = Array.isArray(json.data?.langs) ? json.data!.langs! : null;

        if (json.ok && Array.isArray(json.data?.reviews)) {
          setReviewsBySource((prev) => ({ ...prev, [sourceId]: json.data!.reviews! }));
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      } finally {
        const langs = resolvedLangs ?? [primaryLangForCountry(countryCode)];
        setLangsBySource((prev) => ({ ...prev, [sourceId]: langs }));
        setLoadingBySource((prev) => ({ ...prev, [sourceId]: false }));
      }
    })();

    return () => controller.abort();
  }, [workspaceId, selectedAppFilter, countryCode, langsBySource]);

  // ── Hydration ──────────────────────────────────────────────────────────────
  //
  // hydrated flag: prevents SSR/client mismatch on first render.
  // backlogItems is the single source of truth for staged/archived state —
  // no sessionStorage needed. loadBacklog() fetches from DB on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHydrated(true);
  }, []);

  // ── Fetch backlog (active queue + history archive) ───────────────────────
  const loadBacklog = useCallback(() => {
    let cancelled = false;
    setBacklogLoading(true);
    setBacklogError(false);

    fetch(`/api/workspaces/${workspaceId}/backlog`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((json: { success: boolean; items?: Array<{
        id: string;
        package_name: string;
        country_code: string;
        issue_title: string;
        issue_description: string;
        severity: "CRITICAL" | "MEDIUM" | "LOW";
        impact: number;
        is_implemented: boolean;
        created_at: string;
        updated_at: string;
      }> }) => {
        if (cancelled) return;
        if (json.success) {
          setBacklogItems((json.items ?? []).map((i) => ({
            id: i.id,
            packageName: i.package_name,
            countryCode: i.country_code,
            issueTitle: i.issue_title,
            issueDescription: i.issue_description,
            severity: i.severity,
            impact: i.impact,
            isImplemented: i.is_implemented,
            createdAt: i.created_at,
            updatedAt: i.updated_at,
          })));
        } else {
          setBacklogError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setBacklogError(true);
      })
      .finally(() => {
        if (!cancelled) setBacklogLoading(false);
      });

    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    const cancel = loadBacklog();
    return cancel;
  }, [loadBacklog]);


  // ── Dismiss item (permanently delete from backlog) ───────────────────────
  //
  // Used by the "Dismiss" trash button in the Active Optimization Queue.
  // Deletes the row from the DB so the issue reappears in Active Insights.
  const dismissItem = useCallback(async (itemId: string) => {
    setBacklogBusy((prev) => ({ ...prev, [itemId]: true }));
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/backlog/${itemId}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const json = (await res.json()) as { success: boolean };
      if (json.success) {
        setBacklogItems((prev) => prev.filter((i) => i.id !== itemId));
      }
    } catch {
      // silent
    } finally {
      setBacklogBusy((prev) => ({ ...prev, [itemId]: false }));
    }
  }, [workspaceId]);

  // ── Revert item back to active (history → active) ────────────────────────
  //
  // On success:
  //   On success: isImplemented → false (item moves from History Archive back
  //   to active queue). stagedTitles and archivedTitles update reactively
  //   since both are derived from backlogItems. No improvementIds to clean up.
  const revertToActive = useCallback(async (itemId: string) => {
    setBacklogBusy((prev) => ({ ...prev, [itemId]: true }));
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/backlog/${itemId}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_implemented: false }),
        },
      );
      const json = (await res.json()) as { success: boolean };
      if (json.success) {
        setBacklogItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, isImplemented: false } : i)),
        );
      }
    } catch {
      // silent
    } finally {
      setBacklogBusy((prev) => ({ ...prev, [itemId]: false }));
    }
  }, [workspaceId]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const blockingError = Boolean(appsLoadError);
  const noApps = apps.length === 0 && !blockingError;

  /**
   * Live analytics derived from the currently-selected tab's reviews.
   * Returns null while reviews are still loading — callers show Skeleton.
   *
   * Computed fields:
   *   avgRating      — mean rating across all reviews in this source
   *   totalReviews   — total scraped count
   *   positivePct    — % of reviews with rating ≥ 4
   *   trendPoints    — daily mean ratings for the last 30 days (for sparkline)
   *                    ordered oldest → newest, sparse days are omitted
   */
  const overview = useMemo(() => {
    // Read loading state directly — avoids a forward-reference to the
    // `activeLoading` derived const which is declared further below.
    const isLoading = loadingBySource[selectedAppFilter] === true;
    const reviews = reviewsBySource[selectedAppFilter] ?? [];

    // Return null while the sync is still in flight so the grid shows Skeleton
    if (isLoading) return null;
    if (reviews.length === 0) return null;

    const total = reviews.length;
    const sumRating = reviews.reduce((acc, r) => acc + r.rating, 0);
    const avgRating = sumRating / total;
    const positiveCount = reviews.filter((r) => r.rating >= 4).length;
    const positivePct = Math.round((positiveCount / total) * 100);

    // ── Sparkline: daily average for the last 30 days ─────────────────────
    // Group reviews into YYYY-MM-DD buckets, then compute the per-day mean.
    // Only include days that have at least one review (sparse gaps are omitted).
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const buckets: Record<string, { sum: number; count: number }> = {};
    for (const r of reviews) {
      if (!r.dateIso) continue;
      const ts = new Date(r.dateIso).getTime();
      if (ts < cutoff) continue;
      const day = r.dateIso.slice(0, 10); // "YYYY-MM-DD"
      const bucket = (buckets[day] ??= { sum: 0, count: 0 });
      bucket.sum   += r.rating;
      bucket.count += 1;
    }
    const trendPoints = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b)) // chronological
      .map(([, { sum, count }]) => sum / count);

    return { avgRating, totalReviews: total, positivePct, trendPoints };
  }, [reviewsBySource, selectedAppFilter, loadingBySource]);

  /**
   * addImprovement — persists an IssueCard entry to workspace_listing_backlog.
   *
   * Flow:
   *   1. POST to /api/workspaces/[id]/backlog with the full issue payload.
   *      button toggles to "Added to queue ✓" without waiting for the network.
   *   2. POST to /api/workspaces/[id]/backlog with the full issue payload.
   *   3. On success: reload backlog — stagedTitles and archivedTitles update
   *      reactively, card disappears from Active Insights and STAGED state is
   *      driven by DB truth, not sessionStorage.
   *   4. On failure: toast error; no optimistic state to roll back.
   *
   * Duplicate guard: IssueCard.added is driven by stagedTitles.has(issue.title)
   * so the button is already hidden/STAGED before this fires again. The DB
   * upsert is also idempotent via the unique index.
   */
  const addImprovement = useCallback(
    async (issueId: string, issue: IssueItem): Promise<boolean> => {
      // ── Persist to DB ───────────────────────────────────────────────────────
      // Derive packageName inline — avoids a forward-reference to activePackageName
      // which is declared later in the component body.
      const packageName =
        selectedAppFilter === "my-app"
          ? (apps[0]?.package_name?.trim() ?? "")
          : selectedAppFilter;

      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/backlog`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageName,
              countryCode,
              title:        issue.title,
              description:  issue.description,
              severity:     issue.severity,
              impact:       issue.impact,
            }),
          },
        );

        const json = (await res.json()) as { success?: boolean; error?: { message?: string } };

        if (!json.success) {
          throw new Error(json.error?.message ?? "Backlog write failed");
        }

        // ── Success — reload backlog; stagedTitles/archivedTitles update reactively ──
        toast.success(t("commonIssues.addedToast"));
        loadBacklog();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        toast.error(`Could not save to backlog — ${msg}. Please try again.`);
        return false;
      }
    },
    [workspaceId, selectedAppFilter, apps, countryCode, t, loadBacklog],
  );

  const primaryApp = apps[0];
  const primaryAppName = primaryApp?.name ?? undefined;
  const primaryAppId = primaryApp?.id;
  const primaryPackageName = primaryApp?.package_name ?? null;

  // Active-tab derived values
  const activeReviews = reviewsBySource[selectedAppFilter] ?? [];
  const activeHasLiveReviews = activeReviews.length > 0;
  const activeLoading = loadingBySource[selectedAppFilter] === true;

  /**
   * true  — the selected tab is the user's own app
   * false — the selected tab is a competitor package
   */
  const isMyAppTab = selectedAppFilter === "my-app";

  /**
   * Tri-state liveness flag for the overview metrics section:
   *
   *   undefined  — sync still in flight; render Skeleton pulse loaders
   *   false      — sync finished, zero reviews returned; render zero-state cards
   *   true       — sync finished, reviews exist; render live computed values
   *
   * For competitors we always consider them "potentially live" once loading
   * resolves so the UI never blocks on a store that legitimately has zero
   * recent reviews — the zero-state is reserved for the workspace's own app
   * which may be a sandbox or pre-launch build with no store presence yet.
   */
  const isAppLive: boolean | undefined = activeLoading
    ? undefined // still resolving
    : isMyAppTab
      ? activeReviews.length > 0  // own app: live only if reviews came back
      : true;                     // competitors: treat as live once sync finishes

  /**
   * Wraps the raw setState so switching tabs instantly marks the incoming
   * source as loading=true before the data fetch can resolve.  This guarantees
   * the Skeleton pulse fires on every tab switch rather than flashing the
   * previous tab's stale values for one render cycle.
   *
   * If the source has never been fetched (no entry in loadingBySource yet) we
   * prime it to true so the very first render of the new tab is already pulsing.
   */
  const handleSelectApp = useCallback(
    (sourceId: string) => {
      // Only prime loading if this source hasn't finished yet
      if (!langsBySource[sourceId]) {
        setLoadingBySource((prev) => ({ ...prev, [sourceId]: true }));
      }
      setSelectedAppFilter(sourceId);
    },
    [langsBySource],
  );

  // ── Micro-shimmer on tab switch ───────────────────────────────────────────
  //
  // `metricsShimmer` is true for exactly 350 ms whenever selectedAppFilter
  // changes.  During that window the SVG gauge components render with an
  // opacity-pulse class instead of their normal state, giving a fast "loading
  // flicker" that communicates the switch without hiding any card chrome.
  //
  // A ref tracks the previous filter value so we only fire on real changes,
  // not on the initial mount.
  const [metricsShimmer, setMetricsShimmer] = useState(false);
  const prevFilterRef = useRef<string>(selectedAppFilter);

  useEffect(() => {
    if (prevFilterRef.current === selectedAppFilter) return;
    prevFilterRef.current = selectedAppFilter;

    setMetricsShimmer(true);
    const timer = setTimeout(() => setMetricsShimmer(false), 350);
    return () => clearTimeout(timer);
  }, [selectedAppFilter]);

  // ── Active-tab derived values for CommonIssuesPanel ──────────────────────
  // primaryLang: first hl confirmed by sync response (or country fallback).
  // activeLowRatingTexts: ≤2★ reviews for this tab, passed to the panel so it
  //   can include them in the POST body without needing to re-fetch.
  const activeLangs = langsBySource[selectedAppFilter] ?? ["en"];
  const primaryLang = activeLangs[0] ?? "en";

  // ── activePackageName — the composite cache key sent to the analyze route ──
  //
  // This value MUST be a valid Android package name (≥3 chars, dot-separated).
  // For the "my-app" tab it comes from the workspace app row. For competitors
  // it IS the selectedAppFilter (the packageId string used as the source key).
  //
  // Invariant: if packageName is empty the cache probe must not fire.
  // CommonIssuesPanel guards on `if (!packageName) return` in its probe effect,
  // so an empty string here safely suppresses the GET rather than querying with
  // package_name="" and returning a spurious cache-miss.
  const activePackageName: string =
    selectedAppFilter === "my-app"
      ? (apps[0]?.package_name?.trim() ?? "")
      : selectedAppFilter;

  // Development-time isolation assertion: if the key is empty on the "my-app"
  // tab the workspace has no package_name configured — log clearly so QA can
  // distinguish a misconfiguration from a real cache miss.
  if (process.env.NODE_ENV !== "production" && activePackageName === "") {
    console.warn(
      "[ReviewsClient] activePackageName is empty for tab:",
      selectedAppFilter,
      "— CommonIssuesPanel cache probe will be suppressed until package_name is set.",
    );
  }

  const activeLowRatingTexts = useMemo(
    () =>
      (reviewsBySource[selectedAppFilter] ?? [])
        .filter(
          (r) =>
            r.rating <= 2 &&
            typeof r.text === "string" &&
            r.text.trim().length > 0,
        )
        .map((r) => r.text.trim())
        .slice(0, 80),
    [reviewsBySource, selectedAppFilter],
  );

  /**
   * Titles of staged (not-yet-implemented) backlog items.
   * Drives IssueCard.added — the card shows "Open in Listing Optimizer →"
   * instead of "Add to Optimization Backlog" when its title is here.
   * DB-driven so it survives page refresh without any sessionStorage dependency.
   */
  const stagedTitles = useMemo(
    () => new Set(backlogItems.filter((i) => !i.isImplemented).map((i) => i.issueTitle)),
    [backlogItems],
  );

  /**
   * Set of issue titles that should be hidden from Active Insights.
   * Covers BOTH staged and archived — once in the backlog it leaves Active Insights.
   */
  const archivedTitles = useMemo(
    () => new Set(backlogItems.map((i) => i.issueTitle)),
    [backlogItems],
  );

  if (blockingError) {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p className="text-sm text-rose-100/90">{appsLoadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refresh()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (noApps) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-emerald-950/[0.18] via-[#0a0e14] to-[#070a0f] p-8 shadow-[0_0_0_1px_rgba(16,185,129,0.1)] sm:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-md text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
            <MessageSquareQuote className="size-7" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            {t("empty.title")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t("empty.body")}</p>
          <Button asChild className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500">
            <Link href={`/app/${workspaceId}/settings`}>{t("empty.cta")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {!hydrated ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0a0e14]">
          <Loader2 className="size-8 animate-spin text-emerald-500/60" aria-hidden />
          <span className="sr-only">{t("loading")}</span>
        </div>
      ) : (
        <>
          {/* ── Overview metrics ─────────────────────────────────────────── */}
          <section className="space-y-4" aria-labelledby="reviews-overview-heading">
            <h2 id="reviews-overview-heading" className="sr-only">
              {t("overview.srTitle")}
            </h2>
            {/*
             * Overview metrics — infographic 4-card grid.
             *
             * Each card has THREE render states keyed on `isAppLive`:
             *   undefined → loading (Skeleton pulse on text; SVG shimmer via metricsShimmer)
             *   false     → zero-state (dashed gauge arcs, zinc text, empty donut ring)
             *   true      → live data (animated SVG fill, real values)
             *
             * `metricsShimmer` fires for 350 ms on every tab switch, applying an
             * opacity-pulse class to the SVG inner groups without hiding card chrome.
             * This is purely CSS — zero JS animation loop.
             */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              {/* ── Card 1: Average Rating — semi-circle gauge ─────────────── */}
              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-0">
                  <CardDescription className="text-zinc-500">
                    {t("overview.avgRating")}
                  </CardDescription>
                  {/*
                   * Stacked layout:
                   *   top    — RatingGauge SVG semi-circle (full card width)
                   *   bottom — numeric value centred below the arc midpoint
                   */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <RatingGauge
                      rating={isAppLive === true ? (overview?.avgRating ?? null) : null}
                      shimmer={metricsShimmer || isAppLive === undefined}
                    />
                    <CardTitle className="text-2xl font-bold tabular-nums text-white -mt-1">
                      {isAppLive === undefined ? (
                        <Skeleton className="h-7 w-14" />
                      ) : isAppLive === false ? (
                        <span className="text-zinc-600">--</span>
                      ) : (
                        <span>
                          {overview?.avgRating.toFixed(1) ?? "--"}
                          <span className="ml-1 text-sm font-normal text-zinc-500">/ 5</span>
                        </span>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 text-xs text-zinc-500">
                  {t("overview.avgHint")}
                </CardContent>
              </Card>

              {/* ── Card 2: Total Reviews — count + horizontal bar ─────────── */}
              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-3">
                  <CardDescription className="text-zinc-500">
                    {t("overview.totalReviews")}
                  </CardDescription>
                  {/*
                   * Number and bar live in one vertically-stacked block so there
                   * is no perceived gap caused by CardHeader / CardContent padding.
                   * gap-1.5 keeps the bar visually anchored to the number above it.
                   */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <CardTitle className="text-3xl font-bold tabular-nums leading-none text-white">
                      {isAppLive === undefined ? (
                        <Skeleton className="h-8 w-20" />
                      ) : isAppLive === false ? (
                        <span className="text-zinc-600">0</span>
                      ) : (
                        (overview?.totalReviews ?? 0).toLocaleString()
                      )}
                    </CardTitle>

                    {/* Volume bar — fills proportionally to the 100-review scrape cap */}
                    <div
                      className={[
                        "h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]",
                        metricsShimmer || isAppLive === undefined ? "animate-pulse" : "",
                      ].join(" ")}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500/70 transition-[width] duration-700 ease-out"
                        style={{
                          width: isAppLive === true
                            ? `${Math.min(100, Math.round(((overview?.totalReviews ?? 0) / 100) * 100))}%`
                            : "0%",
                        }}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-zinc-500">
                  {t("overview.totalHint")}
                </CardContent>
              </Card>

              {/* ── Card 3: Positive Sentiment — unified donut + label widget ── */}
              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-500">
                    {t("overview.sentiment")}
                  </CardDescription>
                  {/*
                   * Unified widget: the SVG ring and the percentage label are
                   * co-positioned inside a single relative container.
                   *
                   * Dimensions are chosen to match the donut exactly:
                   *   - Canvas:     64 × 64 px  (w-16 h-16)
                   *   - Ring:       r=26, strokeWidth=7 → inner hole ⌀ 45px
                   *   - Text:       text-sm (14px) fits cleanly in the 45px hole
                   *
                   * The SVG is rotated –90° via inline style (applied inside
                   * SentimentDonut) and fills the container via absolute inset-0.
                   * The label span sits in normal flow at the centre via the parent
                   * flex layout — no z-index fighting needed.
                   *
                   * Shimmer / loading: the Skeleton replaces the whole widget block
                   * so the card height never shifts between states.
                   */}
                  <div className="pt-2">
                    {isAppLive === undefined ? (
                      <Skeleton className="h-16 w-16 rounded-full" />
                    ) : (
                      <div className="relative flex h-16 w-16 items-center justify-center">
                        {/* Ring fills the full 64×64 container */}
                        <SentimentDonut
                          pct={isAppLive === true ? (overview?.positivePct ?? null) : null}
                          shimmer={metricsShimmer}
                        />
                        {/* Percentage centred in the ring's inner hole */}
                        <span
                          className={[
                            "pointer-events-none absolute text-sm font-bold tabular-nums leading-none",
                            isAppLive === false
                              ? "text-zinc-600"
                              : "text-emerald-400",
                            metricsShimmer ? "opacity-0" : "transition-opacity duration-300",
                          ].join(" ")}
                        >
                          {isAppLive === false
                            ? "0%"
                            : `${overview?.positivePct ?? 0}%`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">
                  {t("overview.sentimentHint")}
                </CardContent>
              </Card>

              {/* ── Card 4: 30-Day Trend — density bar sparkline ───────────── */}
              <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]">
                <CardHeader className="pb-2">
                  <CardDescription className="text-zinc-500">
                    {t("overview.ratingTrend30")}
                  </CardDescription>
                  <div className="flex items-end justify-between gap-3 pt-1">
                    {isAppLive === undefined ? (
                      <Skeleton className="h-10 w-[140px]" />
                    ) : isAppLive === false ? (
                      /*
                       * Zero-state flat line — occupies the same bounding box as
                       * the real sparkline so the card height never jumps on data
                       * arrival.  Dashed stroke signals "awaiting data" consistently
                       * with the gauge dashed arcs in Cards 1 and 3.
                       */
                      <div className="flex flex-col gap-1.5">
                        <svg
                          width="140" height="40"
                          viewBox="0 0 140 40"
                          fill="none"
                          aria-hidden
                        >
                          <line
                            x1="4" y1="28" x2="136" y2="28"
                            stroke="rgba(113,113,122,0.35)"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                          />
                        </svg>
                        <span className="text-[11px] text-zinc-600">No historical trends yet</span>
                      </div>
                    ) : (
                      <div
                        className={metricsShimmer ? "animate-pulse opacity-40" : "transition-opacity duration-300"}
                      >
                        <RatingSparkline
                          values={overview?.trendPoints ?? []}
                          label={t("overview.ratingTrend30")}
                        />
                      </div>
                    )}
                    {isAppLive === true && !metricsShimmer && (
                      <span className="text-xs font-medium text-emerald-400/90 self-end">
                        {t("overview.trendLabel")}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500">
                  {t("overview.sparkHint")}
                </CardContent>
              </Card>

            </div>
          </section>

          {/* ── Tab selector ─────────────────────────────────────────────── */}
          <AppSourceSelector
            selected={selectedAppFilter}
            onSelect={handleSelectApp}
            competitors={competitorOptions}
            loading={competitorsLoading}
          />

          {/*
           * key={selectedAppFilter} forces a full remount of ReviewsTab on every
           * tab switch, resetting all internal filter/search/pagination state.
           *
           * Data isolation is handled here: activeReviews is read from
           * reviewsBySource[selectedAppFilter] — an independent fetch bucket per
           * source — so reviews from one tab can never appear under another.
           */}
          <ReviewsTab
            key={selectedAppFilter}
            workspaceId={workspaceId}
            appName={primaryAppName}
            appId={primaryAppId}
            packageName={primaryPackageName}
            reviews={activeReviews}
            hasLiveReviews={activeHasLiveReviews}
            selectedAppFilter={selectedAppFilter}
            activeCompetitorPackageName={
              selectedAppFilter !== "my-app" ? selectedAppFilter : null
            }
          />

          {/* Per-tab loading indicator */}
          {activeLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>{t("loading")}</span>
            </div>
          )}

          {/* ── Common Issues — real Gemini-computed pain points ─────────── */}
          {/*
           * CommonIssuesPanel is mounted with key={selectedAppFilter} so React
           * destroys and recreates it on every tab switch. Each fresh mount gets:
           *   - panelState = "checking" (initial useState value)
           *   - probe GET fires immediately via useEffect(fn, [])
           *   - zero shared state or stale ref bleed from prior tabs
           *
           * Credits are only charged on the POST (analyzing → ready) path.
           * The GET (checking) path is always free — it only probes the cache.
           */}

          {/* ── Common Issues — Active Insights + Optimization History Archive ── */}
          {/*
           * Single section with two tabs:
           *   ⚡ Active Insights   — CommonIssuesPanel (Gemini analysis) + backlog active queue
           *   🗂 Optimization History Archive — exploited/implemented backlog items
           *
           * CommonIssuesPanel is keyed on selectedAppFilter so it remounts on tab switch.
           * "Add to Optimization Backlog" in the IssueCard fires addImprovement, which
           * POSTs to /backlog. loadBacklog() re-fetches
           * the full backlog list so the item also appears in the Active Insights queue.
           */}
          <section className="space-y-4" aria-labelledby="common-issues-heading">

            {/* Section header */}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {t("commonIssues.kicker")}
              </p>
              <h2
                id="common-issues-heading"
                className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
              >
                {t("commonIssues.title")}
              </h2>
              <p className="max-w-2xl text-sm text-zinc-400">
                {t("commonIssues.subtitle")}
              </p>
            </div>

            {/* Tab switcher */}
            <div className="flex items-center gap-0 rounded-xl border border-white/[0.08] bg-zinc-900/60 p-1 w-fit">
              <button
                type="button"
                onClick={() => setInsightsTab("active")}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  insightsTab === "active"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300",
                ].join(" ")}
              >
                <Zap className="size-3.5 shrink-0" aria-hidden />
                {t("insightsTabs.activeInsights")}
              </button>
              <button
                type="button"
                onClick={() => setInsightsTab("archive")}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  insightsTab === "archive"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300",
                ].join(" ")}
              >
                <Inbox className="size-3.5 shrink-0" aria-hidden />
                {t("insightsTabs.historyArchive")}
              </button>
            </div>

            {/* ── ACTIVE INSIGHTS TAB ──────────────────────────────────────── */}
            {insightsTab === "active" && (
              <div className="space-y-6">

                {/* Gemini Common Issues panel — the IssueCard grid */}
                {stagedTitles.size > 0 ? (
                  <p className="flex items-center gap-2 text-xs text-emerald-400/85">
                    <Sparkles className="size-3.5 shrink-0" aria-hidden />
                    {t("commonIssues.queueHint", { count: stagedTitles.size })}
                  </p>
                ) : null}

                <CommonIssuesPanel
                  key={selectedAppFilter}
                  workspaceId={workspaceId}
                  appId={primaryAppId}
                  packageName={activePackageName}
                  countryCode={countryCode}
                  langCode={primaryLang}
                  reviewTexts={activeLowRatingTexts}
                  rawReviewCount={activeLowRatingTexts.length}
                  isSyncLoading={activeLoading}
                  stagedTitles={stagedTitles}
                  excludeTitles={archivedTitles}
                  onAddImprovement={addImprovement}
                />

                {/* ── Active Optimization Queue ────────────────────────────────
                    Shows issues the user has queued for listing optimization.
                    Two actions only:
                      • "Open in Listing Optimizer →" — navigate to generate listing
                      • Trash icon — dismiss (delete from DB, reappears in Active Insights)
                    Items move to History Archive automatically when a listing is generated. */}
                {(backlogLoading || backlogError || backlogItems.filter((i) => !i.isImplemented).length > 0) && (
                  <div className="space-y-3 border-t border-white/[0.06] pt-4">

                    {/* Section label + Optimize All Insights CTA */}
                    {!backlogLoading && backlogItems.filter((i) => !i.isImplemented).length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                          {t("insightsTabs.queueSectionLabel")}
                        </p>
                        {/* Unified deep-link: pulls ALL queued insights into the optimizer
                            as exploit_targets so the user doesn't need to queue individually.
                            Capped at 40 items to stay within the Listing Optimizer's schema max.
                            URLSearchParams.set() handles the encoding — do NOT pre-encode titles
                            individually (double-encoding breaks the optimizer's URL parser). */}
                        {(() => {
                          const activeItems = backlogItems.filter((i) => !i.isImplemented);
                          const capped = activeItems.slice(0, 40);
                          const count = capped.length;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (!count) return;
                                const targets = capped.map((i) => i.issueTitle).join(",");
                                const params = new URLSearchParams();
                                params.set("exploit_targets", targets);
                                if (primaryAppId) params.set("appId", primaryAppId);
                                router.push(`/app/${workspaceId}/listing-optimizer?${params.toString()}`);
                              }}
                              className="group flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-all hover:border-emerald-500/55 hover:bg-emerald-500/[0.14] hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                            >
                              <Zap className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
                              {t("insightsTabs.optimizeAllInsights")}
                              {/* Count badge — shows how many insights are being pushed */}
                              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-300 ring-1 ring-emerald-500/30">
                                {count}
                              </span>
                              <ArrowRight className="size-3.5 shrink-0 text-emerald-400/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
                            </button>
                          );
                        })()}
                      </div>
                    )}

                    {backlogLoading && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        <span>{t("loading")}</span>
                      </div>
                    )}
                    {backlogError && !backlogLoading && (
                      <p className="text-xs text-red-400">{t("insightsTabs.loadError")}</p>
                    )}

                    {!backlogLoading && backlogItems.filter((i) => !i.isImplemented).length > 0 && (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {backlogItems.filter((i) => !i.isImplemented).map((item) => {
                          const severityBadge: Record<string, string> = {
                            CRITICAL: "bg-red-500/10 text-red-500 border border-red-500/20",
                            MEDIUM:   "bg-amber-500/10 text-amber-500 border border-amber-500/20",
                            LOW:      "bg-blue-500/10 text-blue-500 border border-blue-500/20",
                          };
                          const accentBar: Record<string, string> = {
                            CRITICAL: "bg-red-500",
                            MEDIUM:   "bg-amber-500",
                            LOW:      "bg-blue-500",
                          };
                          const severityLabel: Record<string, string> = {
                            CRITICAL: "Critical",
                            MEDIUM:   "Medium",
                            LOW:      "Low",
                          };
                          const isBusy = backlogBusy[item.id] ?? false;
                          const qs = primaryAppId ? `?appId=${encodeURIComponent(primaryAppId)}` : "";
                          return (
                            <div
                              key={item.id}
                              className="relative overflow-visible rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-[0_0_0_1px_rgba(16,185,129,0.06)] transition-shadow hover:shadow-[0_0_0_1px_rgba(16,185,129,0.14)]"
                            >
                              {/* Left accent stripe */}
                              <div
                                className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${accentBar[item.severity] ?? "bg-zinc-500"}`}
                                aria-hidden
                              />
                              {/* Impact % — top-right */}
                              <span className="absolute right-3 top-3 text-[11px] font-medium tabular-nums whitespace-nowrap text-amber-400">
                                {t("insightsTabs.impact", { pct: Math.round(item.impact * 100) })}
                              </span>
                              {/* Card body */}
                              <div className="space-y-2 pb-3 pl-6 pr-12 pt-3">
                                {/* Severity badge + dismiss */}
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${severityBadge[item.severity] ?? ""}`}>
                                    {severityLabel[item.severity] ?? item.severity}
                                  </span>
                                  {/* Dismiss — removes from queue, reappears in Active Insights */}
                                  <button
                                    type="button"
                                    aria-label={t("insightsTabs.dismissItem")}
                                    disabled={isBusy}
                                    onClick={() => void dismissItem(item.id)}
                                    className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                                  >
                                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden>
                                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                                {/* Title + description */}
                                <p className="text-sm font-semibold leading-snug text-white">{item.issueTitle}</p>
                                <p className="text-xs leading-relaxed text-zinc-400">{item.issueDescription}</p>
                                {/* Primary CTA — open listing optimizer pre-loaded with this app */}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => router.push(`/app/${workspaceId}/listing-optimizer${qs}`)}
                                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-zinc-800/80 border border-zinc-700 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-zinc-700/80 hover:text-blue-300 transition-colors disabled:opacity-50"
                                >
                                  <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                                  {t("insightsTabs.openInOptimizer")}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── OPTIMIZATION HISTORY ARCHIVE TAB ─────────────────────────── */}
            {insightsTab === "archive" && (() => {
              const doneItems = backlogItems.filter((i) => i.isImplemented);
              return (
                <div className="space-y-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    {doneItems.length > 0 ? (
                      <p className="text-sm text-zinc-400">
                        {t("insightsTabs.exploitedCount", { count: doneItems.length })}
                      </p>
                    ) : null}
                    <span className="ms-auto rounded-full border border-white/[0.08] bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-500">
                      {t("insightsTabs.archiveBadge")}
                    </span>
                  </div>

                  {backlogLoading && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      <span>{t("loading")}</span>
                    </div>
                  )}
                  {!backlogLoading && doneItems.length === 0 && (
                    <p className="text-sm text-zinc-500">{t("insightsTabs.emptyArchive")}</p>
                  )}

                  {/* ── Compact IssueCard-style grid ── */}
                  {!backlogLoading && doneItems.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {doneItems.map((item) => {
                        const severityBadge: Record<string, string> = {
                          CRITICAL: "bg-red-500/10 text-red-500 border border-red-500/20",
                          MEDIUM:   "bg-amber-500/10 text-amber-500 border border-amber-500/20",
                          LOW:      "bg-blue-500/10 text-blue-500 border border-blue-500/20",
                        };
                        const accentBar: Record<string, string> = {
                          CRITICAL: "bg-red-500",
                          MEDIUM:   "bg-amber-500",
                          LOW:      "bg-blue-500",
                        };
                        const impactColor: Record<string, string> = {
                          CRITICAL: "text-red-400",
                          MEDIUM:   "text-amber-400",
                          LOW:      "text-blue-400",
                        };
                        const severityLabel: Record<string, string> = {
                          CRITICAL: "Critical",
                          MEDIUM:   "Medium",
                          LOW:      "Low",
                        };
                        const isBusy = backlogBusy[item.id] ?? false;

                        // ── Source label for competitor pill ──────────────────
                        const ownPackage = apps[0]?.package_name?.trim() ?? "";
                        const isOwnApp = ownPackage && item.packageName?.trim() === ownPackage;
                        const matchedCompetitor = competitorOptions.find(
                          (c) => c.packageId === item.packageName?.trim(),
                        );
                        const sourceLabel = isOwnApp
                          ? t("insightsTabs.sourceOwnApp")
                          : matchedCompetitor?.label ?? item.packageName ?? null;
                        const isCompetitorSource = !isOwnApp && sourceLabel !== null;

                        return (
                          <div
                            key={item.id}
                            className="relative overflow-visible rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-[0_0_0_1px_rgba(16,185,129,0.06)] transition-shadow hover:shadow-[0_0_0_1px_rgba(16,185,129,0.14)]"
                          >
                            {/* Left accent stripe */}
                            <div
                              className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${accentBar[item.severity] ?? "bg-zinc-500"}`}
                              aria-hidden
                            />

                            {/* Impact % — top-right */}
                            <span className={`absolute right-3 top-3 text-[11px] font-medium tabular-nums whitespace-nowrap ${impactColor[item.severity] ?? "text-zinc-400"}`}>
                              {t("insightsTabs.impact", { pct: Math.round(item.impact * 100) })}
                            </span>

                            {/* Card body */}
                            <div className="space-y-2.5 pb-3 pl-6 pr-14 pt-3">
                              {/* Severity badge */}
                              <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${severityBadge[item.severity] ?? ""}`}>
                                {severityLabel[item.severity] ?? item.severity}
                              </span>

                              {/* Title */}
                              <p className="text-sm font-semibold leading-snug text-white">{item.issueTitle}</p>

                              {/* Description */}
                              <p className="text-xs leading-relaxed text-zinc-400">{item.issueDescription}</p>

                              {/* Metadata row — source pill + counter-attacked badge */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {/* Counter-attacked badge */}
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-3 shrink-0" aria-hidden>
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                  </svg>
                                  {t("insightsTabs.counterAttacked")}
                                </span>

                                {/* Source pill */}
                                {sourceLabel && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${isCompetitorSource ? "bg-orange-500/10 border border-orange-500/20 text-orange-400" : "bg-sky-500/10 border border-sky-500/20 text-sky-400"}`}>
                                    {isCompetitorSource ? (
                                      <svg viewBox="0 0 16 16" fill="currentColor" className="size-2.5 shrink-0" aria-hidden>
                                        <path d="M8 1a5 5 0 100 10A5 5 0 008 1zM0 8a8 8 0 1116 0A8 8 0 010 8z"/>
                                        <path d="M7 5.5a.5.5 0 011 0V8h1.5a.5.5 0 010 1H7.5A.5.5 0 017 8.5v-3z"/>
                                      </svg>
                                    ) : (
                                      <svg viewBox="0 0 16 16" fill="currentColor" className="size-2.5 shrink-0" aria-hidden>
                                        <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3z"/>
                                      </svg>
                                    )}
                                    <span className="max-w-[90px] truncate">{sourceLabel}</span>
                                  </span>
                                )}
                              </div>

                              {/* Optimized-on date */}
                              {item.updatedAt && (
                                <p className="text-[10px] text-zinc-600">
                                  {t("insightsTabs.exploitedOn", {
                                    date: new Date(item.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
                                  })}
                                </p>
                              )}

                              {/* Action row — Restore + Delete */}
                              <div className="mt-1 flex items-center gap-2">
                                {/* Restore CTA */}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => revertToActive(item.id)}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zinc-800/80 border border-zinc-700 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-zinc-700/80 hover:text-sky-300 transition-colors disabled:opacity-50"
                                >
                                  {isBusy ? (
                                    <>
                                      <Loader2 className="size-3 animate-spin shrink-0" aria-hidden />
                                      {t("insightsTabs.restoring")}
                                    </>
                                  ) : (
                                    <>
                                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5 shrink-0" aria-hidden>
                                        <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.061.025z" clipRule="evenodd" />
                                      </svg>
                                      {t("insightsTabs.restoreToActive")}
                                    </>
                                  )}
                                </button>

                                {/* Delete — permanently removes from archive */}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  aria-label={t("insightsTabs.deleteFromArchive")}
                                  onClick={() => void dismissItem(item.id)}
                                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/80 text-zinc-500 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

          </section>
        </>
      )}
    </div>
  );
}
