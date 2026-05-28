import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { buildConsentUrl, deleteConnectedAccount } from "@/lib/play-store/google-play-oauth";

const STATE_COOKIE = "gp_oauth_state";
const WS_COOKIE = "gp_oauth_workspace_id";
const COOKIE_TTL_S = 60 * 10; // 10 minutes

// GET /api/integrations/google-play/connect?workspaceId=xxx
// Initiates the OAuth2 flow.
export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only workspace owners and admins can connect integrations." },
      { status: 403 },
    );
  }

  const state = randomBytes(32).toString("hex");
  const consentUrl = buildConsentUrl(state);

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_TTL_S,
    path: "/",
  };
  cookieStore.set(STATE_COOKIE, state, cookieOpts);
  cookieStore.set(WS_COOKIE, workspaceId, cookieOpts);

  return NextResponse.redirect(consentUrl);
}

// DELETE /api/integrations/google-play/connect?workspaceId=xxx
export async function DELETE(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only workspace owners and admins can disconnect integrations." },
      { status: 403 },
    );
  }

  try {
    await deleteConnectedAccount(workspaceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[google-play/connect DELETE]", err);
    return NextResponse.json({ ok: false, error: "Failed to disconnect account." }, { status: 500 });
  }
}
