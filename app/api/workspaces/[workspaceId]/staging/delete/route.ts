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
  keywordTerm: z.string().optional(),  // ✅ GRANULAR: Delete specific keyword from signal
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
    const { signalId, keywordTerm } = body;

    console.log(`[${ROUTE}] 🗑️ DELETE REQUEST RECEIVED (EN/AR SUPPORT):`, {
      signalId,
      keywordTerm,
      workspaceId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // ✅ GRANULAR DELETION: If keywordTerm provided, remove just that keyword
    if (keywordTerm) {
      console.log(`[${ROUTE}] 🎯 GRANULAR MODE: Removing keyword "${keywordTerm}" from signal ${signalId}`);

      // Fetch the signal to get current metadata
      const { data: signal, error: fetchError } = await supabase
        .from("workspace_staging_vault")
        .select("metadata")
        .eq("id", signalId)
        .eq("workspace_id", workspaceId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch signal: ${fetchError.message}`);
      }

      if (!signal) {
        throw new Error("Signal not found");
      }

      const metadata = signal.metadata as Record<string, unknown> || {};
      const keywords = (metadata.keywords as unknown[]) || [];

      // Filter out the keyword to delete
      const updatedKeywords = keywords.filter((kw) => {
        if (typeof kw === "string") return kw !== keywordTerm;
        const kwObj = kw as Record<string, unknown>;
        return kwObj.term !== keywordTerm;
      });

      console.log(`[${ROUTE}] Keyword filter: ${keywords.length} → ${updatedKeywords.length}`, {
        removed: keywordTerm,
      });

      // ✅ ALWAYS update signal with filtered keywords, even if empty
      // This preserves the signal so user can see it's still there
      // Signal only gets deleted if user explicitly deletes the entire signal
      console.log(`[${ROUTE}] 📝 UPDATING SIGNAL with filtered keywords:`, {
        signalId,
        beforeCount: keywords.length,
        afterCount: updatedKeywords.length,
        removed: keywordTerm,
      });

      const { error: updateError } = await supabase
        .from("workspace_staging_vault")
        .update({
          metadata: {
            ...metadata,
            keywords: updatedKeywords,
          },
        })
        .eq("id", signalId)
        .eq("workspace_id", workspaceId);

      if (updateError) {
        console.error(`[${ROUTE}] ❌ UPDATE FAILED:`, {
          error: updateError.message,
          code: updateError.code,
        });
        throw new Error(`Failed to update signal: ${updateError.message}`);
      }

      console.info(`[${ROUTE}] ✅ KEYWORD REMOVED SUCCESSFULLY (EN/AR):`, {
        keywordTerm,
        signalId,
        remainingKeywords: updatedKeywords.length,
        language: 'en,ar',
      });

      return NextResponse.json({
        ok: true,
        data: {
          id: signalId,
          message: `Keyword "${keywordTerm}" removed`,
          remainingKeywords: updatedKeywords.length,
        },
      });
    }

    // Full signal deletion (no keywordTerm provided)
    console.log(`[${ROUTE}] Full deletion: removing entire signal ${signalId}`);
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
