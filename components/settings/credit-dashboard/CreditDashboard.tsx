"use client";

import { Suspense, useEffect, useState } from "react";
import { Brain, Clock, Info, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CreditDonutGauge } from "@/components/settings/credit-dashboard/CreditDonutGauge";
import type { UsageSummaryPayload } from "@/app/api/workspaces/[workspaceId]/billing/usage-summary/route";

// ─────────────────────────────────────────────────────────────────────────────
// Trend bar chart — lazy inner component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SpendTrendBars — pure DOM bar chart, zero charting library.
 *
 * Wrapped in its own component so it can be code-split behind a React Suspense
 * boundary: the parent streams the donut gauge and efficiency chips immediately
 * while this heavier animated bar set hydrates in the background.
 *
 * ## Visual design
 * Each bar is a `<div>` whose `height` is set via an inline style that animates
 * from 0 → target on mount via a CSS transition.  The transition delay is
 * staggered per bar (`i × 60ms`) to create a left-to-right cascade entrance.
 * This is entirely CSS — no JS animation loop, no requestAnimationFrame.
 *
 * ## Bar geometry
 * The maximum bar is clamped to MAX_BAR_HEIGHT_PX.  All others are scaled
 * proportionally: height = (value / max) × MAX_BAR_HEIGHT_PX.
 */

const MAX_BAR_HEIGHT_PX = 52;

type SpendTrendBarsProps = {
  history: number[];
};

