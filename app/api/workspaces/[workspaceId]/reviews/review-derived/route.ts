import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  hasValidReviewAnalysis,
  type ReviewAnalysisStatus,
} from "@/lib/review-insights/credit-gate";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";

type Ctx = { params: Promise<{ workspaceId: string }> };

const querySchema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  appId: z.string().uuid().optional(),
  packageName: z.string().min(1).optional(),
  langCode: z.string().min(2).optional(),
  country: z.string().length(2).optional(),
});

/**
 * GET /api/workspaces/[workspaceId]/reviews/review-derived
 *
 * CreditGate endpoint — returns review-derived pain points only when a valid,
 * paid analysis exists (fresh timestamp + verified credits_ledger debit).
 * Otherwise returns an empty array to prevent unpaid state leakage.
 */
export async function GET(request: Request, context: Ctx) {
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

    const url = new URL(request.url);
    const query = querySchema.parse({
      locale: url.searchParams.get("locale") ?? "en",
      appId: url.searchParams.get("appId") ?? undefined,
      packageName: url.searchParams.get("packageName") ?? undefined,
      langCode: url.searchParams.get("langCode") ?? undefined,
      country: url.searchParams.get("country") ?? undefined,
    });

    const gate = await hasValidReviewAnalysis(supabase, workspaceId, {
      locale: query.locale as OptimizationQueueLocale,
      appId: query.appId,
      cluster: {
        packageName: query.packageName,
        langCode: query.langCode,
        country: query.country,
      },
      userId: user.id,
      purgeOnInvalid: true,
    });

    return NextResponse.json({
      ok: true,
      valid: gate.valid,
      analysisStatus: gate.status as ReviewAnalysisStatus,
      lastAnalysisTimestamp: gate.lastAnalysisTimestamp,
      transactionId: gate.transactionId,
      pendingInsights: gate.valid ? gate.pendingInsights : [],
      adoptedInsights: gate.valid ? gate.adoptedInsights : [],
      items: [],
      cluster: gate.cluster,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: error.flatten() },
        { status: 422 },
      );
    }
    console.error("[reviews/review-derived] GET error:", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
