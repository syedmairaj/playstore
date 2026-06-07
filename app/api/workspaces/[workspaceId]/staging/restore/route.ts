/**
 * PATCH /api/workspaces/[workspaceId]/staging/restore
 *
 * Restore an archived signal back to active context.
 * Clears the deleted_at timestamp to make it active again.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "PATCH /api/workspaces/[workspaceId]/staging/restore";

const bodySchema = z.object({
  signalId: z.string().uuid(),
});

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function PATCH(request: Request, context: Ctx) {
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

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Not a workspace member" } },
      { status: 403 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "validation", message: err.errors[0]?.message ?? "Invalid request" },
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

    // Restore: clear deleted_at to make active again
    const { error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: null,
      })
      .eq("id", signalId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to restore signal: ${error.message}`);
    }

    console.info(`[${ROUTE}] Signal ${signalId} restored`);

    return NextResponse.json({
      ok: true,
      data: { id: signalId, message: "Signal restored" },
    });
  } catch (error) {
    console.error(`[${ROUTE}] Error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: { code: "staging_error", message: errorMessage },
      },
      { status: 500 }
    );
  }
}
