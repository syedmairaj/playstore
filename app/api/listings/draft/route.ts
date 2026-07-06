import { NextResponse, type NextRequest } from "next/server";
import { fetchDraftState } from "@/lib/listing/listing-draft-persist";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

const QUEUE_HASH_RE = /^[a-f0-9]{64}$/;

/**
 * GET /api/listings/draft?workspaceId=&queueHash=&appId=&vaultLocale=
 * Rehydrate modular listing draft for the active optimization queue hash.
 */
export async function GET(request: NextRequest) {
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

  const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
  const queueHash = request.nextUrl.searchParams.get("queueHash")?.trim();
  const appId = request.nextUrl.searchParams.get("appId")?.trim() || undefined;
  const vaultLocaleRaw = request.nextUrl.searchParams.get("vaultLocale")?.trim();
  const vaultLocale: OptimizationQueueLocale | undefined =
    vaultLocaleRaw === "ar" || vaultLocaleRaw === "en" ? vaultLocaleRaw : undefined;

  if (!workspaceId || !queueHash) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: "workspaceId and queueHash are required.",
        },
      },
      { status: 400 },
    );
  }

  if (!QUEUE_HASH_RE.test(queueHash)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "validation_error", message: "Invalid queueHash." },
      },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not accessible." } },
      { status: 403 },
    );
  }

  const draft = await fetchDraftState(supabase, {
    workspaceId,
    queueHash,
    appId,
    userId: user.id,
    vaultLocale,
  });

  return NextResponse.json({ ok: true, draft });
}
