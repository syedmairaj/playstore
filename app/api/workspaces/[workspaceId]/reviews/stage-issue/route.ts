import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { stageReviewIssueToActiveContext } from "@/lib/review-insights/stage-review-issue";
import { REVIEW_INSIGHT_CATEGORIES } from "@/lib/review-insights/pending-insights.types";

type Ctx = { params: Promise<{ workspaceId: string }> };

const bodySchema = z.object({
  packageName: z.string().trim().min(3).max(200),
  countryCode: z.string().trim().toLowerCase().length(2).default("us"),
  langCode: z.string().trim().min(2).default("en"),
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
  competitorName: z.string().trim().max(120).optional().nullable(),
  sourceType: z.enum(["common_issues_cluster", "individual_review"]).default("common_issues_cluster"),
  sourceContextId: z.string().trim().min(1).max(200),
  issue: z.object({
    title: z.string().trim().min(1).max(60),
    description: z.string().trim().min(1).max(300),
    severity: z.enum(["CRITICAL", "MEDIUM", "LOW"]).default("MEDIUM"),
    impact: z.number().min(0).max(1).default(0),
    quote: z.string().trim().max(500).optional(),
    category: z.enum(REVIEW_INSIGHT_CATEGORIES as [string, ...string[]]).optional(),
  }),
});

/**
 * POST /api/workspaces/[workspaceId]/reviews/stage-issue
 * MoveToActiveContext — push directly to optimization queue (Active Context).
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = await getWorkspaceRole(supabase, workspaceId, user.id);
    if (!role) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = bodySchema.parse(await request.json());

    const result = await stageReviewIssueToActiveContext(supabase, {
      workspaceId,
      packageName: body.packageName,
      countryCode: body.countryCode,
      langCode: body.langCode,
      locale: body.locale,
      appId: body.appId ?? null,
      userId: user.id,
      competitorName: body.competitorName ?? null,
      sourceType: body.sourceType,
      sourceContextId: body.sourceContextId,
      issue: body.issue,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message, code: result.code },
        { status: result.code === "validation" ? 400 : 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      queueItemId: result.queueItemId,
      vaultSignalId: result.vaultSignalId,
      stagedAt: result.stagedAt,
      title: result.title,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error("[reviews/stage-issue] POST error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