function SpendTrendBars({ history }: SpendTrendBarsProps) {
  const [mounted, setMounted] = useState(false);

  // Trigger CSS height transition after first paint so bars animate in.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (history.length === 0) {
    return (
      <p className="text-[11px] text-zinc-600 italic">No spend data in the last 30 days</p>
    );
  }

  const maxVal = Math.max(...history, 1);

  return (
    <div className="flex h-[52px] items-end gap-1" aria-label="30-day credit spend trend">
      {history.map((val, i) => {
        const targetH = Math.round((val / maxVal) * MAX_BAR_HEIGHT_PX);
        const delay   = `${i * 60}ms`;
        return (
          <div
            key={i}
            role="presentation"
            title={`${val} credit${val !== 1 ? "s" : ""}`}
            className="flex-1 min-w-0 rounded-sm bg-emerald-500/70 ring-1 ring-emerald-400/20 transition-[height] ease-out"
            style={{
              height:           mounted ? `${targetH}px` : "2px",
              transitionDuration: "0.55s",
              transitionDelay:  delay,
            }}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton placeholders
// ─────────────────────────────────────────────────────────────────────────────

function DonutSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Skeleton className="size-[160px] rounded-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

function EfficiencySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

function TrendSkeleton() {
  return (
    <div className="flex h-[52px] items-end gap-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${16 + Math.random() * 36}px` }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro progress ring — inline SVG, used in efficiency chips
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MicroRing — a tiny 28px donut used as a visual accent inside the efficiency
 * chips.  Receives a 0–1 fill fraction and renders a matching stroke arc.
 * Shares the same dashoffset technique as CreditDonutGauge but without the
 * entrance animation (chips update silently on data refresh).
 */
function MicroRing({ fill, color }: { fill: number; color: string }) {
  const SIZE  = 28;
  const SW    = 4;
  const r     = (SIZE - SW) / 2;
  const C     = 2 * Math.PI * r;
  const offset = C * (1 - Math.min(1, Math.max(0, fill)));

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={SW}
      />
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={r}
        fill="none" stroke={color} strokeWidth={SW}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform={`rotate(-90, ${SIZE / 2}, ${SIZE / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type CreditDashboardProps = {
  workspaceId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CreditDashboard — infographic-style credit consumption panel.
 *
 * ## Data flow
 * Fetches `/api/workspaces/[workspaceId]/billing/usage-summary` on mount.
 * The response is a precomputed integer payload (no aggregation on the client).
 * A 60s `Cache-Control` header on the API means repeat visits within the
 * same minute hit the browser cache — zero extra Supabase queries.
 *
 * ## Layout zones
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Donut gauge (remaining %)  │  Efficiency chips          │
 *   │                             │  ┌─ Tokens processed ────┐ │
 *   │       SVG arc + centre      │  │  MicroRing  24 500    │ │
 *   │       percentage label      │  └───────────────────────┘ │
 *   │                             │  ┌─ Hours saved ─────────┐ │
 *   │                             │  │  MicroRing  14.5 h    │ │
 *   │                             │  └───────────────────────┘ │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  30-day spend trend  (Suspense-wrapped bar chart)        │
 *   └─────────────────────────────────────────────────────────┘
 *
 * ## Suspense strategy
 * `SpendTrendBars` is wrapped in `<Suspense>` with a skeleton fallback.  Because
 * this component is a Client Component, `Suspense` here gates on the `mounted`
 * state transition rather than on a `use()` promise — the bars animate in
 * after the first hydration cycle, while the donut and chips paint synchronously
 * on the first render.  This splits the interactive-paint critical path from the
 * decorative animation path without needing `React.lazy` or a dynamic import.
 */
export function CreditDashboard({ workspaceId }: CreditDashboardProps) {
  const [data, setData]       = useState<UsageSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res  = await fetch(
          `/api/workspaces/${workspaceId}/billing/usage-summary`,
          { credentials: "same-origin" },
        );
        const json = (await res.json()) as { ok: boolean; data?: UsageSummaryPayload; error?: { message: string } };

        if (!cancelled) {
          if (json.ok && json.data) {
            setData(json.data);
          } else {
            setError(json.error?.message ?? "Failed to load usage data");
          }
        }
      } catch {
        if (!cancelled) setError("Network error — please refresh");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Error state ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-white/[0.08] bg-zinc-950/60 shadow-none">
        <CardContent className="py-8 text-center text-sm text-zinc-500">
          {error}
        </CardContent>
      </Card>
    );
  }

  // ── Derived values (safe when data is null — loading skeleton renders) ──────
  const credits   = data?.credits;
  const efficiency = data?.efficiency;
  const history   = data?.history ?? [];

  const usedPct      = credits ? Math.round((credits.used / Math.max(1, credits.total)) * 100) : 0;
  const tokensFill   = efficiency ? Math.min(1, efficiency.tokensSpent / 50_000) : 0;
  const hoursFill    = efficiency ? Math.min(1, efficiency.savedHours / 40) : 0;

  return (
    <Card className="border-white/[0.08] bg-zinc-950/60 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold text-zinc-100">
          AI Credit Usage
        </CardTitle>
        <CardDescription className="text-zinc-500">
          Live snapshot of your billing period consumption and efficiency gains.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
      <TooltipProvider>

        {/* ── Zone 1: Donut + Efficiency ───────────────────────────────────── */}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">

          {/* Donut gauge */}
          {loading ? (
            <DonutSkeleton />
          ) : (
            <CreditDonutGauge
              remaining={credits?.remaining ?? 0}
              total={credits?.total ?? 1}
              sublabel={
                credits
                  ? `${credits.remaining.toLocaleString()} of ${credits.total.toLocaleString()} credits`
                  : undefined
              }
            />
          )}

          {/* Efficiency chips + consumed bar */}
          <div className="flex flex-1 flex-col gap-3 w-full">

            {/* Used-this-period strip */}
            {loading ? (
              <Skeleton className="h-7 w-40" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-white">
                  {credits?.used ?? 0}
                </span>
                <span className="text-sm text-zinc-500">
                  credits used ({usedPct}%)
                </span>
              </div>
            )}

            {/* Segmented consumption bar */}
            {loading ? (
              <Skeleton className="h-2 w-full rounded-full" />
            ) : (
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out",
                    usedPct > 80
                      ? "bg-rose-500"
                      : usedPct > 50
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            )}

            {/* Efficiency chips */}
            {loading ? (
              <EfficiencySkeleton />
            ) : (
              <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">

                {/* Tokens processed chip */}
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                  <MicroRing fill={tokensFill} color="#10b981" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                      <Brain className="size-2.5 shrink-0" aria-hidden />
                      Tokens processed
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100">
                      {(efficiency?.tokensSpent ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Hours saved chip */}
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                  <MicroRing fill={hoursFill} color="#f59e0b" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                      <Clock className="size-2.5 shrink-0" aria-hidden />
                      Hours saved
                      <Tooltip
                        asChild
                        side="top"
                        className="max-w-[280px]"
                        content="Estimated at a conservative baseline of 12 minutes saved per review for automated multi-market scraping, thematic clustering, and semantic synthesis."
                      >
                        <Info className="size-3.5 text-zinc-500 hover:text-zinc-400 cursor-help shrink-0" aria-label="Hours saved methodology" />
                      </Tooltip>
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100">
                      ~{Math.round(efficiency?.savedHours ?? 0)} hrs
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ── Zone 2: 30-day trend bars (Suspense-gated) ───────────────────── */}
        <div className="space-y-2 border-t border-white/[0.06] pt-5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Zap className="size-3 shrink-0" aria-hidden />
            30-day spend trend
          </p>

          {/*
           * Suspense wraps SpendTrendBars so the entrance animation (bars
           * growing upward) never blocks the donut gauge from painting.
           *
           * React Suspense in a Client Component boundaries on the `mounted`
           * state flip inside SpendTrendBars — the bars are invisible (height=2px)
           * for one frame, then transition to their target heights. This keeps
           * the first contentful paint frame lean.
           */}
          <Suspense fallback={<TrendSkeleton />}>
            {loading ? (
              <TrendSkeleton />
            ) : (
              <SpendTrendBars history={history} />
            )}
          </Suspense>

          <p className="text-[10px] text-zinc-600">
            Daily credit consumption over the last 30 billing cycles
          </p>
        </div>

      </TooltipProvider>
      </CardContent>
    </Card>
  );
}
