/**
 * PATCH /api/workspaces/[workspaceId]/staging/archive
 *
 * Archive (soft delete) a signal from the active context.
 * Moves it to "Optimization History Archive" without permanent deletion.
 */

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

const ROUTE = "PATCH /api/workspaces/[workspaceId]/staging/archive";

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

    // Soft archive: set deleted_at timestamp
    const { error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: user.id,
      })
      .eq("id", signalId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to archive signal: ${error.message}`);
    }

    console.info(`[${ROUTE}] Signal ${signalId} archived`);

    return NextResponse.json({
      ok: true,
      data: { id: signalId, message: "Signal archived" },
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
