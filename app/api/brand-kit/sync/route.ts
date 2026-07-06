/**
 * POST /api/brand-kit/sync
 *   Auto-sync: propagates the latest Brand Kit assets to all workspace
 *   asset manifests, respecting is_manually_overridden and active screenshot
 *   jobs (integrity guard).
 *
 * PATCH /api/brand-kit/sync
 *   Force-revert: same operation with force = true, which overwrites manually-
 *   overridden manifests and clears the is_manually_overridden flag.
 *
 * Body (both methods):
 *   {
 *     workspaceId: string;
 *     appId?:      string | null;
 *     assetType?:  "icon" | "banner" | "screenshot" | "all";   // default "all"
 *   }
 *
 * Response 200:
 *   { ok: true; result: BrandKitSyncResult }
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { syncBrandKitToMockup } from "@/lib/listing/sync-brand-kit-to-mockup";

const bodySchema = z.object({
  workspaceId: z.string().min(1),
  appId: z.string().nullable().optional(),
  assetType: z.enum(["icon", "banner", "screenshot", "all"]).default("all"),
});

async function handler(request: NextRequest, force: boolean) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const { workspaceId, appId, assetType } = parsed.data;

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
  const result = await syncBrandKitToMockup(admin, workspaceId, assetType, {
    force,
    appId: appId ?? undefined,
  });

  return NextResponse.json({ ok: true, result });
}

/** Auto-sync — respects is_manually_overridden */
export async function POST(request: NextRequest) {
  return handler(request, false);
}

/** Force-revert — overwrites all manifests including manually-overridden ones */
export async function PATCH(request: NextRequest) {
  return handler(request, true);
}
