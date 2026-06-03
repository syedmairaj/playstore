import { NextResponse } from "next/server";
import { isPostgrestTableMissing } from "@/lib/supabase/postgrest-errors";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const COMPETITOR_ANALYSES_TABLE = "workspace_competitor_analyses";

type Ctx = { params: Promise<{ workspaceId: string; competitorId: string }> };

export async function DELETE(_request: Request, context: Ctx) {
  const { workspaceId, competitorId } = await context.params;
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

  const { data: row, error: selErr } = await supabase
    .from(COMPETITOR_ANALYSES_TABLE)
    .select("id")
    .eq("id", competitorId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (selErr) {
    if (isPostgrestTableMissing(selErr, COMPETITOR_ANALYSES_TABLE)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "schema_unavailable",
            message:
              "Competitor persistence is unavailable until migration 20260516100000_workspace_competitor_analyses is applied.",
          },
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "query_error", message: selErr.message ?? "Query failed" } },
      { status: 500 },
    );
  }

  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Competitor not found" } },
      { status: 404 },
    );
  }

  const { error } = await supabase
    .from(COMPETITOR_ANALYSES_TABLE)
    .delete()
    .eq("id", competitorId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "delete_error", message: error.message ?? "Delete failed" } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
