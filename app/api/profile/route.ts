import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, type ProfileLike } from "@/lib/profile/is-admin";
import { patchProfileSchema } from "@/lib/validation/api";

export type ProfileResponse = {
  ok: true;
  user: { id: string; email: string | null };
  profile: {
    id: string;
    display_name: string | null;
    notification_preferences: Record<string, unknown> | null;
    is_admin: boolean;
    /**
     * Reserved for forward-compatibility; `profiles.role` does not exist in
     * the current schema (the `role` column lives on `workspace_members`).
     * Always `null` from this endpoint today.
     */
    role: string | null;
    isAdmin: boolean;
  };
};

/**
 * Returns the signed-in user's auth identity (id + email) joined with their
 * `profiles` row. `email` is sourced from `auth.users` (Supabase), not from
 * `profiles` — there is no `profiles.email` column; the auth-trigger
 * `handle_new_user` only sets `display_name`. See `lib/profile/is-admin.ts`
 * for the `isAdmin` predicate and the `role`/`is_admin` compatibility note.
 */
export async function GET() {
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

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, notification_preferences, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "profile_fetch_error", message: error.message } },
      { status: 500 },
    );
  }

  const profile: ProfileResponse["profile"] = {
    id: (data?.id as string | undefined) ?? user.id,
    display_name: (data?.display_name as string | null | undefined) ?? null,
    notification_preferences:
      (data?.notification_preferences as Record<string, unknown> | null | undefined) ??
      null,
    is_admin: Boolean(data?.is_admin),
    role: null,
    isAdmin: isAdmin(data as ProfileLike | null),
  };

  const body: ProfileResponse = {
    ok: true,
    user: { id: user.id, email: user.email ?? null },
    profile,
  };
  return NextResponse.json(body);
}

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
