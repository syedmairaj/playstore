/**
 * GET /api/screenshot-studio/job/[jobId]
 *
 * Polling endpoint for screenshot generation job status.
 * Client polls every 2–3 seconds after receiving a 202 from the generate route.
 *
 * Response shape:
 * {
 *   ok: true,
 *   job: {
 *     id: string,
 *     status: "pending" | "running" | "completed" | "failed",
 *     progress: number,   // slides completed so far (0–6)
 *     total: number,      // always 6
 *     slides: RenderedSlide[],        // grows as slides complete
 *     optimizedForConversion: boolean,
 *     creditsCharged?: number,
 *     creditsRemaining?: number,
 *     errorMessage?: string,          // only if status = 'failed'
 *   }
 * }
 *
 * Caching: no-store — client must always get fresh data.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  const { jobId } = await context.params;

  if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid jobId" } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  // Use admin client to read — RLS allows workspace members to SELECT their own rows
  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("screenshot_jobs")
    .select(
      "id, status, progress, total, slides, optimized_for_conversion, " +
      "credits_charged, credits_remaining, error_message, workspace_id, user_id",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Job not found." } },
      { status: 404 },
    );
  }

  // Cast to typed record — Supabase returns Record<string,unknown> for dynamic tables
  const r = row as unknown as Record<string, unknown>;

  // Verify the requesting user owns this job (belt-and-braces on top of RLS)
  if ((r.user_id as string) !== user.id) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not your job." } },
      { status: 403 },
    );
  }

  const job = {
    id: r.id as string,
    status: r.status as string,
    progress: (r.progress as number) ?? 0,
    total: (r.total as number) ?? 6,
    slides: (r.slides as unknown[]) ?? [],
    optimizedForConversion: (r.optimized_for_conversion as boolean) ?? false,
    creditsCharged: r.credits_charged as number | null,
    creditsRemaining: r.credits_remaining as number | null,
    errorMessage: r.error_message as string | null,
  };

  return NextResponse.json(
    { ok: true, job },
    {
      headers: {
        // Always fresh — never cache job status
        "Cache-Control": "no-store",
      },
    },
  );
}
