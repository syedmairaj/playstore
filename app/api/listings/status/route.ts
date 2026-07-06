import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  assertJobWorkspaceMember,
  buildJobStatusResponse,
  loadListingGenerationJob,
} from "@/lib/db/listing-generation-job";
import { createClient } from "@/lib/supabase/server";

// Force Next.js to never pre-render or edge-cache this route.
// Without this the App Router can serve a stale cached response for
// subsequent polls that arrive within the same request-dedup window.
export const dynamic = "force-dynamic";

// Instructs every intermediate cache (CDN, edge, browser) that the
// response must not be stored or served from cache.
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
} as const;

const querySchema = z.object({
  jobId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    jobId: request.nextUrl.searchParams.get("jobId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "validation_error", message: "jobId query parameter is required" },
      },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401, headers: NO_CACHE_HEADERS },
    );
  }

  const job = await loadListingGenerationJob(parsed.data.jobId);
  if (!job?.job_id) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Job not found" } },
      { status: 404, headers: NO_CACHE_HEADERS },
    );
  }

  const allowed = await assertJobWorkspaceMember(supabase, job, user.id);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not accessible" } },
      { status: 403, headers: NO_CACHE_HEADERS },
    );
  }

  // Debug: confirm we are reading the live DB row, not a cached one.
  // Visible in server logs — search for event="status_poll" to verify freshness.
  console.log(
    JSON.stringify({
      event: "status_poll",
      jobId: job.job_id,
      generation_status: job.generation_status,
      current_phase: job.current_phase,
      updated_at: job.updated_at,
      ts: new Date().toISOString(),
    }),
  );

  return NextResponse.json(buildJobStatusResponse(job), {
    headers: NO_CACHE_HEADERS,
  });
}
