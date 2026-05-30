"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Lock, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TopChartApp } from "@/lib/play-store/fetch-top-charts";
import type { KeywordSpotlightResult } from "@/app/api/market/keyword-spotlight/route";
import { SELECTABLE_CATEGORIES, getCategoryLabel } from "@/lib/market/category-labels";
import { TopChartRow, TopChartRowSkeleton } from "@/components/market/top-chart-row";
import { KeywordSpotlightCard } from "@/components/market/keyword-spotlight-card";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Must match AI_CREDIT_COSTS.market_keyword_spotlight in credit-costs.ts */
const SPOTLIGHT_CREDIT_COST = 3;

// ── Types ──────────────────────────────────────────────────────────────────────

type Collection = "TOP_FREE" | "TOP_PAID" | "GROSSING";

const COLLECTION_LABELS: Record<Collection, string> = {
  TOP_FREE: "Top Free",
  TOP_PAID: "Top Paid",
  GROSSING: "Top Grossing",
};

const COUNTRY_OPTIONS: { code: string; label: string; flag: string }[] = [
  { code: "us", label: "United States", flag: "🇺🇸" },
  { code: "gb", label: "United Kingdom", flag: "🇬🇧" },
  { code: "sa", label: "Saudi Arabia",  flag: "🇸🇦" },
  { code: "ae", label: "UAE",           flag: "🇦🇪" },
  { code: "in", label: "India",         flag: "🇮🇳" },
  { code: "br", label: "Brazil",        flag: "🇧🇷" },
  { code: "de", label: "Germany",       flag: "🇩🇪" },
  { code: "jp", label: "Japan",         flag: "🇯🇵" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

export type MarketIntelligenceClientProps = {
  workspaceId: string;
  /** The user's app package name (to highlight own app in chart) */
  ownAppId?: string | null;
  /** Auto-detected category from user's app/listing — used as default */
  defaultCategory?: string;
  /** True when the UI locale is Arabic — enables RTL layout + defaults country to SA */
  isRtl?: boolean;
};

// ── Spotlight locked state ─────────────────────────────────────────────────────

function SpotlightLockedCard({
  onUnlock,
  loading,
}: {
  onUnlock: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-white/[0.03] p-5 ring-1 ring-white/[0.04]">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
          <Sparkles className="size-3.5 text-emerald-400" aria-hidden />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white/95">AI Keyword Spotlight</h3>
          <p className="text-[11px] text-zinc-500">What's dominating this category right now</p>
        </div>
      </div>

      {/* Blurred preview */}
      <div className="relative mb-4 overflow-hidden rounded-xl">
        {/* Fake blurred keyword chips */}
        <div className="pointer-events-none select-none space-y-3 blur-[6px]">
          <div className="flex flex-wrap gap-1.5">
            {["fitness tracker", "calorie counter", "workout planner", "weight loss", "step counter", "meal tracker"].map((kw) => (
              <span key={kw} className="inline-flex items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                {kw}
              </span>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-zinc-400">
            Health & Fitness apps are converging on AI-powered personalisation — apps with "AI coach" or "smart plan" in their titles have displaced traditional trackers in 6 of the top 10 positions.
          </p>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-100/80">
            Add "AI" or "smart" to your title or short description to align with the dominant keyword pattern driving installs in this category this week.
          </div>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-950/70 backdrop-blur-[2px]">
          <Lock className="size-5 text-zinc-400" aria-hidden />
          <p className="text-center text-xs text-zinc-400">
            AI analysis of the top 10 apps in this category
          </p>
        </div>
      </div>

      {/* Unlock button */}
      <button
        type="button"
        onClick={onUnlock}
        disabled={loading}
        title={`Spend ${SPOTLIGHT_CREDIT_COST} credits to generate AI Keyword Spotlight for this category and market`}
        className={cn(
          "group flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-150",
          "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
          "hover:border-emerald-500/55 hover:bg-emerald-500/18 hover:text-emerald-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {loading ? (
          <>
            <RefreshCw className="size-4 animate-spin" aria-hidden />
            Analysing…
          </>
        ) : (
          <>
            <Sparkles className="size-4 shrink-0" aria-hidden />
            Unlock AI Spotlight
            <span className="ml-auto flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              <Coins className="size-3" aria-hidden />
              {SPOTLIGHT_CREDIT_COST} credits
            </span>
          </>
        )}
      </button>

      <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-600">
        Credits are refunded automatically if analysis fails
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MarketIntelligenceClient({
  workspaceId,
  ownAppId,
  defaultCategory = "APPLICATION",
  isRtl = false,
}: MarketIntelligenceClientProps) {
  const [category,   setCategory]   = useState(defaultCategory);
  // Arabic users default to Saudi Arabia — their primary market
  const [country,    setCountry]    = useState(isRtl ? "sa" : "us");
  const [collection, setCollection] = useState<Collection>("TOP_FREE");

  const [apps,          setApps]          = useState<TopChartApp[]>([]);
  const [spotlight,     setSpotlight]     = useState<KeywordSpotlightResult | null>(null);
  // "locked" = chart loaded, spotlight not yet purchased for this category/country
  const [spotlightLocked, setSpotlightLocked] = useState(true);
  const [loadingChart,  setLoadingChart]  = useState(true);
  const [loadingSpot,   setLoadingSpot]   = useState(false);
  const [fetchedAt,     setFetchedAt]     = useState<string | null>(null);
  const [fromCache,     setFromCache]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // Reset spotlight lock when category or country changes — new market, new spotlight
  useEffect(() => {
    setSpotlight(null);
    setSpotlightLocked(true);
  }, [category, country]);

  // ── Fetch chart (free — no credits) ─────────────────────────────────────────
  const loadChart = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    setLoadingChart(true);
    setError(null);

    const params = new URLSearchParams({ category, country, collection });
    if (opts?.forceRefresh) params.set("refresh", "1");

    try {
      const res = await fetch(`/api/market/top-charts?${params.toString()}`);
      const json = await res.json() as {
        ok: boolean;
        apps?: TopChartApp[];
        meta?: { fetchedAt: string; fromCache: boolean };
        error?: { message: string };
      };

      if (!json.ok || !json.apps) {
        setError(json.error?.message ?? "Could not load chart data.");
        return;
      }

      setApps(json.apps);
      setFetchedAt(json.meta?.fetchedAt ?? null);
      setFromCache(json.meta?.fromCache ?? false);
    } catch (e) {
      setError("Network error. Please try again.");
      console.error(e);
    } finally {
      setLoadingChart(false);
    }
  }, [category, country, collection]);

  // ── Fetch AI spotlight (costs credits — user-initiated) ──────────────────────
  const fetchSpotlight = useCallback(async () => {
    if (!apps.length) return;
    setLoadingSpot(true);
    try {
      const res = await fetch("/api/market/keyword-spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: apps.slice(0, 10).map((a) => ({ title: a.title, summary: a.summary })),
          category,
          country,
          workspaceId,
        }),
      });
      const json = await res.json() as {
        ok: boolean;
        spotlight?: KeywordSpotlightResult;
        creditsUsed?: number;
        creditsRemaining?: number;
        error?: { message: string; code?: string };
      };

      if (!json.ok) {
        // Handle insufficient credits specifically
        if (json.error?.code === "insufficient_credits") {
          toast.error("Not enough credits for AI Spotlight. Top up to continue.");
        } else {
          toast.error(json.error?.message ?? "Could not generate spotlight.");
        }
        return;
      }

      if (json.spotlight) {
        setSpotlight(json.spotlight);
        setSpotlightLocked(false);
        if (json.creditsUsed) {
          toast.success(`AI Spotlight unlocked · ${json.creditsUsed} credits used`);
        }
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoadingSpot(false);
    }
  }, [apps, category, country, workspaceId]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  // ── Refresh handler (chart only — free) ──────────────────────────────────────
  async function handleRefresh() {
    await loadChart({ forceRefresh: true });
    toast.success("Chart refreshed");
  }

  // ── Formatted fetch time ─────────────────────────────────────────────────────
  const fetchedAtLabel = fetchedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(fetchedAt))
    : null;

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className={cn("space-y-6", isRtl && "font-arabic")}>
      {/* ── Controls bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category picker */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-w-[180px] rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-sm text-white/85 shadow-sm outline-none ring-0 transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          aria-label="Category"
        >
          {SELECTABLE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
          ))}
        </select>

        {/* Country picker */}
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-2 text-sm text-white/85 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          aria-label="Country"
        >
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.label}</option>
          ))}
        </select>

        {/* Collection tabs */}
        <div className="flex overflow-hidden rounded-xl border border-zinc-700/60 bg-zinc-900/80">
          {(Object.keys(COLLECTION_LABELS) as Collection[]).map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => setCollection(col)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors",
                collection === col
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
              )}
            >
              {COLLECTION_LABELS[col]}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Cache/refresh info — chart refresh is always free */}
        <div className="flex items-center gap-2.5">
          {fetchedAtLabel && !loadingChart && (
            <p className="text-[11px] text-zinc-600">
              {fromCache ? "Cached" : "Fresh"} · {fetchedAtLabel}
            </p>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loadingChart}
            title="Refresh chart ranking — free"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-white/80 disabled:opacity-40"
          >
            <RefreshCw className={cn("size-3.5", loadingChart && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main content: chart + spotlight ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: leaderboard (always free) */}
        <div className="rounded-2xl border border-zinc-800 bg-white/[0.025] p-5">
          {/* Panel header */}
          <div className="mb-4 flex items-center gap-2.5">
            <TrendingUp className="size-4 shrink-0 text-emerald-400" aria-hidden />
            <h2 className="text-sm font-semibold text-white/95">
              {COLLECTION_LABELS[collection]} · {getCategoryLabel(category)}
            </h2>
            {!loadingChart && apps.length > 0 && (
              <span className="ml-auto rounded-full border border-zinc-700/50 bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-500">
                Top {apps.length}
              </span>
            )}
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">
              {error}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {loadingChart
                ? Array.from({ length: 15 }, (_, i) => (
                    <TopChartRowSkeleton key={i} rank={i + 1} isRtl={isRtl} />
                  ))
                : apps.map((app, i) => (
                    <TopChartRow
                      key={app.appId}
                      app={app}
                      rank={i + 1}
                      isOwnApp={Boolean(ownAppId && app.appId === ownAppId)}
                      isRtl={isRtl}
                    />
                  ))}
            </div>
          )}
        </div>

        {/* Right: AI spotlight (gated) */}
        <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
          {spotlightLocked || (!spotlight && !loadingSpot) ? (
            <SpotlightLockedCard
              onUnlock={fetchSpotlight}
              loading={loadingSpot || loadingChart}
            />
          ) : (
            <>
              <KeywordSpotlightCard
                spotlight={spotlight}
                loading={loadingSpot}
              />
              {/* Refresh spotlight — costs credits again */}
              {spotlight && !loadingSpot && (
                <button
                  type="button"
                  onClick={fetchSpotlight}
                  title={`Re-run AI analysis — costs ${SPOTLIGHT_CREDIT_COST} credits`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700/50 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500 transition hover:border-zinc-600/60 hover:text-zinc-300"
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Re-run analysis
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
                    <Coins className="size-3" aria-hidden />
                    {SPOTLIGHT_CREDIT_COST} credits
                  </span>
                </button>
              )}
            </>
          )}

          {/* What to do next — shown after unlock */}
          {!spotlightLocked && spotlight && !loadingSpot && (
            <div className="rounded-2xl border border-zinc-800 bg-white/[0.02] p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Next steps
              </p>
              <ul className="space-y-2 text-xs leading-relaxed text-zinc-400">
                <li className="flex gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500/60" aria-hidden />
                  Check if your title includes any of the trending keywords above
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-sky-500/60" aria-hidden />
                  Open top 3 apps in this chart and compare their short descriptions with yours
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber-500/60" aria-hidden />
                  Run AI Listing Optimizer with these keywords as your target
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
