/**
 * GET /api/workspaces/[workspaceId]/optimizer/context
 *
 * Fetch the optimizer context - all staged and archived items from workspace_staging_vault.
 * Used by the frontend to populate the "Active Context" in the AI Listing Optimizer.
 *
 * Features:
 * - Authentication: Verifies user is logged in
 * - Authorization: Verifies user is workspace member
 * - Localization: Preserves EN/AR content without encoding issues
 * - Filtering: Separates active (staged) and archived items
 * - Stats: Returns counts for dashboard display
 *
 * Response Format:
 * {
 *   "activeItems": [...staged items...],
 *   "archivedItems": [...archived items...],
 *   "stats": { "totalStaged", "totalArchived", "lastSyncAt" }
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

const ROUTE = "GET /api/workspaces/[workspaceId]/optimizer/context";

export async function GET(request: Request, context: Ctx) {
  try {
    const { workspaceId } = await context.params;
    const supabase = await createClient();

    // ── Step 1: Authenticate user ──────────────────────────────────────────
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn(`[${ROUTE}] Unauthorized: No user found`);
      return NextResponse.json(
        {
          error: "Unauthorized",
          code: "auth_required",
          message: "You must be logged in to access this resource",
        },
        { status: 401 }
      );
    }

    // ── Step 2: Verify workspace membership ─────────────────────────────────
    const role = await getWorkspaceRole(supabase, workspaceId, user.id);

    if (!role) {
      console.warn(
        `[${ROUTE}] Forbidden: User ${user.id} not member of workspace ${workspaceId}`
      );
      return NextResponse.json(
        {
          error: "Forbidden",
          code: "not_workspace_member",
          message: "You do not have access to this workspace",
        },
        { status: 403 }
      );
    }

    // ── Step 3: Fetch all staging vault items for this workspace ────────────
    let stagedItems: any[] | null = null;
    let fetchError: any = null;

    try {
      const result = await supabase
        .from("workspace_staging_vault")
        .select(
          `
          id,
          workspace_id,
          signal_type,
          content,
          source,
          source_app_id,
          source_context,
          source_context_id,
          language,
          metadata,
          created_at,
          deleted_at
        `
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      stagedItems = result.data;
      fetchError = result.error;
    } catch (catchError) {
      fetchError = catchError;
      console.error(
        `[${ROUTE}] Unexpected error during fetch:`,
        catchError instanceof Error ? catchError.message : String(catchError)
      );
    }

    if (fetchError) {
      const errorMsg =
        fetchError instanceof Error ? fetchError.message : fetchError?.message || JSON.stringify(fetchError);
      console.error(`[${ROUTE}] Database fetch error:`, errorMsg);
      return NextResponse.json(
        {
          error: "Database Error",
          code: "db_fetch_failed",
          message: "Failed to fetch staging vault items",
          details: errorMsg, // Include actual error message
          fetchErrorCode: fetchError?.code,
          fetchErrorDetails: fetchError?.details,
        },
        { status: 500 }
      );
    }

    // ── Step 4: Filter and map items (preserves EN/AR content natively) ─────
    const items = stagedItems || [];

    // Active items: staged but not deleted
    const activeItems = items
      .filter((item) => !item.deleted_at)
      .map((item) => ({
        id: item.id,
        signalType: item.signal_type,
        content: item.content, // UTF-8 preserved: EN or AR strings work natively
        source: item.source,
        sourceAppId: item.source_app_id,
        sourceContext: item.source_context,
        sourceContextId: item.source_context_id,
        language: item.language || "en",
        stagedAt: item.created_at,
        metadata: item.metadata || {}, // JSONB with EN/AR fields preserved
      }));

    // Deleted items: marked as deleted
    const archivedItems = items
      .filter((item) => item.deleted_at)
      .map((item) => ({
        id: item.id,
        signalType: item.signal_type,
        content: item.content, // UTF-8 preserved: EN or AR strings work natively
        deletedAt: item.deleted_at,
        deletedReason: "archived", // Hardcoded default since deleted_reason column doesn't exist
        deletedBy: item.source_context || undefined,
      }));

    // ── Step 5: Compile stats ──────────────────────────────────────────────
    const stats = {
      totalStaged: activeItems.length,
      totalDeleted: archivedItems.length,
      lastSyncAt: new Date().toISOString(),
      workspaceId,
      userId: user.id,
    };

    console.info(
      `[${ROUTE}] Success: Returned ${activeItems.length} active, ${archivedItems.length} deleted items for workspace ${workspaceId}`
    );

    // ── Step 6: Return response ────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        activeItems,
        archivedItems,
        stats,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    console.error(`[${ROUTE}] Unexpected error:`, error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        code: "internal_error",
        message: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
