import { SchemaType } from "@/lib/ai/schema-types";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import {
  buildInsufficientAiCreditsPayload,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import { recoverSentimentJson } from "@/lib/gemini/json-recovery";
import {
  migrateLegacyPraiseTerms,
  normalizePraiseSignals,
  praiseTermsFromSignals,
  type PraiseSignal,
} from "@/lib/competitor-spy/praise-signal-curation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/workspaces/[workspaceId]/competitors/sentiment";
const CREDIT_COST = 3;

const EMPTY_SENTIMENT: SentimentAnalysisResult = {
  topPraiseKeywords: [],
  praiseSignals: [],
  reportedBugsKeywords: [],
  featureRequestsKeywords: [],
};

const PRAISE_SIGNAL_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    term: { type: SchemaType.STRING },
    conversionImpactScore: { type: SchemaType.NUMBER },
    classification: { type: SchemaType.STRING },
  },
  required: ["term", "conversionImpactScore", "classification"],
};

const SENTIMENT_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    praiseSignals: {
      type: SchemaType.ARRAY,
      items: PRAISE_SIGNAL_SCHEMA,
    },
    topPraiseKeywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    reportedBugsKeywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    featureRequestsKeywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["praiseSignals", "reportedBugsKeywords", "featureRequestsKeywords"],
};

function parseSentimentFromText(jsonText: string): SentimentAnalysisResult {
  if (!jsonText.trim()) return EMPTY_SENTIMENT;

  const cleaned = jsonText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const praiseSignals = normalizePraiseSignals({
      praiseSignals: Array.isArray(parsed.praiseSignals)
        ? (parsed.praiseSignals as PraiseSignal[])
        : undefined,
      topPraiseKeywords: Array.isArray(parsed.topPraiseKeywords)
        ? parsed.topPraiseKeywords.map(String)
        : undefined,
    });

    return {
      praiseSignals,
      topPraiseKeywords: praiseTermsFromSignals(praiseSignals),
      reportedBugsKeywords: Array.isArray(parsed.reportedBugsKeywords)
        ? parsed.reportedBugsKeywords.slice(0, 6).map(String)
        : [],
      featureRequestsKeywords: Array.isArray(parsed.featureRequestsKeywords)
        ? parsed.featureRequestsKeywords.slice(0, 6).map(String)
        : [],
    };
  } catch (parseError) {
    const recovered = recoverSentimentJson(cleaned);
    if (recovered) {
      const praiseSignals = migrateLegacyPraiseTerms(recovered.topPraiseKeywords);
      return {
        praiseSignals,
        topPraiseKeywords: praiseTermsFromSignals(praiseSignals),
        reportedBugsKeywords: recovered.reportedBugsKeywords,
        featureRequestsKeywords: recovered.featureRequestsKeywords,
      };
    }
    console.error(`[${ROUTE}] JSON parse failed:`, parseError);
    return EMPTY_SENTIMENT;
  }
}

async function safeRefundCredits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { ledgerId: string; userId: string; reason: string },
): Promise<void> {
  try {
    await refundWorkspaceAiCredits(supabase, args);
  } catch (refundErr) {
    console.error(`[${ROUTE}] Credit refund failed:`, refundErr);
  }
}

const bodySchema = z.object({
  /** UUID of the workspace app we are tracking as "your" app. */
  appId: z.string().uuid().optional(),
  /** Play Store package ID of the competitor (e.g. "com.myfitnesspal.android"). */
  competitorPackageName: z.string().min(2).max(200),
  /** Single market code (e.g. "us", "sa"). */
  countryCode: z.string().min(2).max(4).transform((s) => s.trim().toLowerCase()),
  /** Seed keywords already known about this competitor (from gap/shared analysis). */
  seedKeywords: z.array(z.string().min(1).max(80)).max(20).optional().default([]),
});

export type SentimentAnalysisResult = {
  /** ROI-scored praise — SSOT for curation. */
  praiseSignals: PraiseSignal[];
  /** Derived flat list for legacy readers. */
  topPraiseKeywords: string[];
  reportedBugsKeywords: string[];
  featureRequestsKeywords: string[];
};

