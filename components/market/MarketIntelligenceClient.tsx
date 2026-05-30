"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TopChartApp } from "@/lib/play-store/fetch-top-charts";
import type { KeywordSpotlightResult } from "@/app/api/market/keyword-spotlight/route";
import { SELECTABLE_CATEGORIES, getCategoryLabel } from "@/lib/market/category-labels";
import { TopChartRow, TopChartRowSkeleton } from "@/components/market/top-chart-row";
import { KeywordSpotlightCard } from "@/components/market/keyword-spotlight-card";

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
};

// ── Component ──────────────────────────────────────────────────────────────────

export function MarketIntelligenceClient({
  workspaceId: _workspaceId,
  ownAppId,
  defaultCategory = "APPLICATION",
}: MarketIntelligenceClientProps) {
  const [category,   setCategory]   = useState(defaultCategory);
  const [country,    setCountry]    = useState("us");
  const [collection, setCollection] = useState<Collection>("TOP_FREE");

  const [apps,          setApps]          = useState<TopChartApp[]>([]);
  const [spotlight,     setSpotlight]     = useState<KeywordSpotlightResult | null>(null);
  const [loadingChart,  setLoadingChart]  = useState(true);
  const [loadingSpot,   setLoadingSpot]   = useState(false);
  const [fetchedAt,     setFetchedAt]     = useState<string | null>(null);
  const [fromCache,     setFromCache]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // ── Fetch chart ─────────────────────────────────────────────────────────────
  const loadChart = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    setLoadingChart(true);
    setError(null);
    setSpotlight(null);

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

      // Auto-trigger spotlight after chart loads
      fetchSpotlight(json.apps);
    } catch (e) {
      setError("Network error. Please try again.");
      console.error(e);
    } finally {
      setLoadingChart(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, country, collection]);

  // ── Fetch AI keyword spotlight ───────────────────────────────────────────────
  const fetchSpotlight = useCallback(async (chartApps: TopChartApp[]) => {
    if (!chartApps.length) return;
    setLoadingSpot(true);
    try {
      const res = await fetch("/api/market/keyword-spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: chartApps.slice(0, 10).map((a) => ({ title: a.title, summary: a.summary })),
          category,
          country,
        }),
      });
      const json = await res.json() as {
        ok: boolean;
        spotlight?: KeywordSpotlightResult;
        error?: { message: string };
      };
      if (json.ok && json.spotlight) {
        setSpotlight(json.spotlight);
      }
    } catch {
      // Spotlight failure is non-fatal — chart is still visible
    } finally {
      setLoadingSpot(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, country]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  // ── Refresh handler ──────────────────────────────────────────────────────────
  async function handleRefresh() {
    // Bust the server cache by appending a bust param (server ignores it for logic
    // but we can also add a force-refresh header; for now just reload with fresh state)
    setFromCache(false);
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
    <div className="space-y-6">
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

        {/* Cache/refresh info */}
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-white/80 disabled:opacity-40"
            title="Refresh chart data"
          >
            <RefreshCw className={cn("size-3.5", loadingChart && "animate-spin")} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main content: chart + spotlight ──────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: leaderboard */}
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
                    <TopChartRowSkeleton key={i} rank={i + 1} />
                  ))
                : apps.map((app, i) => (
                    <TopChartRow
                      key={app.appId}
                      app={app}
                      rank={i + 1}
                      isOwnApp={Boolean(ownAppId && app.appId === ownAppId)}
                    />
                  ))}
            </div>
          )}
        </div>

        {/* Right: AI spotlight */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <KeywordSpotlightCard
            spotlight={spotlight}
            loading={loadingChart || loadingSpot}
          />

          {/* What to do next card */}
          {!loadingChart && !loadingSpot && spotlight && (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-white/[0.02] p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
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
