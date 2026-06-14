import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { resolveWorkspaceBillingPlan } from "@/lib/utils/app-limits";
import {
  REVIEW_ANALYSIS_CREDIT_COST,
  readReviewAnalysisUsage,
} from "@/lib/review-insights";
import { readWorkspaceAiCreditsRemaining } from "@/lib/features/billing/workspace-ai-credits";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/reviews/usage
 * Monthly review analysis usage + credit cost for Sync Insights UI.
 */
export async function GET(_request: Request, context: Ctx) {
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

  const [usage, credits, billing] = await Promise.all([
    readReviewAnalysisUsage(supabase, workspaceId),
    readWorkspaceAiCreditsRemaining(supabase, workspaceId),
    resolveWorkspaceBillingPlan(supabase, workspaceId, user.id),
  ]);

  return NextResponse.json({
    ok: true,
    creditCost: REVIEW_ANALYSIS_CREDIT_COST,
    monthlyUsed: usage.used,
    monthlyLimit: usage.limit,
    monthlyRemaining: usage.remaining,
    creditsRemaining: credits.ok ? credits.remaining : null,
    workspacePlan: billing.normalized,
    resetsAt: usage.resetsAt,
  });
}
