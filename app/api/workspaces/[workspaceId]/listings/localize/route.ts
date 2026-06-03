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
import {
  assertGeminiApiKey,
  resolveGeminiModel,
} from "@/lib/gemini/gemini-defaults";
import { callGeminiLocalizeListing } from "@/lib/gemini/localize-listing-schema";
import {
  isLocalizeMarketCode,
  LOCALIZE_MARKETS,
  MARKET_META,
  marketRecordFromCode,
  type LocalizeMarketCode,
  type LocalizedMarketRecord,
} from "@/lib/listing/localized-markets";
import {
  deleteWorkspaceLocalizedListing,
  upsertWorkspaceLocalizedListings,
  WORKSPACE_LOCALIZED_LISTINGS_TABLE,
} from "@/lib/listing/persist-localized-listings";
import { isPostgrestTableMissing } from "@/lib/supabase/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { logAdminAiTransaction } from "@/lib/admin/log-ai-transaction";
import { parseGeminiUsageMetadata } from "@/lib/gemini/pricing";
import { fetchProfileAccountStatus, isProfileAccessBlocked, suspendedAccountJsonResponse } from "@/lib/auth/profile-access";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const POST_ROUTE = "POST /api/workspaces/[workspaceId]/listings/localize";
const GET_ROUTE = "GET /api/workspaces/[workspaceId]/listings/localize";
const DELETE_ROUTE = "DELETE /api/workspaces/[workspaceId]/listings/localize";

type LocalizeMarketFailure = {
  market: LocalizeMarketCode;
  code: "localization_failed";
  message: string;
};

type Ctx = { params: Promise<{ workspaceId: string }> };

const bodySchema = z.object({
  appId: z.string().uuid().optional(),
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
  /** When true, caller is re-generating copy for existing saved market(s). */
  isReGeneration: z.boolean().optional(),
});

/** Returns a trimmed key or throws before any Gemini HTTP call. */
function assertValidGeminiApiKey(): string {
  let apiKey: string;
  try {
    apiKey = assertGeminiApiKey();
  } catch {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length < 10) {
    throw new Error(
      "GEMINI_API_KEY is set but appears malformed (empty or too short)",
    );
  }
  return trimmed;
}

function geminiGenerateContentUrl(modelName: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
}

function buildLocalizePrompt(
  market: LocalizeMarketCode,
  meta: (typeof MARKET_META)[LocalizeMarketCode],
  source: {
    title: string;
    shortDescription: string;
    longDescription?: string;
    keywords: string[];
  },
): string {
  const { title, shortDescription, longDescription, keywords } = source;
  const longDescSource = longDescription ?? shortDescription;

  if (market === "ae") {
    return `You are an expert ASO (App Store Optimization) copywriter fluent in native Gulf Arabic. Your task is to localize the provided mobile application listing details for the United Arab Emirates store (market=ae).

Source listing:
Title: ${title}
Short Description: ${shortDescription}
Long Description: ${longDescSource}
Keywords: ${keywords.join(", ")}

CRITICAL REGULATORY INSTRUCTIONS:
1. When localizing for 'ae' (Arabic), all output string fields (shortDescription, longDescription, and the keywords array) MUST be written in authentic, high-converting Arabic script. Do NOT return them in English.
2. For the title field, generate a professional hybrid string layout: Keep the brand name in English if necessary, but follow it with a high-impact Arabic keyword hook (Format: 'Brand Name: [Arabic Core Feature Keyword]').
3. Ensure the Arabic terminology used avoids literal translations. Use expressions native app shoppers in the region search for (e.g., use 'حساب السعرات الحرارية' for calorie tracking).
4. Return the data structure exactly in the requested JSON scheme format.

Additional rules:
- Title must be ≤30 characters (count carefully, including spaces)
- Short Description must be ≤80 characters
- Long Description must be ≤4000 characters — localize naturally in Gulf Arabic (ar-AE, RTL), preserving ASO keyword density
- Return 5–8 localized keywords in Arabic only, relevant to UAE Play Store search intent
- Do NOT translate the brand name or any app package name
- Respond ONLY with valid JSON, no markdown, no explanation

Respond with this exact JSON shape:
{
  "title": "...",
  "shortDescription": "...",
  "longDescription": "...",
  "keywords": ["...", "...", "..."]
}`;
  }

  const marketNotes = meta.rtl
    ? "- This is a right-to-left language — ensure natural phrasing for RTL readers"
    : "- Use natural left-to-right phrasing";

  return `You are a Google Play Store ASO expert. Translate and localize the following app listing into ${meta.language} (${meta.locale}) for the ${meta.label} market.

Source listing:
Title: ${title}
Short Description: ${shortDescription}
Long Description: ${longDescSource}
Keywords: ${keywords.join(", ")}

Rules:
- Title must be ≤30 characters (count carefully, including spaces)
- Short Description must be ≤80 characters
- Long Description must be ≤4000 characters — localize it naturally, preserving ASO keyword density
- Return 5–8 localized keywords relevant to the ${meta.label} market
- Keep ASO intent: rank-optimized, high-intent, natural language
${marketNotes}
- Do NOT translate the brand name or any app package name
- Respond ONLY with valid JSON, no markdown, no explanation

Respond with this exact JSON shape:
{
  "title": "...",
  "shortDescription": "...",
  "longDescription": "...",
  "keywords": ["...", "...", "..."]
}`;
}

