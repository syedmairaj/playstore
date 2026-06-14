/**
 * GET /api/workspaces/[workspaceId]/competitors/[competitorId]/keywords
 *
 * Schema-aware: legacy signal rows OR universal vault (state_en/state_ar).
 */

import { createClient } from "@/lib/supabase/server";
import { readCompetitorKeywordsFromVault } from "@/lib/staging-vault/read-competitor-keywords";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; competitorId: string }> },
) {
  try {
    const { workspaceId, competitorId } = await params;
    const language = (req.nextUrl.searchParams.get("language") || "en") as "en" | "ar";

    if (!["en", "ar"].includes(language)) {
      return NextResponse.json(
        { error: 'Invalid language. Must be "en" or "ar"' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const result = await readCompetitorKeywordsFromVault(supabase, {
      workspaceId,
      competitorId,
      language,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CompetitorKeywords] Catch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
