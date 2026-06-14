import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { dismissPendingReviewInsight } from "@/lib/review-insights/pending-insights.service";

type Ctx = { params: Promise<{ workspaceId: string; insightId: string }> };

/**
 * POST /api/workspaces/[workspaceId]/reviews/pending-insights/[insightId]/dismiss
 */
export async function POST(_request: Request, context: Ctx) {
  const { workspaceId, insightId } = await context.params;
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

  const dismissed = await dismissPendingReviewInsight(supabase, workspaceId, insightId);
  if (!dismissed) {
    return NextResponse.json({ ok: false, error: "Could not dismiss insight." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
