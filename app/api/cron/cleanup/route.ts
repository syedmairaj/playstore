import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cron/cleanup
//
// Invokes the `cleanup_expired_backlog_items()` Postgres function which batch-
// deletes rows from workspace_listing_backlog according to the retention policy:
//
//   Implemented rows  → deleted after 30 days (is_implemented = true)
//   Unimplemented rows → deleted after 90 days (is_implemented = false)
//
// Security:
//   The endpoint is protected by a Bearer token check against the CRON_SECRET
//   environment variable.  Callers (Vercel Cron, GitHub Actions, etc.) must
//   supply the header:
//
//     Authorization: Bearer <CRON_SECRET>
//
//   The service-role Supabase client is used so the RPC executes with full
//   table access regardless of RLS policies.
//
// Schedule recommendation (vercel.json):
//   { "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }   ← 03:00 UTC daily
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE = "POST /api/cron/cleanup";

type CleanupResult = {
  implemented_deleted: number;
  draft_deleted: number;
};

export async function POST(request: NextRequest) {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`[${ROUTE}] CRON_SECRET environment variable is not set.`);
    return NextResponse.json(
      { success: false, error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token || token !== cronSecret) {
    console.warn(`[${ROUTE}] Unauthorized cron attempt — invalid or missing Bearer token.`);
    return NextResponse.json(
      { success: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  // ── Invoke cleanup function ────────────────────────────────────────────────
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("cleanup_expired_backlog_items");

  if (error) {
    console.error(`[${ROUTE}] RPC failed:`, error.message);
    return NextResponse.json(
      { success: false, error: "Cleanup function failed.", detail: error.message },
      { status: 500 },
    );
  }

  const result = data as CleanupResult;

  console.info(`[${ROUTE}] Cleanup complete.`, {
    implemented_deleted: result.implemented_deleted,
    draft_deleted:       result.draft_deleted,
    total_deleted:       result.implemented_deleted + result.draft_deleted,
    ran_at:              new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    result: {
      implemented_deleted: result.implemented_deleted,
      draft_deleted:       result.draft_deleted,
      total_deleted:       result.implemented_deleted + result.draft_deleted,
    },
  });
}
