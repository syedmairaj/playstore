import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { archiveReviewInsightFromActiveContext } from "@/lib/review-insights/archive-review-from-active";

type Ctx = {
  params: Promise<{ workspaceId: string; queueItemId: string }>;
};

const bodySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.enum(["review_pain_point", "feature_request"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/workspaces/[workspaceId]/reviews/archive-from-active/[queueItemId]
 * Move insight from Active Context → Optimization History Archive.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { workspaceId, queueItemId } = await context.params;
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

    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const result = await archiveReviewInsightFromActiveContext(
      supabase,
      workspaceId,
      queueItemId,
      {
        locale: body.locale,
        appId: body.appId ?? null,
        userId: user.id,
        title: body.title,
        content: body.content,
        type: body.type,
        metadata: body.metadata,
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message, code: result.code },
        { status: result.code === "not_found" ? 404 : 500 },
      );
    }

    return NextResponse.json({ ok: true, backlogId: result.backlogId });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ ok: false, error: "Validation error" }, { status: 422 });
    }
    console.error("[reviews/archive-from-active] POST error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
