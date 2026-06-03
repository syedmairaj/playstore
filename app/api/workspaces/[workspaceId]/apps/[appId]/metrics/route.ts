import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string; appId: string }> };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the ISO Monday (YYYY-MM-DD) of the week containing `date`. */
function isoMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // offset to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ── Validation ────────────────────────────────────────────────────────────────

const metricsBodySchema = z.object({
  // If omitted, defaults to the current week's Monday
  metricWeek: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conversionRate: z.number().min(0).max(100).nullable().optional(),
  storeVisitors: z.number().int().min(0).nullable().optional(),
  categoryRank: z.number().int().min(1).nullable().optional(),
  searchVisibility: z.number().min(0).max(100).nullable().optional(),
  note: z.string().max(500).optional(),
});

// ── POST /api/workspaces/[workspaceId]/apps/[appId]/metrics ───────────────────
// Upserts a weekly metric entry. One entry per app per week (unique constraint).

export async function POST(request: NextRequest, context: Ctx) {
  const { workspaceId, appId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  let input: z.infer<typeof metricsBodySchema>;
  try {
    input = metricsBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Invalid input", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  const metricWeek = input.metricWeek ?? isoMondayOfWeek(new Date());

  // Upsert — if a row for this week exists, update it; else insert.
  const { data, error } = await supabase
    .from("listing_metrics")
    .upsert(
      {
        workspace_id: workspaceId,
        app_id: appId,
        user_id: user.id,
        metric_week: metricWeek,
        conversion_rate: input.conversionRate ?? null,
        store_visitors: input.storeVisitors ?? null,
        category_rank: input.categoryRank ?? null,
        search_visibility: input.searchVisibility ?? null,
        note: input.note ?? null,
      },
      { onConflict: "workspace_id,app_id,metric_week" },
    )
    .select("id, metric_week, created_at")
    .single();

  if (error || !data) {
    console.error("[metrics] upsert error:", error?.message);
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: "Failed to save metrics." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id, metricWeek: data.metric_week });
}

// ── GET /api/workspaces/[workspaceId]/apps/[appId]/metrics ────────────────────
// Returns up to 12 weeks of metric history (most recent first).

export async function GET(_request: NextRequest, context: Ctx) {
  const { workspaceId, appId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("listing_metrics")
    .select(
      "id, metric_week, conversion_rate, store_visitors, category_rank, search_visibility, note, created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .order("metric_week", { ascending: false })
    .limit(12);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, metrics: data ?? [] });
}
