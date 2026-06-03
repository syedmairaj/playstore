import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAuth } from "@/lib/admin/require-admin-api";
import type { ProfileAccountStatus } from "@/lib/auth/profile-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const bodySchema = z.object({
  status: z.enum(["active", "flagged", "suspended"]),
});

type Ctx = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: auth.status === 401 ? "unauthorized" : "forbidden" } },
      { status: auth.status },
    );
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "Invalid user id" } },
      { status: 400 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "Invalid body" } },
      { status: 422 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .update({ account_status: body.status satisfies ProfileAccountStatus })
    .eq("id", userId)
    .select("id, account_status")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "update_error", message: error.message } },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Profile not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: data.id,
    accountStatus: data.account_status,
  });
}
