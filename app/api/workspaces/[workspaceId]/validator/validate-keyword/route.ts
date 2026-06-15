/**
 * POST /api/workspaces/[workspaceId]/validator/validate-keyword
 *
 * Validates a keyword and returns viability score(s).
 * When `countries` is provided, runs parallel per-market scoring.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { KeywordViabilityService } from "@/lib/validator/keyword-viability-service";

const ROUTE = "POST /api/workspaces/[workspaceId]/validator/validate-keyword";
const MAX_MARKETS = 4;

const bodySchema = z.object({
  keyword: z.string().min(1).max(100),
  category: z.string().default("default"),
  language: z.enum(["en", "ar"]).default("en"),
  countries: z
    .array(z.string().min(2).max(4).toLowerCase().trim())
    .min(1)
    .max(MAX_MARKETS)
    .optional(),
});

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
          error: {
            code: "validation",
            message: err.errors[0]?.message ?? "Invalid request",
          },
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 },
    );
  }

  try {
    const { keyword, category, language } = body;
    const countries = body.countries?.length ? body.countries : ["us"];
    const primaryMarket = countries[0]!;

    console.log(`[${ROUTE}] VALIDATION REQUEST:`, {
      keyword,
      category,
      language,
      countries,
      workspaceId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    const validatorService = new KeywordViabilityService();
    const marketScores = await validatorService.validateKeywordForMarkets(
      keyword,
      countries,
      category,
      language,
    );

    const viabilityScore = marketScores[primaryMarket] ?? Object.values(marketScores)[0]!;

    console.log(`[${ROUTE}] VALIDATION COMPLETE:`, {
      keyword,
      countries: Object.keys(marketScores),
      recommendation: viabilityScore.recommendation,
      confidence: viabilityScore.confidence,
    });

    const scoreRow = {
      workspace_id: workspaceId,
      keyword_term: keyword,
      language,
      difficulty_score: viabilityScore.difficulty.difficulty,
      search_volume: viabilityScore.difficulty.searchVolume,
      top_app_count: viabilityScore.difficulty.competition,
      confidence_percentage: viabilityScore.confidence,
      recommendation: {
        value: viabilityScore.recommendation,
        reasoning: viabilityScore.reasoning,
        tags: viabilityScore.tags,
        category,
        markets: Object.keys(marketScores),
      },
      estimated_monthly_installs: viabilityScore.monthlyInstalls,
    };

    const { error: dbError } = await supabase
      .from("keyword_viability_scores")
      .upsert(scoreRow, { onConflict: "workspace_id,keyword_term,language" });

    if (dbError) {
      console.warn(`[${ROUTE}] Could not save score to database:`, dbError.message);
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...viabilityScore,
        primaryMarket,
        markets: marketScores,
      },
    });
  } catch (error) {
    console.error(`[${ROUTE}] Error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: errorMessage,
        },
      },
      { status: 500 },
    );
  }
}
