import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getRankWinsCached } from "@/lib/market/rank-wins-cache";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/market/rank-wins?appId=<uuid>&refresh=1
 *
 * Returns cached wins + forecast (6h TTL). Pass refresh=1 to force recompute.
 */
export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Forbidden" } },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const appId = url.searchParams.get("appId")?.trim();
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!appId) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "validation_error", message: "appId query param is required" },
      },
      { status: 400 },
    );
  }

  try {
    const admin = getSupabaseAdmin();
    const { progress, forecast, tracking, meta } = await getRankWinsCached({
      supabase: admin,
      workspaceId,
      appId,
      forceRefresh,
    });

    return NextResponse.json({ ok: true, progress, forecast, tracking, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load rank wins";
    return NextResponse.json(
      { ok: false, error: { code: "internal_error", message } },
      { status: 500 },
    );
  }
}
