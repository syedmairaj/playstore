import { NextResponse } from "next/server";
import { isPostgrestTableMissing } from "@/lib/supabase/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const TABLE = "workspace_listing_improvements";

type Ctx = { params: Promise<{ workspaceId: string; id: string }> };

export async function DELETE(_request: Request, context: Ctx) {
  const { workspaceId, id } = await context.params;

  if (!id?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Missing item id" } },
      { status: 400 },
    );
  }

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

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    if (isPostgrestTableMissing(error, TABLE)) {
      // Table not migrated yet — treat as already-deleted (idempotent)
      return NextResponse.json({ ok: true });
    }
    console.error(
      `[api/workspaces/${workspaceId}/listing-improvements/${id}] DELETE failed:`,
      error,
    );
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: error.message ?? "Delete failed" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
