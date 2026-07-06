/**
 * GET /api/brand-kit/manifests?workspaceId=&appId=
 *
 * Returns the list of workspace_asset_manifests for the given workspace,
 * projected down to the fields the BrandKitSyncPanel needs.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const appId = searchParams.get("appId") ?? null;

  if (!workspaceId) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "workspaceId required" } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found." } },
      { status: 403 },
    );
  }

  const admin = getSupabaseAdmin();

  let query = admin
    .from("workspace_asset_manifests")
    .select(
      "id, queue_hash, sync_status, is_manually_overridden, app_id, vault_locale",
    )
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (appId) {
    query = query.eq("app_id", appId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: error.message } },
      { status: 500 },
    );
  }

  const manifests = (data ?? []).map((row) => ({
    id: row.id as string,
    queueHash: row.queue_hash as string,
    syncStatus: row.sync_status as "synced" | "mismatch" | "pending",
    isManuallyOverridden: row.is_manually_overridden as boolean,
    appId: row.app_id as string | null,
    vaultLocale: row.vault_locale as "en" | "ar",
  }));

  return NextResponse.json({ ok: true, manifests });
}
