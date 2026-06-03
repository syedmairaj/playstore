/**
 * DELETE /api/brand-assets/[assetId]?workspaceId=
 *
 * Deletes both the storage file and the metadata row.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "brand-assets";

type Ctx = { params: Promise<{ assetId: string }> };

export async function DELETE(request: NextRequest, context: Ctx) {
  const { assetId } = await context.params;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: { code: "bad_request", message: "workspaceId required" } }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthorized", message: "Sign in required." } }, { status: 401 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: { code: "forbidden", message: "Workspace not found" } }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  // Fetch the row to get storage_path before deleting
  const { data: row, error: fetchErr } = await admin
    .from("brand_assets")
    .select("id, storage_path, workspace_id")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ ok: false, error: { code: "not_found", message: "Asset not found" } }, { status: 404 });
  }

  // Delete storage file
  await admin.storage.from(BUCKET).remove([row.storage_path as string]);

  // Delete metadata row
  await admin.from("brand_assets").delete().eq("id", assetId).eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true });
}
