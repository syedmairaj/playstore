import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createModelGatewayCorrelationId,
  generateContentValidated,
  isModelGatewayError,
} from "@/lib/ai/modelGateway";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import type { TopChartApp } from "@/lib/play-store/fetch-top-charts";
import { getCategoryLabel } from "@/lib/market/category-labels";
import {
  buildMarketIntelligenceReport,
  type RawCategorizedSpotlightModel,
} from "@/lib/market/categorize-market-intel";
import type {
  ChartAppForThreats,
  LegacyKeywordSpotlightResult,
  MarketIntelligenceReport,
} from "@/lib/market/market-intel-signal-types";

const ROUTE = "POST /api/market/keyword-spotlight";
const CREDIT_COST = AI_CREDIT_COSTS.market_keyword_spotlight;

/** @deprecated Use MarketIntelligenceReport — kept for session-cache migration. */
export type KeywordSpotlightResult = LegacyKeywordSpotlightResult;

export type { MarketIntelligenceReport };

const SPOTLIGHT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    growthKeywords: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          searchVolumeScore: { type: "NUMBER" },
          conversionImpactScore: { type: "NUMBER" },
        },
        required: ["term", "searchVolumeScore", "conversionImpactScore"],
      },
    },
    competitorThreats: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          competitorTitle: { type: "STRING" },
          competitorAppId: { type: "STRING" },
          threatScore: { type: "NUMBER" },
          searchVolumeScore: { type: "NUMBER" },
          conversionImpactScore: { type: "NUMBER" },
        },
        required: [
          "term",
          "competitorTitle",
          "threatScore",
          "searchVolumeScore",
          "conversionImpactScore",
        ],
      },
    },
    uxSentimentInsights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          headline: { type: "STRING" },
          body: { type: "STRING" },
          insightKind: { type: "STRING" },
        },
        required: ["headline", "body", "insightKind"],
      },
    },
  },
  required: ["growthKeywords", "competitorThreats", "uxSentimentInsights"],
} as const;

type RequestBody = {
  /** Top apps (we use top 10 titles + summaries) */
  apps: Pick<TopChartApp, "appId" | "title" | "summary">[];
  /** gplay category ID e.g. "HEALTH_AND_FITNESS" */
  category: string;
  /** ISO country code */
  country: string;
  /** Workspace ID — required for credit deduction */
  workspaceId: string;
  /** Optional — excludes own app from competitor threat enrichment */
  ownAppId?: string | null;
};

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSpotlightJson(text: string): RawCategorizedSpotlightModel {
  const parsed = JSON.parse(stripJsonFences(text)) as RawCategorizedSpotlightModel;
  if (!Array.isArray(parsed.growthKeywords)) {
    throw new Error("Unexpected response shape from model");
  }
  return parsed;
}

function toChartApps(
  apps: Pick<TopChartApp, "appId" | "title" | "summary">[],
): ChartAppForThreats[] {
  return apps.slice(0, 10).map((app, index) => ({
    appId: app.appId,
    title: app.title,
    summary: app.summary,
    rank: index + 1,
  }));
}

