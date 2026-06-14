import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { adoptPendingReviewInsight } from "@/lib/review-insights/adopt-pending-insight";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";

type Ctx = { params: Promise<{ workspaceId: string; insightId: string }> };

const bodySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
});

/**
 * POST /api/workspaces/[workspaceId]/reviews/pending-insights/[insightId]/adopt
 * Commit phase — promote one pending insight into Active Context.
 */
export async function POST(request: Request, context: Ctx) {
  try {
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

    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const result = await adoptPendingReviewInsight(supabase, workspaceId, insightId, {
      locale: body.locale as OptimizationQueueLocale,
      appId: body.appId,
      userId: user.id,
    });

    if (!result.ok) {
      const status =
        result.code === "gate_denied" || result.code === "transaction_mismatch"
          ? 403
          : result.code === "not_found"
            ? 404
            : 409;
      return NextResponse.json({ ok: false, error: result.message, code: result.code }, { status });
    }

    return NextResponse.json({
      ok: true,
      pending: result.pending,
      queueItemId: result.queueItemId,
      analysisStatus: "SUCCESS_PAID",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error("[reviews/pending-insights/adopt] error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
