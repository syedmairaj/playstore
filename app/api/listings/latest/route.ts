import { NextResponse, type NextRequest } from "next/server";
import { loadLatestListingHydrationForApp } from "@/lib/listing/latest-listing-hydration";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "unauthorized", message: "Sign in required." },
      },
      { status: 401 },
    );
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
  const appId = request.nextUrl.searchParams.get("appId")?.trim();

  if (!workspaceId || !appId) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: "workspaceId and appId are required.",
        },
      },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "forbidden", message: "Workspace not found or inaccessible." },
      },
      { status: 403 },
    );
  }

  const { data: appOk, error: appLookupErr } = await supabase
    .from("apps")
    .select("id")
    .eq("id", appId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (appLookupErr || !appOk) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "invalid_app", message: "App not found in this workspace." },
      },
      { status: 400 },
    );
  }

  const hydration = await loadLatestListingHydrationForApp(
    supabase,
    workspaceId,
    appId,
    user.id,
  );

  return NextResponse.json({
    ok: true,
    data: hydration,
  });
}