export async function POST(request: Request) {
  const correlationId = createModelGatewayCorrelationId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const { apps, category, country, workspaceId, ownAppId } = body;

  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_workspace", message: "workspaceId is required" } },
      { status: 400 },
    );
  }
  if (!apps?.length) {
    return NextResponse.json(
      { ok: false, error: { code: "no_apps", message: "apps array is required" } },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 },
    );
  }

  const balanceResult = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  const remaining = balanceResult.ok ? balanceResult.remaining : 0;
  if (remaining < CREDIT_COST) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(CREDIT_COST, remaining),
      { status: 402 },
    );
  }

  const consumeResult = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: CREDIT_COST,
    description: `Market Intelligence: AI Keyword Spotlight — ${getCategoryLabel(category)} (${country.toUpperCase()})`,
    sourceType: "generation",
    meta: { route: ROUTE, category, country, correlationId },
  });

  if (!consumeResult.ok) {
    const code = consumeResult.code;
    if (code === "insufficient_credits" || code === "balance_too_low") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(CREDIT_COST, consumeResult.remaining ?? 0),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "billing_error", message: "Could not deduct credits" } },
      { status: 500 },
    );
  }

  const ledgerId = consumeResult.ledgerId;
  const chartApps = toChartApps(apps);
  const categoryLabel = getCategoryLabel(category);

  const appLines = chartApps
    .map((a, i) => `${i + 1}. "${a.title}"${a.summary ? ` — ${a.summary}` : ""}`)
    .join("\n");

  const prompt = `You are a senior ASO (App Store Optimisation) strategist analysing the Google Play top charts.

Category: ${categoryLabel}
Market: ${country.toUpperCase()}
Chart type: Top Free Apps

Here are the top 10 apps by title and short description:
${appLines}

Categorise every insight into exactly three buckets. Return JSON only:

{
  "growthKeywords": [
    {
      "term": "short keyword or phrase users search for",
      "searchVolumeScore": 0-100,
      "conversionImpactScore": 0-100
    }
  ],
  "competitorThreats": [
    {
      "term": "positioning keyword or phrase a top competitor owns",
      "competitorTitle": "exact app title from the chart",
      "competitorAppId": "optional package id if obvious",
      "threatScore": 0-100,
      "searchVolumeScore": 0-100,
      "conversionImpactScore": 0-100
    }
  ],
  "uxSentimentInsights": [
    {
      "headline": "short label",
      "body": "1-2 sentences of qualitative UX/sentiment/category narrative — NOT a keyword",
      "insightKind": "category_narrative | aso_recommendation | sentiment_theme"
    }
  ]
}

Rules:
- growthKeywords: 6–10 actionable search terms, ordered by searchVolumeScore then conversionImpactScore (highest first). No duplicates.
- competitorThreats: 3–6 threats where a specific chart app owns a keyword pattern that could displace the user's app. Reference real titles from the list.
- uxSentimentInsights: 2–4 qualitative insights only (user intent themes, sentiment shifts, listing tone). Do NOT put keywords here.
- Scores are relative estimates within this category/market (100 = strongest).

CRITICAL: Output strictly valid JSON only. No markdown fences, no commentary, no trailing text.`;

  let result: MarketIntelligenceReport;

  try {
    const { text, correlationId: modelCorrelationId, provider } = await generateContentValidated({
      correlationId,
      modelConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema: SPOTLIGHT_RESPONSE_SCHEMA,
      },
      request: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
          responseSchema: SPOTLIGHT_RESPONSE_SCHEMA,
          // @ts-expect-error — thinkingConfig valid for Gemini 2.5 Flash on Vertex
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });

    console.info(`[${ROUTE}] AI spotlight generated`, {
      correlationId: modelCorrelationId,
      provider,
      workspaceId,
      category,
      country,
    });

    const raw = parseSpotlightJson(text);
    result = buildMarketIntelligenceReport(
      raw,
      { category, country, ownAppId: ownAppId ?? null },
      chartApps,
    );
  } catch (err) {
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "AI Keyword Spotlight generation failed",
    });

    if (isModelGatewayError(err)) {
      console.error(`[${ROUTE}] ModelGatewayError`, {
        correlationId: err.correlationId,
        code: err.code,
        finishReason: err.finishReason,
        provider: err.provider,
        message: err.message,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "AI_GENERATION_FAILED",
          message:
            err.code === "AI_RESPONSE_BLOCKED"
              ? "AI analysis was blocked by safety filters. Your credits have been refunded."
              : "Could not generate market spotlight. Your credits have been refunded.",
          correlationId: err.correlationId,
        },
        { status: err.httpStatus >= 500 ? err.httpStatus : 502 },
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${ROUTE}] Spotlight parse/generation error`, { correlationId, message });

    return NextResponse.json(
      {
        ok: false,
        error: "AI_GENERATION_FAILED",
        message: "Could not generate spotlight. Your credits have been refunded.",
        correlationId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    report: result,
    /** @deprecated — use report */
    spotlight: result,
    creditsUsed: CREDIT_COST,
    creditsRemaining: remaining - CREDIT_COST,
    correlationId,
  });
}