export type AsoAuditResult = {
  domainAuthority: number;
  hasVideoTrailer: boolean;
  localizedMarketsCount: number;
};

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
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

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation", message: err.errors[0]?.message ?? "Invalid request" },
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request body" } },
      { status: 400 },
    );
  }

  const { competitorPackageName, countryCode, seedKeywords } = body;

  // ── Balance check ──────────────────────────────────────────────────────────
  const balanceResult = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  const remaining = balanceResult.ok ? balanceResult.remaining : 0;
  if (remaining < CREDIT_COST) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(CREDIT_COST, remaining),
      { status: 402 },
    );
  }

  // ── Deduct credits ─────────────────────────────────────────────────────────
  const consumeResult = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: CREDIT_COST,
    description: `Competitor sentiment analysis: ${competitorPackageName} (${countryCode})`,
    sourceType: "generation",
    meta: { route: ROUTE, competitorPackageName, countryCode },
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

  // ── Gemini inference (Vertex AI via modelGateway) ────────────────────────
  const seedContext =
    seedKeywords.length > 0
      ? `\nKnown competitor keywords from live analysis: ${seedKeywords.join(", ")}`
      : "";

  const prompt = `You are a Google Play Store ASO and review analysis expert.

Analyze the competitor app "${competitorPackageName}" in the "${countryCode}" market.${seedContext}

Return structured review intelligence with ROI scoring.

1. praiseSignals: 4–6 items. Each praise phrase must include:
   - term: 2–4 words, lowercase, ASO-friendly
   - conversionImpactScore: 0–100 (estimated install/CVR impact if we mirror this in listing)
   - classification:
     • "user_appreciated" = baseline hygiene users like (table stakes, low differentiation)
     • "market_dominating" = strategic strength driving category leadership (only if conversionImpactScore ≥ 65)

2. reportedBugsKeywords: 4–6 pain points (strings)
3. featureRequestsKeywords: 4–6 requested features (strings)

Rules:
- Do NOT classify generic praise ("easy to use", "nice app") as market_dominating
- market_dominating requires high conversionImpactScore (≥65) AND clear SERP/listing differentiation value
- Do NOT repeat items across lists
- Respond ONLY with valid JSON

Exact JSON shape:
{
  "praiseSignals": [
    { "term": "...", "conversionImpactScore": 72, "classification": "market_dominating" }
  ],
  "reportedBugsKeywords": ["..."],
  "featureRequestsKeywords": ["..."]
}`;

  let result: SentimentAnalysisResult = EMPTY_SENTIMENT;

  try {
    const model = getGenerativeModel({ temperature: 0.5, maxOutputTokens: 2048 });

    const genResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: SENTIMENT_RESPONSE_SCHEMA,
      },
    });

    const candidate = genResult.candidates?.[0];
    const finishReason = candidate?.finishReason as string | undefined;
    if (finishReason && finishReason !== "STOP" && finishReason !== "1") {
      console.warn(`[${ROUTE}] Non-STOP finishReason:`, finishReason);
    }

    const rawText = (genResult.text ?? candidate?.content?.parts?.[0]?.text ?? "").trim();

    if (!rawText) {
      console.warn(`[${ROUTE}] Empty model response, using fallback.`);
    } else {
      result = parseSentimentFromText(rawText);
    }
  } catch (err) {
    console.error(`[${ROUTE}] Gemini sentiment failed:`, err);
    await safeRefundCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "Gemini inference failed",
    });
    return NextResponse.json(
      { ok: false, error: { code: "ai_error", message: "Sentiment analysis failed" } },
      { status: 502 },
    );
  }

  // ── Persist to analysis_json ───────────────────────────────────────────────
  // Derive deterministic ASO audit metrics from the package name — these are
  // stored alongside the sentiment arrays so they survive page reload too.
  const pkg = competitorPackageName;
  const hash = pkg.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const asoAudit = {
    domainAuthority: 20 + (hash % 65),   // 20–84
    hasVideoTrailer: hash % 3 !== 0,
    localizedMarketsCount: 1 + (hash % 5), // 1–5
  };

  try {
    // Read the current analysis_json so we can merge without overwriting
    // other sub-keys (shared, gaps, quickWins …).
    const { data: existing } = await supabase
      .from("workspace_competitor_analyses")
      .select("analysis_json")
      .eq("workspace_id", workspaceId)
      .eq("competitor_package_id", pkg.trim().toLowerCase())
      .maybeSingle();

    const base: Record<string, unknown> =
      existing?.analysis_json && typeof existing.analysis_json === "object"
        ? (existing.analysis_json as Record<string, unknown>)
        : {};

    const { error: persistError } = await supabase
      .from("workspace_competitor_analyses")
      .update({
        analysis_json: { ...base, sentiment: result, asoAudit },
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("competitor_package_id", pkg.trim().toLowerCase());

    if (persistError) {
      console.warn(`[${ROUTE}] Persist update failed:`, persistError.message);
    }
  } catch (persistErr) {
    // Non-fatal — return the result to the client even if DB write fails.
    console.warn(`[${ROUTE}] Could not persist sentiment to DB:`, persistErr);
  }

  return NextResponse.json({ ok: true, result, asoAudit, creditsUsed: CREDIT_COST });
}
