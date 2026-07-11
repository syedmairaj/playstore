import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string; appId: string }> };

// ── Types ─────────────────────────────────────────────────────────────────────

type MetricRow = {
  id: string;
  metric_week: string;
  conversion_rate: number | null;
  store_visitors: number | null;
  category_rank: number | null;
  search_visibility: number | null;
  cost_per_install: number | null;
  note: string | null;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  created_at: string;
  title: string;
  short_description: string;
  signals: string[];
  review_signal_count: number;
  market_signal_count: number;
  competitor_signal_count: number;
  strategy_summary: string | null;
  aso_score: number | null;
  tone_style: string | null;
  quality_status: string | null;
};

// ── Attribution helpers ───────────────────────────────────────────────────────

function fmtPct(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function fmtRank(delta: number | null): string {
  if (delta === null) return "—";
  // Negative rank delta = improvement (moved up the chart)
  if (delta < 0) return `↑ ${Math.abs(delta)} positions`;
  if (delta > 0) return `↓ ${delta} positions`;
  return "unchanged";
}

function fmtVisitors(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()}`;
}

/** CPI delta in currency units — negative = improvement (lower cost per install). */
function fmtCpi(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta >= 0 ? "+" : "−";
  const abs = Math.abs(delta);
  return `${sign}$${abs.toFixed(2)}`;
}

function rowHasMetrics(row: MetricRow | null): boolean {
  if (!row) return false;
  return (
    row.conversion_rate != null ||
    row.store_visitors != null ||
    row.category_rank != null ||
    row.search_visibility != null ||
    row.cost_per_install != null
  );
}

type MetricsStatus = "none" | "partial" | "comparable";

function resolveMetricsStatus(
  before: MetricRow | null,
  after: MetricRow | null,
  hasComparableDelta: boolean,
): MetricsStatus {
  if (hasComparableDelta) return "comparable";
  if (rowHasMetrics(before) || rowHasMetrics(after)) return "partial";
  return "none";
}

/**
 * Finds the metric row immediately BEFORE a snapshot (baseline)
 * and the metric row immediately AFTER it (post-optimisation).
 */
function findAdjacentMetrics(
  snapshotDate: string,
  metrics: MetricRow[],
): { before: MetricRow | null; after: MetricRow | null } {
  // metrics are already ordered desc by metric_week
  const snapTs = new Date(snapshotDate).getTime();

  // "before" = most recent metric with metric_week BEFORE the snapshot
  const before =
    metrics.find((m) => new Date(m.metric_week).getTime() < snapTs) ?? null;

  // "after" = most recent metric with metric_week ON or AFTER the snapshot
  const afterCandidates = metrics.filter(
    (m) => new Date(m.metric_week).getTime() >= snapTs,
  );
  const after =
    afterCandidates.length > 0
      ? afterCandidates[afterCandidates.length - 1] // oldest = closest post
      : null;

  return { before, after };
}

/**
 * Computes a plain-English attribution analysis sentence from the snapshot's
 * signals and the measured metric deltas.
 *
 * This runs on the server without an LLM — it's a rule-based analyst that
 * mirrors the prompt spec:
 *   "STRATEGY ATTRIBUTION: Determine if the performance change is attributable
 *    to the Synthesis Logic."
 */
function buildAttributionAnalysis(
  snapshot: SnapshotRow,
  convDelta: number | null,
  visitorsDelta: number | null,
  rankDelta: number | null,
  visibilityDelta: number | null,
  cpiDelta: number | null,
  before: MetricRow | null,
  after: MetricRow | null,
): string {
  const parts: string[] = [];

  // Lead with what signals drove the generation
  const reviewCount = snapshot.review_signal_count;
  const marketCount = snapshot.market_signal_count;

  if (reviewCount > 0 && marketCount > 0) {
    parts.push(
      `This listing was generated using ${reviewCount} review issue${reviewCount > 1 ? "s" : ""} and ${marketCount} market keyword${marketCount > 1 ? "s" : ""}.`,
    );
  } else if (reviewCount > 0) {
    parts.push(
      `This listing addressed ${reviewCount} user-reported issue${reviewCount > 1 ? "s" : ""} from your reviews.`,
    );
  } else if (marketCount > 0) {
    parts.push(
      `This listing injected ${marketCount} trending market keyword${marketCount > 1 ? "s" : ""} from Market Intelligence.`,
    );
  } else {
    parts.push("This listing was generated without additional signal context.");
  }

  // Attribution based on deltas
  if (convDelta !== null) {
    if (convDelta > 1) {
      parts.push(
        reviewCount > 0
          ? `The conversion rate improvement (+${convDelta.toFixed(1)}%) is consistent with resolving review pain-points that were causing user hesitation before installing.`
          : `The conversion rate improvement (+${convDelta.toFixed(1)}%) may be attributable to stronger CTA copy and keyword alignment.`,
      );
    } else if (convDelta < -1) {
      parts.push(
        `Conversion rate declined (${convDelta.toFixed(1)}%). Consider whether the tone shift or new keyword focus misaligned with the target audience intent.`,
      );
    } else {
      parts.push(`Conversion rate held flat — the listing change was neutral on direct conversion.`);
    }
  }

  if (visibilityDelta !== null && Math.abs(visibilityDelta) > 0.5) {
    if (visibilityDelta > 0) {
      parts.push(
        marketCount > 0
          ? `Search visibility improved (+${visibilityDelta.toFixed(1)} pts), likely driven by the market keyword injection into the title and short description.`
          : `Search visibility improved (+${visibilityDelta.toFixed(1)} pts).`,
      );
    } else {
      parts.push(
        `Search visibility declined (${visibilityDelta.toFixed(1)} pts). The new title or short description may have de-prioritised high-volume query terms.`,
      );
    }
  }

  if (rankDelta !== null && rankDelta !== 0) {
    parts.push(
      rankDelta < 0
        ? `Category rank improved by ${Math.abs(rankDelta)} position${Math.abs(rankDelta) > 1 ? "s" : ""}.`
        : `Category rank declined by ${rankDelta} position${rankDelta > 1 ? "s" : ""}.`,
    );
  }

  if (cpiDelta !== null && Math.abs(cpiDelta) >= 0.05) {
    if (cpiDelta < 0) {
      parts.push(
        `Cost per install improved by $${Math.abs(cpiDelta).toFixed(2)} — paid acquisition efficiency gained after this listing change.`,
      );
    } else {
      parts.push(
        `Cost per install rose by $${cpiDelta.toFixed(2)}. Review tone arm and keyword focus if UAC efficiency regressed.`,
      );
    }
  } else if (after?.cost_per_install != null && before?.cost_per_install == null) {
    parts.push(
      `Post-optimization CPI is logged at $${after.cost_per_install.toFixed(2)} (week ${after.metric_week}). Enter a baseline week from before this listing change to measure CPI delta.`,
    );
  } else if (before?.cost_per_install != null && after?.cost_per_install == null) {
    parts.push(
      `Baseline CPI is $${before.cost_per_install.toFixed(2)} (week ${before.metric_week}). Log post-optimization CPI to compare paid acquisition efficiency.`,
    );
  }

  if (snapshot.strategy_summary) {
    parts.push(`Strategy used: "${snapshot.strategy_summary}"`);
  }

  return parts.join(" ") || "Insufficient metric data to determine attribution.";
}

/**
 * Proactive next-step recommendation rule engine.
 * Mirrors: "PROACTIVE RECOMMENDATION: Based on the performance trend, suggest the next pivot."
 */
function buildNextStep(
  convDelta: number | null,
  visibilityDelta: number | null,
  rankDelta: number | null,
  cpiDelta: number | null,
  before: MetricRow | null,
  after: MetricRow | null,
  snapshot: SnapshotRow,
): string {
  // Conversion up but visibility flat/down → keyword gap in title
  if (convDelta !== null && convDelta > 1 && (visibilityDelta === null || visibilityDelta < 0.5)) {
    return "Conversion is improving. Now focus on search discovery: test a title variant that front-loads your highest-volume keyword. Run an A/B test in Play Console Listing Experiments.";
  }

  // Visibility up but conversion flat/down → CTA or screenshot mismatch
  if (visibilityDelta !== null && visibilityDelta > 1 && (convDelta === null || convDelta < 0.5)) {
    return "Search visibility is growing but conversion isn't following. Audit your first two screenshots — they are the primary conversion lever once users land on your store page. Consider adding a Market Intelligence spotlight to your next generation to inject higher-intent keywords.";
  }

  // Both up → compound momentum — push another signal type
  if (
    convDelta !== null && convDelta > 1 &&
    visibilityDelta !== null && visibilityDelta > 1
  ) {
    const missingSignal =
      snapshot.review_signal_count === 0
        ? "Review signals (stage review issues in the Growth Hub)"
        : snapshot.market_signal_count === 0
          ? "Market Intelligence spotlight keywords"
          : "Competitor Weaknesses from the Competitor Spy";
    return `Both conversion and visibility are trending up — this strategy is working. To compound the momentum, add ${missingSignal} to your next generation for maximum synthesis quality.`;
  }

  // Rank improved but other metrics flat → early signal, wait
  if (rankDelta !== null && rankDelta < -2 && convDelta === null && visibilityDelta === null) {
    return "Category rank is improving. Enter your conversion rate and store visitors from Play Console next week to quantify the full impact and unlock attribution analysis.";
  }

  // Both declining
  if (convDelta !== null && convDelta < -1 && visibilityDelta !== null && visibilityDelta < -1) {
    return "Both conversion and visibility are down. Consider reverting to the previous listing or running a new generation with a different tone style. Also check whether an external factor (competitor campaign, app store algorithm change) coincides with this period.";
  }

  // No comparable deltas yet
  if (
    convDelta === null &&
    visibilityDelta === null &&
    rankDelta === null &&
    cpiDelta === null
  ) {
    if (after && rowHasMetrics(after) && !rowHasMetrics(before)) {
      const missing: string[] = [];
      if (after.cost_per_install != null) {
        missing.push("baseline CPI from the week before your listing change");
      }
      if (after.conversion_rate == null || after.store_visitors == null) {
        missing.push("conversion rate and store visitors from Play Console");
      }
      const hint =
        missing.length > 0
          ? ` Add ${missing.join("; also add ")}.`
          : " Add a baseline week from before this listing change.";
      return `Post-optimization metrics saved for week ${after.metric_week}.${hint} Two weeks (before + after) unlock delta attribution.`;
    }

    if (after && rowHasMetrics(after) && rowHasMetrics(before)) {
      return "Metrics are logged for both weeks but no comparable fields overlap yet. Enter the same fields (e.g. CPI, conversion rate, store visitors) in baseline and post weeks to unlock deltas.";
    }

    if (!after || !rowHasMetrics(after)) {
      return "No post-optimization metrics entered yet. Enter your conversion rate and store visitors from Play Console (Acquire users → Store listing analytics) once a week to unlock attribution analysis.";
    }
  }

  return "Continue monitoring. Enter metrics again next week to identify the trend direction and get a targeted optimization recommendation.";
}

// ── GET /api/workspaces/[workspaceId]/apps/[appId]/attribution ────────────────
// Returns the last 6 snapshots each with their before/after metric delta
// and a computed attribution analysis + next-step recommendation.

export async function GET(_request: NextRequest, context: Ctx) {
  const { workspaceId, appId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  // Fetch last 6 snapshots and last 12 weeks of metrics in parallel
  const [snapshotsResult, metricsResult] = await Promise.all([
    supabase
      .from("listing_snapshots")
      .select(
        "id, created_at, title, short_description, signals, " +
        "review_signal_count, market_signal_count, competitor_signal_count, " +
        "strategy_summary, aso_score, tone_style, quality_status",
      )
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("listing_metrics")
      .select(
        "id, metric_week, conversion_rate, store_visitors, category_rank, search_visibility, cost_per_install, note, created_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .order("metric_week", { ascending: false })
      .limit(12),
  ]);

  if (snapshotsResult.error || metricsResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "db_error",
          message: snapshotsResult.error?.message ?? metricsResult.error?.message,
        },
      },
      { status: 500 },
    );
  }

  const snapshots = (snapshotsResult.data ?? []) as unknown as SnapshotRow[];
  const metrics = (metricsResult.data ?? []) as unknown as MetricRow[];

  // Build one attribution record per snapshot
  const attributionRecords = snapshots.map((snap) => {
    const { before, after } = findAdjacentMetrics(snap.created_at, metrics);

    const convDelta =
      before?.conversion_rate != null && after?.conversion_rate != null
        ? after.conversion_rate - before.conversion_rate
        : null;

    const visitorsDelta =
      before?.store_visitors != null && after?.store_visitors != null
        ? after.store_visitors - before.store_visitors
        : null;

    const rankDelta =
      before?.category_rank != null && after?.category_rank != null
        ? after.category_rank - before.category_rank
        : null;

    const visibilityDelta =
      before?.search_visibility != null && after?.search_visibility != null
        ? after.search_visibility - before.search_visibility
        : null;

    const cpiDelta =
      before?.cost_per_install != null && after?.cost_per_install != null
        ? after.cost_per_install - before.cost_per_install
        : null;

    const hasComparableDelta =
      convDelta !== null ||
      visitorsDelta !== null ||
      rankDelta !== null ||
      cpiDelta !== null;

    const metricsStatus = resolveMetricsStatus(before, after, hasComparableDelta);

    const hasData = hasComparableDelta || metricsStatus === "partial";

    // Verdict: success if any key metric improved meaningfully
    const verdict: "success" | "needs_adjustment" | "pending" =
      !hasData
        ? "pending"
        : (convDelta !== null && convDelta > 1) ||
          (visibilityDelta !== null && visibilityDelta > 1) ||
          (rankDelta !== null && rankDelta < -1) ||
          (cpiDelta !== null && cpiDelta < -0.05)
          ? "success"
          : (convDelta !== null && convDelta < -1) ||
            (visibilityDelta !== null && visibilityDelta < -1) ||
            (rankDelta !== null && rankDelta > 1) ||
            (cpiDelta !== null && cpiDelta > 0.05)
            ? "needs_adjustment"
            : "pending";

    // Signals breakdown for the UI card
    const reviewSignals = snap.signals.filter(
      (s) => !s.startsWith("market_spotlight:"),
    );
    const marketSignals = snap.signals
      .filter((s) => s.startsWith("market_spotlight:"))
      .map((s) => s.replace(/^market_spotlight:/, "").trim());

    return {
      snapshotId: snap.id,
      createdAt: snap.created_at,
      title: snap.title,
      shortDescription: snap.short_description,
      strategySummary: snap.strategy_summary,
      asoScore: snap.aso_score,
      toneStyle: snap.tone_style,
      qualityStatus: snap.quality_status,

      // Signal breakdown
      reviewSignals,
      marketSignals,
      reviewSignalCount: snap.review_signal_count,
      marketSignalCount: snap.market_signal_count,

      // Metric snapshots used for attribution
      baselineMetrics: before
        ? {
            week: before.metric_week,
            conversionRate: before.conversion_rate,
            storeVisitors: before.store_visitors,
            categoryRank: before.category_rank,
            searchVisibility: before.search_visibility,
            costPerInstall: before.cost_per_install,
          }
        : null,
      postMetrics: after
        ? {
            week: after.metric_week,
            conversionRate: after.conversion_rate,
            storeVisitors: after.store_visitors,
            categoryRank: after.category_rank,
            searchVisibility: after.search_visibility,
            costPerInstall: after.cost_per_install,
          }
        : null,

      // Computed attribution (matches the prompt spec output format)
      performanceDelta: {
        conversionRateChange: fmtPct(convDelta),
        searchVisibilityChange: fmtPct(visibilityDelta),
        rankShift: fmtRank(rankDelta),
        storeVisitorsChange: fmtVisitors(visitorsDelta),
        costPerInstallChange: fmtCpi(cpiDelta),
      },
      attributionAnalysis: buildAttributionAnalysis(
        snap,
        convDelta,
        visitorsDelta,
        rankDelta,
        visibilityDelta,
        cpiDelta,
        before,
        after,
      ),
      nextStep: buildNextStep(
        convDelta,
        visibilityDelta,
        rankDelta,
        cpiDelta,
        before,
        after,
        snap,
      ),
      metricsStatus,
      verdict,
    };
  });

  return NextResponse.json({ ok: true, attribution: attributionRecords });
}
