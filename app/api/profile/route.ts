import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { patchProfileSchema } from "@/lib/validation/api";

export async function PATCH(request: Request) {
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
    const parsed = patchProfileSchema.parse(body);
    const updates: Record<string, unknown> = {};
    if (parsed.display_name != null) updates.display_name = parsed.display_name;
    if (parsed.notification_preferences != null) {
      updates.notification_preferences = parsed.notification_preferences;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "No valid fields" } },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select("id,display_name,notification_preferences")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: { code: "update_error", message: error?.message ?? "Failed" } },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, profile: data });
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
