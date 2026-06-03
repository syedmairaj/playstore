import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const TABLE = "workspace_listing_backlog";

type Ctx = { params: Promise<{ workspaceId: string; itemId: string }> };

const patchBodySchema = z.object({
  /** Set true to archive (mark implemented). Set false to revert to active. */
  is_implemented: z.boolean(),
});

// PATCH /api/workspaces/[workspaceId]/backlog/[itemId]
// Toggles is_implemented on a backlog item.
// Used by: "Mark as Done" button (true) and "Revert to Active" button (false).
export async function PATCH(request: NextRequest, context: Ctx) {
  const { workspaceId, itemId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { success: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  let input: z.infer<typeof patchBodySchema>;
  try {
    input = patchBodySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "validation_error", message: "Invalid input.", details: e.flatten() } },
        { status: 400 },
      );
    }
    throw e;
  }

  const { data: item, error } = await supabase
    .from(TABLE)
    .update({ is_implemented: input.is_implemented })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .select("id, is_implemented, updated_at")
    .single();

  if (error || !item) {
    console.error("[PATCH backlog/[itemId]]", error?.message);
    return NextResponse.json(
      { success: false, error: { code: "db_error", message: "Failed to update backlog item." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, item });
}

// DELETE /api/workspaces/[workspaceId]/backlog/[itemId]
// Permanently removes a backlog item.
// Used by the "Dismiss" button in the Active Optimization Queue.
export async function DELETE(_request: NextRequest, context: Ctx) {
  const { workspaceId, itemId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { success: false, error: { code: "forbidden", message: "Workspace not found or inaccessible." } },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[DELETE backlog/[itemId]]", error.message);
    return NextResponse.json(
      { success: false, error: { code: "db_error", message: "Failed to delete backlog item." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
