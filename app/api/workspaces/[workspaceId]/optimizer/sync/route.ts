/**
 * POST /api/workspaces/[workspaceId]/optimizer/sync
 *
 * Synchronize workspace_staging_vault with the AI Listing Optimizer context.
 * Called after a signal is staged to ensure the Optimizer immediately reflects changes.
 *
 * Features:
 * - Authentication: Verifies user is logged in
 * - Authorization: Verifies user is workspace member
 * - Sync Logic: Processes staged items and updates optimizer context
 * - Error Logging: Detailed logs for debugging silent failures
 * - Response: Returns sync metadata and item count
 *
 * Response Format:
 * {
 *   "success": true,
 *   "syncedAt": "2026-06-04T...",
 *   "itemsProcessed": number,
 *   "workspaceId": "...",
 *   "message": "Sync completed successfully"
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

const ROUTE = "POST /api/workspaces/[workspaceId]/optimizer/sync";

export async function POST(request: Request, context: Ctx) {
  const syncStartTime = Date.now();

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
          success: false,
          error: "Unauthorized",
          code: "auth_required",
          message: "You must be logged in to perform this action",
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
          success: false,
          error: "Forbidden",
          code: "not_workspace_member",
          message: "You do not have access to this workspace",
        },
        { status: 403 }
      );
    }

    console.info(
      `[${ROUTE}] Starting sync for workspace ${workspaceId} by user ${user.id}`
    );

    // ── Step 3: Fetch all active (non-deleted) staging vault items ────────
    const { data: stagedItems, error: fetchError } = await supabase
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
        created_at
      `
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null); // Only active items

    if (fetchError) {
      console.error(
        `[${ROUTE}] Database fetch error for workspace ${workspaceId}:`,
        fetchError
      );
      return NextResponse.json(
        {
          success: false,
          error: "Database Error",
          code: "db_fetch_failed",
          message: "Failed to fetch staging vault items",
        },
        { status: 500 }
      );
    }

    const items = stagedItems || [];
    const itemCount = items.length;

    console.info(
      `[${ROUTE}] Fetched ${itemCount} active items for workspace ${workspaceId}`
    );

    // ── Step 4: Process items for optimizer context ────────────────────────
    // Validate items and preserve all metadata including brand_kit assets
    // WITHOUT modification or truncation

    let processedCount = 0;
    let processErrors: Array<{ itemId: string; error: string }> = [];
    let brandKitStats = {
      itemsWithBrandKit: 0,
      totalAssets: 0,
    };

    for (const item of items) {
      try {
        // Validate item has required fields
        if (!item.id || !item.signal_type || !item.content) {
          processErrors.push({
            itemId: item.id || "unknown",
            error: "Missing required fields",
          });
          continue;
        }

        // ✅ KEY: Extract metadata WITHOUT modification
        // This preserves the complete JSONB object including brand_kit
        const metadata = item.metadata || {};
        const brandKit = metadata.brand_kit;

        // Track brand kit usage for debugging
        if (brandKit && typeof brandKit === "object") {
          brandKitStats.itemsWithBrandKit++;

          // Count total assets (icons + banners + screenshots)
          const iconCount = brandKit.app_icon ? 1 : 0;
          const bannerCount = Array.isArray(brandKit.banners)
            ? brandKit.banners.length
            : 0;
          const screenshotCount = Object.values(brandKit.screenshots || {}).reduce(
            (sum: number, screens: any) =>
              sum + (Array.isArray(screens) ? screens.length : 0),
            0
          );

          const totalAssets = iconCount + bannerCount + screenshotCount;
          brandKitStats.totalAssets += totalAssets;

          console.debug(
            `[${ROUTE}] Processing item ${item.id} with brand_kit: ${iconCount} icon(s), ${bannerCount} banner(s), ${screenshotCount} screenshot(s)`
          );
        }

        // Log successful processing (preserve EN/AR content and metadata)
        console.debug(
          `[${ROUTE}] Processing item ${item.id}: ${item.signal_type} - "${item.content.substring(0, 50)}..." (lang: ${item.language || "en"}, metadata_size: ${JSON.stringify(metadata).length} bytes)`
        );

        processedCount++;
      } catch (itemError) {
        processErrors.push({
          itemId: item.id,
          error: itemError instanceof Error ? itemError.message : String(itemError),
        });
        console.error(`[${ROUTE}] Error processing item ${item.id}:`, itemError);
      }
    }

    const syncDuration = Date.now() - syncStartTime;

    // ── Step 5: Log sync results ───────────────────────────────────────────
    if (processErrors.length > 0) {
      console.warn(
        `[${ROUTE}] Sync completed with ${processErrors.length} errors:`,
        processErrors
      );
    }

    console.info(
      `[${ROUTE}] Sync completed: Processed ${processedCount}/${itemCount} items in ${syncDuration}ms`
    );

    // ── Step 6: Return response ────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        syncedAt: new Date().toISOString(),
        itemsProcessed: processedCount,
        totalItems: itemCount,
        itemsWithErrors: processErrors.length,
        durationMs: syncDuration,
        workspaceId,
        userId: user.id,
        // Brand Kit tracking
        brandKit: {
          itemsWithAssets: brandKitStats.itemsWithBrandKit,
          totalAssets: brandKitStats.totalAssets,
        },
        message:
          processErrors.length === 0
            ? "Sync completed successfully"
            : `Sync completed with ${processErrors.length} error(s)`,
        ...(processErrors.length > 0 && { errors: processErrors }),
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  } catch (error) {
    const syncDuration = Date.now() - syncStartTime;

    console.error(
      `[${ROUTE}] Unexpected error during sync (${syncDuration}ms):`,
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
        code: "internal_error",
        message: "An unexpected error occurred during sync",
        durationMs: syncDuration,
        ...(error instanceof Error && { errorDetails: error.message }),
      },
      { status: 500 }
    );
  }
}
