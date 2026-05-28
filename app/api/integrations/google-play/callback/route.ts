import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createOAuth2Client, saveRefreshToken } from "@/lib/play-store/google-play-oauth";

const STATE_COOKIE = "gp_oauth_state";
const WS_COOKIE = "gp_oauth_workspace_id";

// GET /api/integrations/google-play/callback
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value;
  const workspaceId = cookieStore.get(WS_COOKIE)?.value;

  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(WS_COOKIE);

  const settingsBase = workspaceId ? `/en/app/${workspaceId}/settings` : "/";

  function redirectWithError(msg: string) {
    const url = new URL(settingsBase, req.nextUrl.origin);
    url.searchParams.set("integration_error", msg);
    return NextResponse.redirect(url.toString());
  }

  if (errorParam === "access_denied") return redirectWithError("access_denied");
  if (!state || state !== savedState) return redirectWithError("invalid_state");
  if (!workspaceId) return redirectWithError("missing_workspace");
  if (!code) return redirectWithError("missing_code");

  try {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      console.error("[google-play/callback] No refresh_token in response");
      return redirectWithError("no_refresh_token");
    }

    let authorizedEmail: string | null = null;
    try {
      oauth2.setCredentials(tokens);
      const { google } = await import("googleapis");
      const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
      const { data } = await oauth2Api.userinfo.get();
      authorizedEmail = data.email ?? null;
    } catch { /* non-fatal */ }

    await saveRefreshToken(workspaceId, refreshToken, authorizedEmail);

    const successUrl = new URL(settingsBase, req.nextUrl.origin);
    successUrl.searchParams.set("integration_success", "google_play");
    return NextResponse.redirect(successUrl.toString());
  } catch (err) {
    console.error("[google-play/callback] Token exchange error:", err);
    return redirectWithError("token_exchange_failed");
  }
}
