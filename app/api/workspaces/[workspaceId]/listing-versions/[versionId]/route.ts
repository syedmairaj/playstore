import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import {
  getListingVersion,
  transitionListingVersionStatus,
  setLiveListingSnapshot,
  updateVersionCaptions,
  updateVersionNotes,
} from "@/lib/db/listing-versions";
import type { ListingVersionUpdateBody } from "@/lib/listing/listing-version.types";
import { z } from "zod";

const liveSnapshotSchema = z.object({
  title: z.string().min(1).max(30),
  shortDescription: z.string().max(80),
  longDescription: z.string().max(4000),
  capturedAt: z.string(),
});

const captionSchema = z.object({
  order: z.number().int().min(1).max(8),
  caption: z.string().max(70),
  theme: z.enum(["hook", "feature", "benefit", "cta"]),
});

const updateBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("deploy") }),
  z.object({ action: z.literal("revert_to_draft") }),
  z.object({
    action: z.literal("set_live_snapshot"),
    snapshot: liveSnapshotSchema,
  }),
  z.object({
    action: z.literal("update_captions"),
    captions: z.array(captionSchema).max(8),
  }),
  z.object({ action: z.literal("update_notes"), notes: z.string().max(500) }),
]);

/**
 * GET /api/workspaces/[workspaceId]/listing-versions/[versionId]
 * Fetch a single version.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; versionId: string }> },
) {
  const { workspaceId, versionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) return NextResponse.json({ ok: false, error: { message: "Forbidden" } }, { status: 403 });

  const version = await getListingVersion(workspaceId, versionId);
  if (!version) return NextResponse.json({ ok: false, error: { message: "Not found" } }, { status: 404 });

  return NextResponse.json({ ok: true, version });
}

/**
 * PATCH /api/workspaces/[workspaceId]/listing-versions/[versionId]
 * Update version status, captions, live snapshot, or notes.
 *
 * Body (discriminated union on `action`):
 *   { action: "publish" }
 *   { action: "deploy" }
 *   { action: "revert_to_draft" }
 *   { action: "set_live_snapshot", snapshot: LiveListingSnapshot }
 *   { action: "update_captions", captions: ScreenshotCaption[] }
 *   { action: "update_notes", notes: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; versionId: string }> },
) {
  const { workspaceId, versionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) return NextResponse.json({ ok: false, error: { message: "Forbidden" } }, { status: 403 });

  const raw: unknown = await req.json().catch(() => null);
  const parsed = updateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const body = parsed.data as ListingVersionUpdateBody;

  try {
    switch (body.action) {
      case "publish": {
        const v = await transitionListingVersionStatus(workspaceId, versionId, "published");
        return NextResponse.json({ ok: true, version: v });
      }
      case "deploy": {
        const v = await transitionListingVersionStatus(workspaceId, versionId, "deployed");
        return NextResponse.json({ ok: true, version: v });
      }
      case "revert_to_draft": {
        const v = await transitionListingVersionStatus(workspaceId, versionId, "draft");
        return NextResponse.json({ ok: true, version: v });
      }
      case "set_live_snapshot": {
        const v = await setLiveListingSnapshot(workspaceId, versionId, body.snapshot);
        return NextResponse.json({ ok: true, version: v });
      }
      case "update_captions": {
        const v = await updateVersionCaptions(workspaceId, versionId, body.captions);
        return NextResponse.json({ ok: true, version: v });
      }
      case "update_notes": {
        const v = await updateVersionNotes(workspaceId, versionId, body.notes);
        return NextResponse.json({ ok: true, version: v });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