function rowToMarketRecord(row: {
  market: string;
  title: string;
  short_description: string;
  long_description: string;
  keywords: unknown;
  updated_at: string;
}): LocalizedMarketRecord | null {
  if (!isLocalizeMarketCode(row.market)) return null;
  const keywords = Array.isArray(row.keywords)
    ? row.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];
  return marketRecordFromCode(row.market, {
    title: row.title,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    keywords,
    updatedAt: row.updated_at,
  });
}

async function verifyAppInWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  appId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("apps")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", appId)
    .maybeSingle();
  return !error && Boolean(data?.id);
}

/**
 * Returns persisted localized listings for a workspace app.
 * Query: `appId` (uuid, required).
 */
export async function GET(request: Request, context: Ctx) {
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

  const accountStatus = await fetchProfileAccountStatus(supabase, user.id);
  if (isProfileAccessBlocked(accountStatus)) {
    return NextResponse.json(suspendedAccountJsonResponse(), { status: 403 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 },
    );
  }

  const appId = new URL(request.url).searchParams.get("appId")?.trim();
  if (!appId || !z.string().uuid().safeParse(appId).success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "appId query parameter is required" } },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from(WORKSPACE_LOCALIZED_LISTINGS_TABLE)
    .select(
      "market,title,short_description,long_description,keywords,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isPostgrestTableMissing(error, WORKSPACE_LOCALIZED_LISTINGS_TABLE)) {
      console.warn(
        `[${GET_ROUTE}] ${WORKSPACE_LOCALIZED_LISTINGS_TABLE} missing; apply migration 20260519130000_workspace_localized_listings.sql`,
        error,
      );
      return NextResponse.json({ ok: true, markets: [] });
    }
    console.error(`[${GET_ROUTE}] query failed:`, error);
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message ?? "Query failed" } },
      { status: 500 },
    );
  }

  const markets = (data ?? [])
    .map((row) =>
      rowToMarketRecord({
        market: row.market as string,
        title: row.title as string,
        short_description: row.short_description as string,
        long_description: row.long_description as string,
        keywords: row.keywords,
        updated_at: row.updated_at as string,
      }),
    )
    .filter((m): m is LocalizedMarketRecord => m !== null);

  return NextResponse.json({ ok: true, markets });
}

