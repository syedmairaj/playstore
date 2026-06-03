import "server-only";

import { ADMIN_AI_TRANSACTION_LOGS_TABLE } from "@/lib/admin/log-ai-transaction";
import { normalizePlan, PLAN_META, type PlanId } from "@/lib/plan-limits";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPostgrestSchemaUnavailable } from "@/lib/supabase/postgrest-errors";

const FEATURE_LABELS: Record<string, string> = {
  localization: "Listing Localization",
  listing_localize: "Listing Localization",
  reviews_ai_reply: "Review Smart Reply",
  review_reply: "Review Smart Reply",
  serper_competitor_spy: "Competitor Spy Analytics",
  competitor_spy: "Competitor Spy Analytics",
  serper_keyword_refresh: "Keyword Serper Refresh",
  serper_play_store_preview: "Keyword Tracker Serper Preview",
};

export function featureLabelForSlug(slug: string): string {
  return FEATURE_LABELS[slug] ?? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type FeatureLeaderboardRow = {
  featureSlug: string;
  featureLabel: string;
  totalRuns: number;
  totalCredits: number;
  geminiUsd: number;
  serperUsd: number;
  totalRawCogsUsd: number;
};

export type PlanMarginRow = {
  plan: PlanId;
  planLabel: string;
  workspaceCount: number;
  assumedRevenueUsd: number;
  apiCostUsd: number;
  marginUsd: number;
  marginPercent: number | null;
};

function rowCogsUsd(row: {
  raw_cogs_usd?: number | string | null;
  raw_usd_cost?: number | string | null;
}): number {
  const cogs = row.raw_cogs_usd;
  if (cogs != null && cogs !== "") return Number(cogs);
  return Number(row.raw_usd_cost ?? 0);
}

function rowProviderGeminiUsd(
  row: {
    provider_service?: string | null;
    input_cost_usd?: number | string | null;
    output_cost_usd?: number | string | null;
    raw_cogs_usd?: number | string | null;
    raw_usd_cost?: number | string | null;
  },
): number {
  const provider = String(row.provider_service ?? "gemini").toLowerCase();
  if (provider === "serper") return 0;
  const input = Number(row.input_cost_usd ?? 0);
  const output = Number(row.output_cost_usd ?? 0);
  if (input > 0 || output > 0) return input + output;
  return rowCogsUsd(row);
}

function rowProviderSerperUsd(
  row: {
    provider_service?: string | null;
    raw_cogs_usd?: number | string | null;
    raw_usd_cost?: number | string | null;
  },
): number {
  const provider = String(row.provider_service ?? "").toLowerCase();
  if (provider === "serper") return rowCogsUsd(row);
  return 0;
}

export async function fetchFeatureLeaderboard(): Promise<
  | { ok: true; rows: FeatureLeaderboardRow[] }
  | { ok: false; code: "schema_unavailable" | "query_error"; message: string }
> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from(ADMIN_AI_TRANSACTION_LOGS_TABLE)
      .select(
        "feature_slug, credits_charged, provider_service, input_cost_usd, output_cost_usd, raw_cogs_usd, raw_usd_cost",
      );

    if (error) {
      if (isPostgrestSchemaUnavailable(error, ADMIN_AI_TRANSACTION_LOGS_TABLE)) {
        return { ok: false, code: "schema_unavailable", message: error.message };
      }
      return { ok: false, code: "query_error", message: error.message };
    }

    const map = new Map<string, FeatureLeaderboardRow>();
    for (const row of data ?? []) {
      const slug = String(row.feature_slug ?? "unknown");
      const credits = Number(row.credits_charged ?? 0);
      const geminiUsd = rowProviderGeminiUsd(row);
      const serperUsd = rowProviderSerperUsd(row);
      const cogs = rowCogsUsd(row);

      const prev = map.get(slug) ?? {
        featureSlug: slug,
        featureLabel: featureLabelForSlug(slug),
        totalRuns: 0,
        totalCredits: 0,
        geminiUsd: 0,
        serperUsd: 0,
        totalRawCogsUsd: 0,
      };
      prev.totalRuns += 1;
      prev.totalCredits += credits;
      prev.geminiUsd += geminiUsd;
      prev.serperUsd += serperUsd;
      prev.totalRawCogsUsd += cogs;
      map.set(slug, prev);
    }

    const rows = Array.from(map.values()).sort(
      (a, b) => b.totalRawCogsUsd - a.totalRawCogsUsd,
    );
    return { ok: true, rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "query_error", message };
  }
}

export async function fetchPlanMarginRows(): Promise<
  | { ok: true; rows: PlanMarginRow[] }
  | { ok: false; code: "schema_unavailable" | "query_error"; message: string }
> {
  try {
    const admin = getSupabaseAdmin();

    const { data: workspaces, error: wsError } = await admin
      .from("workspaces")
      .select("id, plan");

    if (wsError) {
      return { ok: false, code: "query_error", message: wsError.message };
    }

    const { data: logs, error: logError } = await admin
      .from(ADMIN_AI_TRANSACTION_LOGS_TABLE)
      .select("workspace_id, raw_cogs_usd, raw_usd_cost");

    if (logError) {
      if (isPostgrestSchemaUnavailable(logError, ADMIN_AI_TRANSACTION_LOGS_TABLE)) {
        return { ok: false, code: "schema_unavailable", message: logError.message };
      }
      return { ok: false, code: "query_error", message: logError.message };
    }

    const costByWorkspace = new Map<string, number>();
    for (const row of logs ?? []) {
      const wsId = row.workspace_id as string | null;
      if (!wsId) continue;
      const usd = rowCogsUsd(row);
      costByWorkspace.set(wsId, (costByWorkspace.get(wsId) ?? 0) + usd);
    }

    const tierCounts = new Map<PlanId, { workspaces: number; apiCostUsd: number }>();
    for (const ws of workspaces ?? []) {
      const plan = normalizePlan(ws.plan as string | null);
      const apiCost = costByWorkspace.get(ws.id as string) ?? 0;
      const prev = tierCounts.get(plan) ?? { workspaces: 0, apiCostUsd: 0 };
      prev.workspaces += 1;
      prev.apiCostUsd += apiCost;
      tierCounts.set(plan, prev);
    }

    const planOrder: PlanId[] = ["free", "pro", "growth"];
    const rows: PlanMarginRow[] = planOrder.map((plan) => {
      const bucket = tierCounts.get(plan) ?? { workspaces: 0, apiCostUsd: 0 };
      const assumedRevenueUsd =
        bucket.workspaces * PLAN_META[plan].priceMonthly;
      const marginUsd = assumedRevenueUsd - bucket.apiCostUsd;
      const marginPercent =
        assumedRevenueUsd > 0
          ? (marginUsd / assumedRevenueUsd) * 100
          : null;
      return {
        plan,
        planLabel: PLAN_META[plan].label,
        workspaceCount: bucket.workspaces,
        assumedRevenueUsd,
        apiCostUsd: bucket.apiCostUsd,
        marginUsd,
        marginPercent,
      };
    });

    return { ok: true, rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "query_error", message };
  }
}
