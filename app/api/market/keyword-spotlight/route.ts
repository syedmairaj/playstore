import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { assertGeminiApiKey, resolveGeminiModel } from "@/lib/gemini/gemini-defaults";
import type { TopChartApp } from "@/lib/play-store/fetch-top-charts";
import { getCategoryLabel } from "@/lib/market/category-labels";

const ROUTE = "POST /api/market/keyword-spotlight";

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

  const { apps, category, country } = body;
  if (!apps?.length) {
    return NextResponse.json(
      { ok: false, error: { code: "no_apps", message: "apps array is required" } },
      { status: 400 },
    );
  }

  // Use top 10 only for the spotlight
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
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    const text = response.response.text().trim();
    result = JSON.parse(text) as KeywordSpotlightResult;

    // Validate shape
    if (!Array.isArray(result.trendingKeywords) || typeof result.narrative !== "string") {
      throw new Error("Unexpected response shape from Gemini");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${ROUTE}] Gemini error:`, message);
    return NextResponse.json(
      { ok: false, error: { code: "ai_error", message: "Could not generate spotlight. Try again." } },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, spotlight: result });
}