/**
 * Builds a localized listing for each requested market via Gemini.
 * Deducts `AI_CREDIT_COSTS.localization` credits per market.
 * Persists successful rows when `appId` is provided.
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

  const accountStatus = await fetchProfileAccountStatus(supabase, user.id);
  if (isProfileAccessBlocked(accountStatus)) {
    return NextResponse.json(suspendedAccountJsonResponse(), { status: 403 });
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

  const { title, shortDescription, longDescription, keywords, markets, appId, isReGeneration } = body;

  if (appId) {
    const appOk = await verifyAppInWorkspace(supabase, workspaceId, appId);
    if (!appOk) {
      return NextResponse.json(
        { ok: false, error: { code: "validation", message: "appId is not in this workspace" } },
        { status: 400 },
      );
    }
  }

  const creditCost = AI_CREDIT_COSTS.localization * markets.length;

  const balanceResult = await readWorkspaceAiCreditsRemaining(supabase, workspaceId);
  const remaining = balanceResult.ok ? balanceResult.remaining : 0;
  if (remaining < creditCost) {
    return NextResponse.json(
      buildInsufficientAiCreditsPayload(creditCost, remaining),
      { status: 402 },
    );
  }

  const consumeResult = await consumeWorkspaceAiCredits(supabase, {
    workspaceId,
    userId: user.id,
    amount: creditCost,
    description: isReGeneration
      ? `Listing localization re-generate (${markets.join(", ")})`
      : `Listing localization (${markets.join(", ")})`,
    sourceType: "generation",
    meta: { route: POST_ROUTE, markets, appId: appId ?? null, isReGeneration: Boolean(isReGeneration) },
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

  let geminiApiKey: string;
  let geminiModel: string;
  try {
    geminiApiKey = assertValidGeminiApiKey();
    geminiModel = resolveGeminiModel();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI service not configured";
    console.error(`[${POST_ROUTE}] ${message}`);
    await refundWorkspaceAiCredits(supabase, {
      ledgerId,
      userId: user.id,
      reason: "AI service not configured",
    });
    const status = message.includes("GEMINI_API_KEY") ? 503 : 500;
    return NextResponse.json(
      { ok: false, error: { code: "server_error", message } },
      { status },
    );
  }

  const geminiUrl = geminiGenerateContentUrl(geminiModel, geminiApiKey);

  const results: LocalizedMarketRecord[] = [];
  const failures: LocalizeMarketFailure[] = [];
  const sourceLongChars = (longDescription ?? shortDescription).length;

  for (const market of markets) {
    const meta = MARKET_META[market];
    const prompt = buildLocalizePrompt(market, meta, {
      title,
      shortDescription,
      longDescription,
      keywords,
    });

    const geminiResult = await callGeminiLocalizeListing({
      geminiUrl,
      prompt,
      sourceLongChars,
    });

    if (!geminiResult.ok) {
      console.error(
        `[${POST_ROUTE}] Gemini localization failed for market=${market} model=${geminiModel} reason=${geminiResult.reason}:`,
        geminiResult.message,
      );

      if (geminiResult.reason === "http") {
        await refundWorkspaceAiCredits(supabase, {
          ledgerId,
          userId: user.id,
          reason: "Gemini inference failed",
        });
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "ai_error",
              message: "Listing localization failed",
            },
          },
          { status: 502 },
        );
      }

      failures.push({
        market,
        code: "localization_failed",
        message: geminiResult.message,
      });
      continue;
    }

    const localized = geminiResult.data;
    const perMarketCredits = AI_CREDIT_COSTS.localization;
    void logAdminAiTransaction({
      providerService: "gemini",
      userId: user.id,
      workspaceId,
      featureSlug: "localization",
      model: geminiModel,
      usage: parseGeminiUsageMetadata(geminiResult.usage ?? null),
      creditsCharged: perMarketCredits,
    });

    results.push(
      marketRecordFromCode(market, {
        title: localized.title,
        shortDescription: localized.shortDescription,
        longDescription: localized.longDescription,
        keywords: localized.keywords,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ai_error",
          message: "Listing localization failed for all selected markets",
        },
        failures,
      },
      { status: 502 },
    );
  }

  if (appId) {
    const persist = await upsertWorkspaceLocalizedListings(
      supabase,
      workspaceId,
      appId,
      results,
    );
    if (!persist.ok) {
      console.error(`[${POST_ROUTE}] persist failed:`, persist.message);
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    ...(failures.length > 0 ? { failures } : {}),
    creditsUsed: creditCost,
    persisted: Boolean(appId),
  });
}

/**
 * Deletes one persisted localized listing for a workspace app.
 * Query: `appId` (uuid, required), `market` (`ae` | `in` | `mx`, required).
 */
export async function DELETE(request: Request, context: Ctx) {
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

  const params = new URL(request.url).searchParams;
  const appId = params.get("appId")?.trim();
  const marketRaw = params.get("market")?.trim().toLowerCase();

  if (!appId || !z.string().uuid().safeParse(appId).success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "appId query parameter is required" } },
      { status: 400 },
    );
  }

  if (!marketRaw || !isLocalizeMarketCode(marketRaw)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "validation", message: "market query parameter must be ae, in, or mx" },
      },
      { status: 400 },
    );
  }

  const appOk = await verifyAppInWorkspace(supabase, workspaceId, appId);
  if (!appOk) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "appId is not in this workspace" } },
      { status: 400 },
    );
  }

  const del = await deleteWorkspaceLocalizedListing(
    supabase,
    workspaceId,
    appId,
    marketRaw,
  );

  if (!del.ok) {
    if (del.notFound) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: del.message } },
        { status: 404 },
      );
    }
    if (isPostgrestTableMissing(del.pgError, WORKSPACE_LOCALIZED_LISTINGS_TABLE)) {
      return NextResponse.json(
        { ok: false, error: { code: "schema_unavailable", message: "Localized listings table not migrated" } },
        { status: 503 },
      );
    }
    console.error(`[${DELETE_ROUTE}] delete failed:`, del.message);
    return NextResponse.json(
      { ok: false, error: { code: "delete_error", message: del.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, market: marketRaw });
}
