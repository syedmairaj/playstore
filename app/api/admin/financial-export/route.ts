import { createClient } from "@/lib/supabase/server";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import {
  computeFinancialHealth,
  dayAiCostUsd,
  fetchAdminFinancialSnapshot,
  type AdminFinancialRpcDay,
} from "@/lib/admin/financials";
import { serverCostForChartDays } from "@/lib/admin/server-cost";
import { isAdmin, type ProfileLike } from "@/lib/profile/is-admin";
import { NextResponse, type NextRequest } from "next/server";

function utcMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildMonthlyCsv(payload: {
  month: string;
  grossRevenueUsd: number;
  stripeFeesUsd: number;
  aiCostsUsd: number;
  serverCostUsd: number;
  netUsd: number;
  creditsPurchased: number;
  creditsSpent: number;
  rows: AdminFinancialRpcDay[];
}) {
  const lines = [
    "metric,value",
    `month,${csvEscape(payload.month)}`,
    `gross_revenue_usd,${payload.grossRevenueUsd}`,
    `stripe_fees_est_usd,${payload.stripeFeesUsd}`,
    `ai_costs_est_usd,${payload.aiCostsUsd}`,
    `server_cost_period_usd,${payload.serverCostUsd}`,
    `net_profit_est_usd,${payload.netUsd}`,
    `credits_purchased_month,${payload.creditsPurchased}`,
    `credits_spent_month_est,${payload.creditsSpent}`,
    "",
    "date,listing_aso_count,logo_batches,autofill_credits,suggest_credits,other_gen_credits,ai_cost_est_usd",
  ];
  for (const d of payload.rows) {
    lines.push(
      [
        d.date,
        d.listing_aso_count,
        d.logo_batches,
        d.autofill_credits,
        d.suggest_credits,
        d.other_generation_credits,
        dayAiCostUsd(d).toFixed(4),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "format must be csv or json" } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized" } },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!isAdmin(profile as ProfileLike | null)) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden" } },
      { status: 403 },
    );
  }

  const { from, to } = utcMonthBounds();
  const snap = await fetchAdminFinancialSnapshot({
    seriesFrom: from,
    seriesTo: to,
  });
  if (!snap.ok) {
    const status =
      snap.code === "no_auth_uid"
        ? 401
        : snap.code === "forbidden" || snap.code === "PGRST116"
          ? 403
          : 500;
    return NextResponse.json(
      { ok: false, error: { code: snap.code } },
      { status },
    );
  }

  const { data } = snap;
  const days = data.daily_series.length;
  const serverPeriod = serverCostForChartDays(days);
  const health = computeFinancialHealth({
    daily_series: data.daily_series,
    grossRevenueUsd: 0,
    hasPaymentsData: data.totals.has_payments_table,
    serverCostForPeriodUsd: serverPeriod,
  });

  const creditsPurchasedMonth = data.daily_series.reduce(
    (s, d) => s + d.credits_purchased,
    0,
  );
  const creditsSpentMonth = data.daily_series.reduce(
    (s, d) =>
      s +
      d.autofill_credits +
      d.suggest_credits +
      d.other_generation_credits +
      d.listing_ledger_credits +
      d.logo_batches * AI_CREDIT_COSTS.listing_logo_generation,
    0,
  );

  const month = `${from.slice(0, 7)}`;
  const bodyJson = {
    ok: true as const,
    month,
    range: { from, to },
    summary: {
      grossRevenueUsd: health.grossRevenueUsd,
      stripeFeesEstUsd: health.stripeFeesUsd,
      aiCostsEstUsd: health.aiCostsEstimatedUsd,
      serverCostPeriodUsd: health.serverCostUsd,
      netProfitEstUsd: health.netProfitUsd,
      marginPercent: health.marginPercent,
      creditsPurchasedInRange: creditsPurchasedMonth,
      creditsAttributedRough: creditsSpentMonth,
      totalsAllTime: data.totals,
    },
    daily: data.daily_series,
  };

  if (format === "json") {
    return NextResponse.json(bodyJson, {
      headers: {
        "Content-Disposition": `attachment; filename="financial-report-${month}.json"`,
      },
    });
  }

  const csv = buildMonthlyCsv({
    month,
    grossRevenueUsd: health.grossRevenueUsd,
    stripeFeesUsd: health.stripeFeesUsd,
    aiCostsUsd: health.aiCostsEstimatedUsd,
    serverCostUsd: health.serverCostUsd,
    netUsd: health.netProfitUsd,
    creditsPurchased: creditsPurchasedMonth,
    creditsSpent: creditsSpentMonth,
    rows: data.daily_series,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financial-report-${month}.csv"`,
    },
  });
}
