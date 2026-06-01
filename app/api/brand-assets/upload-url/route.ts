/**
 * POST /api/brand-assets/upload-url
 *
 * Generates a Supabase Storage signed upload URL for one asset file.
 * The client uploads directly to Storage using this URL (PUT request),
 * then the metadata row is created here before the URL is returned.
 *
 * Body: { workspaceId, appId, assetType, fileName, mimeType, sizeBytes, variantIndex?, meta? }
 * Returns: { ok, uploadUrl, assetId, storagePath }
 */

import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const BUCKET = "brand-assets";
const SIGNED_URL_EXPIRES_IN = 300; // 5 minutes to complete the upload

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  appId: z.string().uuid(),
  assetType: z.enum(["icon", "banner"]),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  sizeBytes: z.number().int().positive().max(5_242_880), // 5 MB
  variantIndex: z.number().int().min(0).max(3).optional(),
  meta: z.record(z.unknown()).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: { code: "unauthorized", message: "Sign in required." } }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: { code: "bad_request", message: "Invalid JSON" } }, { status: 400 });
  }

  let input;
  try { input = bodySchema.parse(body); } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ ok: false, error: { code: "validation_error", message: "Invalid input", details: (e as ZodError).flatten() } }, { status: 400 });
    }
    throw e;
  }

  const { workspaceId, appId, assetType, fileName, mimeType, sizeBytes, variantIndex, meta } = input;

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: { code: "forbidden", message: "Workspace not found or inaccessible" } }, { status: 403 });
  }

  const admin = getSupabaseAdmin();

  // Build storage path: workspaces/{wid}/{assetType}s/{uuid}.png
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const assetId = randomUUID();
  const storagePath = `workspaces/${workspaceId}/${assetType}s/${assetId}.${ext}`;

  // Create signed upload URL (client uploads directly — no server memory overhead)
  const { data: signedData, error: signedErr } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signedErr || !signedData) {
    return NextResponse.json(
      { ok: false, error: { code: "storage_error", message: signedErr?.message ?? "Could not create upload URL" } },
      { status: 503 },
    );
  }

  // Insert metadata row (asset is considered pending until upload completes)
  const { error: insertErr } = await admin.from("brand_assets").insert({
    id: assetId,
    workspace_id: workspaceId,
    app_id: appId,
    user_id: user.id,
    asset_type: assetType,
    variant_index: variantIndex ?? null,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    meta: meta ?? null,
  });

  if (insertErr) {
    return NextResponse.json(
      { ok: false, error: { code: "db_error", message: insertErr.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    assetId,
    storagePath,
    uploadUrl: signedData.signedUrl,
    token: signedData.token,
  });
}
