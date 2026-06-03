import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { loadWorkspaceKeywords } from "@/lib/keywords/load-workspace-keywords";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import {
  acquireGenerationLock,
  releaseGenerationLock,
} from "@/lib/server/generation-idempotency-lock";
import { logUsage } from "@/lib/usage-log";
import { getClientIp } from "@/lib/client-ip";

const ROUTE = "POST /api/workspaces/[workspaceId]/alerts/scan";
const LOCK_ACTION = "marketplace_scan";

/**
 * POST /api/workspaces/[workspaceId]/alerts/scan
 *
 * On-demand marketplace ecosystem scan:
 *   1. Auth + membership gate
 *   2. Idempotency lock (prevents double-click double-charge)
 *   3. Pre-flight credit balance check
 *   4. Atomic credit deduction via RPC
 *   5. Keyword rank snapshot diffing → write workspace_alerts rows for any drops ≥ 3
 *   6. Refund on any processing failure
 *   7. Returns { ok, alertsWritten, creditsRemaining } for client-side refresh
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const started = Date.now();
  const clientIp = getClientIp(request);
  const { workspaceId } = await context.params;

  // ── Admin client (usage logging) ─────────────────────────────────────────
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Configuration error";
    return NextResponse.json(
      { ok: false, error: { code: "config", message } },
      { status: 503 },
    );
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  // ── Membership ───────────────────────────────────────────────────────────
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  // ── Idempotency lock ─────────────────────────────────────────────────────
  // Prevents double-click or network retry from charging twice within 4 s.
  if (!acquireGenerationLock(workspaceId, LOCK_ACTION)) {
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: "idempotency_lock_held",
      meta: { user_id: user.id, workspace_id: workspaceId },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "duplicate_request",
          message: "A scan is already in progress for this workspace. Please wait a moment.",
        },
      },
      { status: 429 },
    );
  }

  const creditCost = AI_CREDIT_COSTS.marketplace_scan;

  // ── Pre-flight balance check ─────────────────────────────────────────────
  const balancePre = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  if (!balancePre.ok) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not read AI credit balance. Try again shortly." } },
      { status: 503 },
    );
  }
  if (balancePre.remaining < creditCost) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: "insufficient_credits",
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        remaining: balancePre.remaining,
        required: creditCost,
      },
    });
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, balancePre.remaining),
      { status: 402 },
    );
  }

  // ── Atomic credit deduction ──────────────────────────────────────────────
  const debit = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: "On-demand marketplace ecosystem scan",
    sourceType: "generation",
    meta: { route: ROUTE, tool: "marketplace_scan" },
  });

  if (!debit.ok) {
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    if (debit.code === "insufficient_credits") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(debit.required ?? creditCost, debit.remaining ?? 0),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "wallet_error", message: "Could not reserve credits. Try again shortly." } },
      { status: 503 },
    );
  }

  const ledgerId = debit.ledgerId;
  const creditsRemaining = debit.balanceAfter;

  // ── Marketplace scan ─────────────────────────────────────────────────────
  // Loads tracked keywords, compares latest rank snapshots to previous, and
  // writes workspace_alerts rows for any drops ≥ DROP_THRESHOLD positions.
  const DROP_THRESHOLD = 3;
  let alertsWritten = 0;

  try {
    const loaded = await loadWorkspaceKeywords(supabase, workspaceId, {});
    if (!loaded.ok) {
      throw new Error(`Failed to load keywords: ${loaded.message}`);
    }

    const keywords = loaded.keywords;
    const alertRows: {
      workspace_id: string;
      keyword_id: string;
      type: "rank_drop" | "rank_threshold" | "aso_rank_improvement";
      title: string;
      body: string;
      severity: "info" | "warning";
      meta: Record<string, unknown>;
    }[] = [];

    for (const kw of keywords) {
      // Each keyword row exposes latestPerCountry: Record<countryCode, { rank, prevRank }>
      const latestPerCountry = (kw as { latestPerCountry?: Record<string, { rank: number | null; prevRank?: number | null }> }).latestPerCountry;
      if (!latestPerCountry) continue;

      for (const [country, snapshot] of Object.entries(latestPerCountry)) {
        const { rank, prevRank } = snapshot;
        if (
          rank == null ||
          prevRank == null ||
          typeof rank !== "number" ||
          typeof prevRank !== "number"
        ) continue;

        const drop = rank - prevRank; // positive = dropped (rank number increased = worse)
        if (drop < DROP_THRESHOLD) continue;

        const term = (kw as { term?: string }).term ?? "keyword";
        alertRows.push({
          workspace_id: workspaceId,
          keyword_id: kw.id as string,
          type: "rank_drop",
          title: `Keyword Position Drop (−${drop})`,
          body: `Your tracked keyword "${term}" dropped from position #${prevRank} to #${rank} in the ${country.toUpperCase()} marketplace.`,
          severity: drop >= 5 ? "warning" : "info",
          meta: {
            keywordTerm: term,
            fromRank: prevRank,
            toRank: rank,
            positions: drop,
            country,
            scan_trigger: "on_demand",
          },
        });
      }
    }

    if (alertRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("workspace_alerts")
        .insert(alertRows);
      if (insertErr) {
        throw new Error(`Failed to write alerts: ${insertErr.message}`);
      }
      alertsWritten = alertRows.length;
    }

    // ── Success ───────────────────────────────────────────────────────────
    releaseGenerationLock(workspaceId, LOCK_ACTION);
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: true,
      durationMs: Date.now() - started,
      meta: {
        user_id: user.id,
        workspace_id: workspaceId,
        keywords_scanned: keywords.length,
        alerts_written: alertsWritten,
      },
    });

    return NextResponse.json({
      ok: true,
      alertsWritten,
      creditsRemaining,
      meta: {
        keywordsScanned: keywords.length,
        durationMs: Date.now() - started,
      },
    });
  } catch (e) {
    // ── Refund on failure ─────────────────────────────────────────────────
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "Marketplace scan failed before completing",
    });
    releaseGenerationLock(workspaceId, LOCK_ACTION);

    const message = e instanceof Error ? e.message : "Scan failed unexpectedly";
    await logUsage(admin, {
      route: ROUTE,
      clientIp,
      success: false,
      durationMs: Date.now() - started,
      errorMessage: message.slice(0, 2000),
      meta: { user_id: user.id, workspace_id: workspaceId },
    });

    return NextResponse.json(
      { ok: false, error: { code: "scan_error", message: "Marketplace scan could not be completed. Your credit has been refunded." } },
      { status: 500 },
    );
  }
}
