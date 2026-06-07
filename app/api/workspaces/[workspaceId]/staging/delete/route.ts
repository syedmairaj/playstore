/**
 * DELETE /api/workspaces/[workspaceId]/staging/delete
 *
 * Soft delete a signal from the workspace staging vault.
 * Marks the signal as deleted_at = now.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "DELETE /api/workspaces/[workspaceId]/staging/delete";

const bodySchema = z.object({
  signalId: z.string().uuid(),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function DELETE(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 }
    );
  }

  // Verify workspace membership
  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  // Parse request body
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "validation",
            message: err.errors[0]?.message ?? "Invalid request",
          },
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Could not parse request" } },
      { status: 400 }
    );
  }

  try {
    const { signalId } = body;

    // Soft delete: mark as deleted
    const { error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: user.id,
      })
      .eq("id", signalId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to delete signal: ${error.message}`);
    }

    console.info(`[${ROUTE}] Successfully deleted signal ${signalId}`);

    return NextResponse.json({
      ok: true,
      data: {
        id: signalId,
        message: "Signal deleted",
      },
    });
  } catch (error) {
    console.error(`[${ROUTE}] Error:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "staging_error",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
