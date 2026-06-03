import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UsageSummaryPayload = {
  credits: {
    /** Credits consumed this billing period (allocation − remaining). */
    used: number;
    /** Total allocation for this billing period. */
    total: number;
    /** Credits still available. */
    remaining: number;
  };
  efficiency: {
    /**
     * Proxy token-spend figure: sum of |amount| × TOKEN_PER_CREDIT across the
     * history window. Displayed as a human-readable "tokens processed" metric
     * on the infographic — not billed separately, just an engagement indicator.
     */
    tokensSpent: number;
    /**
     * Estimated hours saved: each credit spent ≈ 0.167 hours of manual ASO
     * work avoided (empirical estimate from internal benchmarks).
     */
    savedHours: number;
  };
  /**
   * Daily credit-spend bucketed into at most 10 chronological slots covering
   * the last 30 days.  Each element is the absolute sum of credits consumed on
   * that calendar day.  Days with zero consumption are omitted — callers
   * receive only non-zero bars, making the sparkline density-aware.
   *
   * Pre-aggregated here so the client receives integers, never raw ledger rows.
   */
  history: number[];
};

type Ctx = { params: Promise<{ workspaceId: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Estimated Gemini tokens processed per credit consumed. */
const TOKEN_PER_CREDIT = 500;

/** Hours of manual ASO work avoided per credit spent. */
const HOURS_PER_CREDIT = 0.167;

/**
 * Maximum history bars returned.  Keeping this at 10 means the client can
 * render a 10-column mini-bar chart with no layout math.
 */
const MAX_HISTORY_BARS = 10;

/** Lookback window for the efficiency + history aggregation. */
const HISTORY_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  // ── Parallel data fetch ────────────────────────────────────────────────────
  //
  // Two queries run concurrently:
  //   1. workspaces row — gives us allocation + remaining (O(1) index seek)
  //   2. credits_ledger rows from the last HISTORY_DAYS days — aggregated
  //      client-side below to avoid a GROUP BY round-trip.  We cap at 500 rows
  //      which is far beyond any realistic 30-day spend for any plan tier.
  //
  const cutoffIso = new Date(
    Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: workspace, error: wsErr }, { data: ledger, error: ledgerErr }] =
    await Promise.all([
      supabase
        .from("workspaces")
        .select("ai_credits_remaining, ai_credits_monthly_allocation")
        .eq("id", workspaceId)
        .maybeSingle(),
      supabase
        .from("credits_ledger")
        .select("created_at, amount")
        .eq("workspace_id", workspaceId)
        .lt("amount", 0) // consumption rows only (negative amounts)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: true })
        .limit(500),
    ]);

  if (wsErr || !workspace) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Workspace not found" } },
      { status: 404 },
    );
  }
  if (ledgerErr) {
    return NextResponse.json(
      { ok: false, error: { code: "ledger_error", message: ledgerErr.message } },
      { status: 500 },
    );
  }

  // ── Precompute credit totals ───────────────────────────────────────────────
  const total = typeof workspace.ai_credits_monthly_allocation === "number"
    ? workspace.ai_credits_monthly_allocation
    : 0;
  const remaining = typeof workspace.ai_credits_remaining === "number"
    ? workspace.ai_credits_remaining
    : 0;
  const used = Math.max(0, total - remaining);

  // ── Precompute efficiency ──────────────────────────────────────────────────
  //
  // `ledger` only contains negative (consumption) rows from the last 30 days.
  // Sum of absolute amounts = total credits burned in the window.
  //
  const rows = ledger ?? [];
  const totalConsumedInWindow = rows.reduce(
    (acc, r) => acc + Math.abs(r.amount),
    0,
  );
  const tokensSpent = Math.round(totalConsumedInWindow * TOKEN_PER_CREDIT);
  const savedHours  = parseFloat((totalConsumedInWindow * HOURS_PER_CREDIT).toFixed(1));

  // ── Precompute history bars ────────────────────────────────────────────────
  //
  // Group ledger rows by calendar day ("YYYY-MM-DD"), sum absolute amounts per
  // day, then slice to the last MAX_HISTORY_BARS non-zero days.
  //
  // Bucketing is O(n) over the ledger rows — no DB round-trip.
  //
  const dayBuckets: Record<string, number> = {};
  for (const row of rows) {
    const day = row.created_at.slice(0, 10); // "YYYY-MM-DD"
    dayBuckets[day] = (dayBuckets[day] ?? 0) + Math.abs(row.amount);
  }

  const history = Object.entries(dayBuckets)
    .sort(([a], [b]) => a.localeCompare(b))    // chronological
    .map(([, v]) => Math.round(v))              // integer per bar
    .slice(-MAX_HISTORY_BARS);                  // last N bars

  // ── Response ───────────────────────────────────────────────────────────────
  const payload: UsageSummaryPayload = {
    credits: { used, total, remaining },
    efficiency: { tokensSpent, savedHours },
    history,
  };

  return NextResponse.json({ ok: true, data: payload }, {
    headers: {
      // Short-lived cache: billing numbers change with every credit spend.
      // 60s stale-while-revalidate keeps the UI snappy without staleness risk.
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}
