import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import {
  AI_CREDIT_COSTS,
  buildInsufficientAiCreditsPayload,
  consumeWorkspaceAiCredits,
  readWorkspaceAiCreditsRemaining,
  refundWorkspaceAiCredits,
} from "@/lib/features";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { assertGeminiApiKey, resolveGeminiModel } from "@/lib/gemini/gemini-defaults";
import type { TopChartApp } from "@/lib/play-store/fetch-top-charts";
import { getCategoryLabel } from "@/lib/market/category-labels";

const ROUTE = "POST /api/market/keyword-spotlight";
const CREDIT_COST = AI_CREDIT_COSTS.market_keyword_spotlight;

export type KeywordSpotlightResult = {
  /** Top recurring keyword themes from the chart titles/descriptions */
  trendingKeywords: string[];
  /** 1–2 sentence human insight about what's driving this category right now */
  narrative: string;
  /** Key takeaway for the user's own listing */
  asoTip: string;
};

type RequestBody = {
  /** Top apps (we use top 10 titles + summaries) */
  apps: Pick<TopChartApp, "title" | "summary">[];
  /** gplay category ID e.g. "HEALTH_AND_FITNESS" */
  category: string;
  /** ISO country code */
  country: string;
  /** Workspace ID — required for credit deduction */
  workspaceId: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const { apps, category, country, workspaceId } = body;

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

  // ── Workspace membership check ────────────────────────────────────────────
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 },
    );
  }

  // ── Balance check ─────────────────────────────────────────────────────────
  const balanceResult = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  const remaining = balanceResult.ok ? balanceResult.remaining : 0;
  if (remaining < CREDIT_COST) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(CREDIT_COST, remaining),
      { status: 402 },
    );
  }

  // ── Deduct credits upfront ────────────────────────────────────────────────
  const consumeResult = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: CREDIT_COST,
    description: `Market Intelligence: AI Keyword Spotlight — ${getCategoryLabel(category)} (${country.toUpperCase()})`,
    sourceType: "generation",
    meta: { route: ROUTE, category, country },
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

  // ── Gemini inference ──────────────────────────────────────────────────────
  const top10 = apps.slice(0, 10);
  const categoryLabel = getCategoryLabel(category);

  const appLines = top10
    .map((a, i) => `${i + 1}. "${a.title}"${a.summary ? ` — ${a.summary}` : ""}`)
    .join("\n");

  const prompt = `You are a senior ASO (App Store Optimisation) strategist analysing the Google Play top charts.

Category: ${categoryLabel}
Market: ${country.toUpperCase()}
Chart type: Top Free Apps

Here are the top 10 apps by title and short description:
${appLines}

Analyse these 10 apps and return a JSON object with exactly these three fields:

{
  "trendingKeywords": [array of 6–10 keyword strings that appear repeatedly across these titles/descriptions — single words or short phrases, no duplicates, ordered by frequency/importance],
  "narrative": "One or two sentences explaining what theme or user intent is dominating this category right now based on the chart. Be specific and data-driven.",
  "asoTip": "One actionable sentence telling an app developer what they should do with their listing based on this chart intelligence."
}

Return only valid JSON. No markdown, no explanation outside the JSON object.`;

  let result: KeywordSpotlightResult;
  try {
    const apiKey = assertGeminiApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: resolveGeminiModel() });
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        // 512 is sufficient for the small JSON payload we need.
        // thinkingBudget: 0 disables gemini-2.5-flash's internal reasoning —
        // without this, thinking tokens consume the maxOutputTokens budget and
        // truncate the actual JSON output, causing "Unexpected end of JSON input".
        // This is the same fix used in localize-listing-schema.ts.
        maxOutputTokens: 512,
        // @ts-expect-error — thinkingConfig is a valid Gemini 2.5 Flash param
        // not yet typed in the @google/generative-ai SDK types.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let text = response.response.text().trim();
    // Strip markdown code fences if the model wraps output despite the prompt
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    result = JSON.parse(text) as KeywordSpotlightResult;

    // Validate shape
    if (!Array.isArray(result.trendingKeywords) || typeof result.narrative !== "string") {
      throw new Error("Unexpected response shape from Gemini");
    }
  } catch (err) {
    // Refund on any AI failure — user should not lose credits for a server error
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "AI Keyword Spotlight generation failed",
    });
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${ROUTE}] Gemini error:`, message);
    return NextResponse.json(
      { ok: false, error: { code: "ai_error", message: "Could not generate spotlight. Your credits have been refunded." } },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    spotlight: result,
    creditsUsed: CREDIT_COST,
    creditsRemaining: remaining - CREDIT_COST,
  });
}
