import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { APP_METADATA_LOGO_GENERATOR_KEY } from "@/lib/apps/logo-generator-metadata";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { patchAppSchema } from "@/lib/validation/api";

type Ctx = { params: Promise<{ workspaceId: string; appId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const { workspaceId, appId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Workspace not found" } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  try {
    const parsed = patchAppSchema.parse(body);
    const { data: app, error: appErr } = await supabase
      .from("apps")
      .select("id,workspace_id,metadata,icon_url")
      .eq("id", appId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (appErr || !app) {
      return NextResponse.json(
        { ok: false, error: { code: "not_found", message: "App not found" } },
        { status: 404 },
      );
    }

    const updates: Record<string, unknown> = {};
    const prevMeta: Record<string, unknown> =
      app.metadata && typeof app.metadata === "object" && !Array.isArray(app.metadata)
        ? { ...(app.metadata as Record<string, unknown>) }
        : {};

    if (parsed.icon_url !== undefined) {
      const icon = parsed.icon_url?.trim();
      if (icon) {
        prevMeta.icon_url = icon;
        updates.icon_url = icon;
      } else {
        delete prevMeta.icon_url;
        updates.icon_url = null;
      }
    }

    if (parsed.logoGenerator !== undefined) {
      if (parsed.logoGenerator === null) {
        delete prevMeta[APP_METADATA_LOGO_GENERATOR_KEY];
      } else {
        prevMeta[APP_METADATA_LOGO_GENERATOR_KEY] = parsed.logoGenerator;
      }
    }

    if (parsed.icon_url !== undefined || parsed.logoGenerator !== undefined) {
      updates.metadata = prevMeta;
    }

    if (parsed.name != null) updates.name = parsed.name;
    if (parsed.package_name !== undefined) {
      updates.package_name = parsed.package_name || null;
    }
    if (parsed.play_store_url !== undefined) {
      const u = parsed.play_store_url?.trim();
      updates.play_store_url = u ? u : null;
    }
    if (parsed.target_countries != null) {
      updates.target_countries = parsed.target_countries;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "No valid fields" } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("apps")
      .update(updates)
      .eq("id", appId)
      .select("id,name,package_name,play_store_url,target_countries,metadata,icon_url")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: { code: "update_error", message: error?.message ?? "Failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, app: data });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation_error", message: "Invalid input", details: e.flatten() },
        },
        { status: 400 },
      );
    }
    throw e;
  }
}
