/**
 * POST /api/workspaces/[workspaceId]/validator/validate-keyword
 *
 * Validates a keyword and returns viability score.
 * Powers the Quick Win Keyword Validator feature.
 *
 * Request:
 * {
 *   "keyword": string,
 *   "category": string (optional, defaults to "default"),
 *   "language": "en" | "ar" (optional)
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "keyword": string,
 *     "difficulty": {...},
 *     "monthlyInstalls": {...},
 *     "recommendation": "high_confidence" | "medium_opportunity" | "skip_this",
 *     "confidence": number,
 *     "reasoning": string,
 *     "tags": string[]
 *   }
 * }
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { KeywordViabilityService } from "@/lib/validator/keyword-viability-service";

const ROUTE = "POST /api/workspaces/[workspaceId]/validator/validate-keyword";

const bodySchema = z.object({
  keyword: z.string().min(1).max(100),
  category: z.string().default("default"),
  language: z.enum(["en", "ar"]).default("en"),
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
      { status: 401 }
    );
  }

  // Verify workspace membership
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  // Parse request body
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
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 }
    );
  }

  try {
    const { keyword, category, language } = body;

    console.log(`[${ROUTE}] 🔍 VALIDATION REQUEST:`, {
      keyword,
      category,
      language,
      workspaceId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Validate keyword using service
    const validatorService = new KeywordViabilityService();
    const viabilityScore = await validatorService.validateKeyword(
      keyword,
      category,
      language
    );

    console.log(`[${ROUTE}] ✅ VALIDATION COMPLETE:`, {
      keyword,
      recommendation: viabilityScore.recommendation,
      confidence: viabilityScore.confidence,
      difficulty: viabilityScore.difficulty.difficulty,
    });

    // Save score to database for future reference.
    // Column mapping verified against live schema (information_schema.columns):
    //   keyword        → keyword_term
    //   difficulty     → difficulty_score
    //   searchVolume   → search_volume
    //   competition    → top_app_count (closest match; no competition column exists)
    //   confidence     → confidence_percentage
    //   recommendation → recommendation (jsonb)
    //   monthlyInstalls→ estimated_monthly_installs (jsonb)
    // Columns not in schema (omitted): category, reasoning, tags, metadata
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
      },
      estimated_monthly_installs: viabilityScore.monthlyInstalls,
    };

    const { error: dbError } = await supabase
      .from("keyword_viability_scores")
      .upsert(scoreRow, { onConflict: "workspace_id,keyword_term,language" });

    if (dbError) {
      // Log but don't fail - still return result to user
      console.warn(`[${ROUTE}] ⚠️ Could not save score to database:`, dbError.message);
    }

    return NextResponse.json({
      ok: true,
      data: viabilityScore,
    });
  } catch (error) {
    console.error(`[${ROUTE}] ❌ Error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
