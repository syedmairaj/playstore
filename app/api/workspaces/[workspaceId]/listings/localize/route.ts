import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  buildInsufficientAiCreditsPayload,
  readWorkspaceAiCreditsRemaining,
} from "@/lib/features/billing/workspace-ai-credits";
import {
  consumeWorkspaceAiCredits,
  refundWorkspaceAiCredits,
} from "@/lib/features/billing/wallet";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "POST /api/workspaces/[workspaceId]/listings/localize";

/** Supported localization targets (expand as needed). */
export const LOCALIZE_MARKETS = ["ae", "in", "mx"] as const;
export type LocalizeMarketCode = (typeof LOCALIZE_MARKETS)[number];

const MARKET_META: Record<
  LocalizeMarketCode,
  { language: string; locale: string; rtl: boolean; label: string }
> = {
  ae: { language: "Arabic", locale: "ar-AE", rtl: true, label: "UAE (Arabic)" },
  in: { language: "Hindi", locale: "hi-IN", rtl: false, label: "India (Hindi)" },
  mx: { language: "Spanish", locale: "es-MX", rtl: false, label: "Latin America (Spanish)" },
};

const bodySchema = z.object({
  /** Title text used as localization source (max 30 chars). */
  title: z.string().min(1).max(30),
  /** Short description used as localization source (max 80 chars). */
  shortDescription: z.string().min(1).max(80),
  /** Long description used as localization source (max 4000 chars). */
  longDescription: z.string().max(4000).optional(),
  /** Keywords used as localization source. */
  keywords: z.array(z.string().min(1).max(80)).min(1).max(30),
  /** Target markets to localize into. */
  markets: z
    .array(z.enum(LOCALIZE_MARKETS))
    .min(1)
    .max(LOCALIZE_MARKETS.length),
});

type LocalizedMarketResult = {
  market: LocalizeMarketCode;
  label: string;
  rtl: boolean;
  title: string;
  shortDescription: string;
  longDescription: string;
  keywords: string[];
};

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * Builds a localized listing for each requested market via Gemini.
 * Deducts `AI_CREDIT_COSTS.localization` credits per market.
 */
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
        { ok: false, error: { code: "validation", message: err.errors[0]?.message ?? "Invalid request" } },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request body" } },
      { status: 400 },
    );
  }

  const { title, shortDescription, longDescription, keywords, markets } = body;
  const creditCost = AI_CREDIT_COSTS.localization * markets.length;

  // ── Balance check ──────────────────────────────────────────────────────────
  const balanceResult = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  const remaining = balanceResult.ok ? balanceResult.remaining : 0;
  if (remaining < creditCost) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, remaining),
      { status: 402 },
    );
  }

  // ── Deduct credits ─────────────────────────────────────────────────────────
  const consumeResult = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: `Listing localization (${markets.join(", ")})`,
    sourceType: "generation",
    meta: { route: ROUTE, markets },
  });

  if (!consumeResult.ok) {
    const code = consumeResult.code;
    if (code === "insufficient_credits" || code === "balance_too_low") {
      return NextResponse.json(
        buildInsufficientAiCreditsPayload(creditCost, consumeResult.remaining ?? 0),
        { status: 402 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "billing_error", message: "Could not deduct credits" } },
      { status: 500 },
    );
  }

  const ledgerId = consumeResult.ledgerId;

  // ── Build localized output via Gemini ──────────────────────────────────────
  const results: LocalizedMarketResult[] = [];

  for (const market of markets) {
    const meta = MARKET_META[market];

    // Call Gemini for localization
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error(`[${ROUTE}] GEMINI_API_KEY not set`);
      await refundWorkspaceAiCredits(supabase, {
        ledgerId,
        userId: user.id,
        reason: "AI service not configured",
      });
      return NextResponse.json(
        { ok: false, error: { code: "server_error", message: "AI service not configured" } },
        { status: 500 },
      );
    }

    const prompt = `You are a Google Play Store ASO expert. Translate and localize the following app listing into ${meta.language} (${meta.locale}) for the ${meta.label} market.

Source listing:
Title: ${title}
Short Description: ${shortDescription}
Long Description: ${longDescription ?? shortDescription}
Keywords: ${keywords.join(", ")}

Rules:
- Title must be ≤30 characters (count carefully, including spaces)
- Short Description must be ≤80 characters
- Long Description must be ≤4000 characters — localize it naturally, preserving ASO keyword density
- Return 5–8 localized keywords relevant to the ${meta.label} market
- Keep ASO intent: rank-optimized, high-intent, natural language
- ${meta.rtl ? "This is a right-to-left language — ensure natural phrasing for RTL readers" : "Use natural left-to-right phrasing"}
- Do NOT translate the brand name or any app package name
- Respond ONLY with valid JSON, no markdown, no explanation

Respond with this exact JSON shape:
{
  "title": "...",
  "shortDescription": "...",
  "longDescription": "...",
  "keywords": ["...", "...", "..."]
}`;

    let localized: { title: string; shortDescription: string; longDescription: string; keywords: string[] };

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
          }),
        },
      );

      if (!geminiRes.ok) {
        throw new Error(`Gemini ${geminiRes.status}`);
      }

      const geminiData = (await geminiRes.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const rawText =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

      // Strip optional ```json ... ``` fencing
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      localized = JSON.parse(jsonText) as {
        title: string;
        shortDescription: string;
        longDescription: string;
        keywords: string[];
      };

      // Safety clamp
      if (localized.title.length > 30) {
        localized.title = localized.title.slice(0, 30).trimEnd();
      }
      if (localized.shortDescription.length > 80) {
        localized.shortDescription = localized.shortDescription.slice(0, 80).trimEnd();
      }
      if ((localized.longDescription ?? "").length > 4000) {
        localized.longDescription = localized.longDescription.slice(0, 4000).trimEnd();
      }
    } catch (err) {
      console.error(`[${ROUTE}] Gemini localization failed for market=${market}:`, err);
      // Fall back to source text
      localized = {
        title,
        shortDescription,
        longDescription: longDescription ?? shortDescription,
        keywords,
      };
    }

    results.push({
      market,
      label: meta.label,
      rtl: meta.rtl,
      title: localized.title,
      shortDescription: localized.shortDescription,
      longDescription: localized.longDescription ?? longDescription ?? shortDescription,
      keywords: Array.isArray(localized.keywords) ? localized.keywords : keywords,
    });
  }

  return NextResponse.json({ ok: true, results, creditsUsed: creditCost });
}
