/**
 * GET /api/brand-assets/vault?workspaceId=&appId=&assetType=&limit=&offset=
 *
 * Returns the workspace's saved brand assets with fresh signed read URLs.
 * Signed URLs expire in 1 hour — client should not cache them.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "brand-assets";
const READ_URL_EXPIRES = 3600; // 1 hour
const DEFAULT_LIMIT = 48;

export type VaultAsset = {
  id: string;
  createdAt: string;
  appId: string | null;
  assetType: "icon" | "banner";
  variantIndex: number | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  signedUrl: string;
  meta: Record<string, unknown> | null;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const appId = searchParams.get("appId") ?? "";
  const assetType = searchParams.get("assetType") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT)), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");

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

  let query = admin
    .from("brand_assets")
    .select("id, created_at, app_id, asset_type, variant_index, storage_path, file_name, mime_type, size_bytes, meta")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (appId) query = query.eq("app_id", appId);
  if (assetType === "icon" || assetType === "banner") query = query.eq("asset_type", assetType);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: { code: "db_error", message: error.message } }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, assets: [], hasMore: false });
  }

  // Generate signed read URLs in batch
  const signedResults = await Promise.all(
    rows.map((row) =>
      admin.storage.from(BUCKET).createSignedUrl(row.storage_path as string, READ_URL_EXPIRES),
    ),
  );

  const assets: VaultAsset[] = rows
    .map((row, i) => {
      const { data: urlData } = signedResults[i];
      if (!urlData?.signedUrl) return null;
      return {
        id: row.id as string,
        createdAt: row.created_at as string,
        appId: (row.app_id as string | null) ?? null,
        assetType: row.asset_type as "icon" | "banner",
        variantIndex: (row.variant_index as number | null) ?? null,
        fileName: row.file_name as string,
        mimeType: row.mime_type as string,
        sizeBytes: (row.size_bytes as number | null) ?? null,
        signedUrl: urlData.signedUrl,
        meta: (row.meta as Record<string, unknown> | null) ?? null,
      };
    })
    .filter((a): a is VaultAsset => a !== null);

  return NextResponse.json({ ok: true, assets, hasMore: rows.length === limit });
}
