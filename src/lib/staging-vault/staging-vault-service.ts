/**
 * Staging Vault Service - INSERT with 23505 Error Handling
 *
 * Uses simple `.insert()` with explicit PostgreSQL unique constraint (23505) handling.
 * If a signal already exists (23505 error), treats it as success (idempotent).
 * This avoids fragile `.upsert()` `onConflict` logic while maintaining data integrity.
 * Fully supports English (en) and Arabic (ar) content with UTF-8 preservation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeywordPayload } from "@/hooks/useKeywordSelection";

export interface AddSignalPayload {
  signalType: string;
  content: string;
  source: string;
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;
  language: "en" | "ar";
  metadata: Record<string, unknown>;
  keywords?: KeywordPayload[];
  category?: string;  // ✅ CATEGORIZATION: Route signal to correct bucket (e.g., 'competitor_keyword')
}

export interface StagingVaultResult {
  id: string;
  workspaceId: string;
  signalType: string;
  message: string;
  createdAt: string;
}

export async function addSignalToVault(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: AddSignalPayload
): Promise<StagingVaultResult> {
  const {
    signalType,
    content,
    source,
    sourceAppId,
    sourceContext,
    sourceContextId,
    language,
    metadata,
    keywords,
    category,
  } = payload;

  const now = new Date().toISOString();

  console.log("[StagingVaultService] 📝 ADDING SIGNAL:", {
    signalType,
    source,
    language,
    workspaceId,
  });

  try {
    // Build the signal record to insert
    const finalMetadata: Record<string, unknown> = {
      ...metadata,
      keywords: keywords || [],
      signal_created_at: now,
    };

    // ✅ CATEGORIZATION: Preserve category in metadata if provided
    if (category) {
      finalMetadata.category = category;
    }

    const signalRecord = {
      workspace_id: workspaceId,
      signal_type: signalType,
      content, // UTF-8 preserved: Arabic/English/etc fully supported
      source,
      source_app_id: sourceAppId || null,
      source_context: sourceContext || null,
      source_context_id: sourceContextId || null,
      language, // 'en' or 'ar' or other language codes - CRITICAL for bilingual support
      metadata: finalMetadata,
      created_at: now,
    };

    console.log("[StagingVaultService] ➕ INSERTING SIGNAL:", {
      signalType,
      source,
      language,
      category,  // ✅ Log category for debugging
      workspaceId,
    });

    // Attempt insert
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .insert([signalRecord])
      .select("id, created_at");

    // Handle errors with explicit 23505 (unique constraint violation) logic
    if (error) {
      // 23505: unique_violation - signal already exists with same (workspace_id, competitor_id, language, signal_type)
      if (error.code === "23505") {
        console.log("[StagingVaultService] ℹ️ SIGNAL ALREADY EXISTS (23505):", {
          signalType,
          source,
          language,
          category,  // ✅ Log category for debugging
          workspaceId,
          message: "Treating as success - signal is already in vault (idempotent)",
        });

        // Return success response using the record data (we don't have the actual ID, so generate placeholder)
        const placeholderId = `existing-${Date.now()}`;
        return {
          id: placeholderId,
          workspaceId,
          signalType,
          message: `Signal already exists in vault (${keywords?.length || 0} keywords) - idempotent success`,
          createdAt: now,
        };
      }

      // Any other error code: log and throw
      console.error("[StagingVaultService] ❌ INSERT FAILED:", {
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        signalType,
        source,
        workspaceId,
      });
      throw new Error(
        `Failed to add signal to vault: ${error.message} (${error.code})`
      );
    }

    // Success: signal was inserted
    if (!data || data.length === 0) {
      throw new Error("Signal inserted but no ID returned");
    }

    const { id, created_at } = data[0];

    console.log("[StagingVaultService] ✅ SIGNAL INSERTED:", {
      signalId: id,
      signalType,
      source,
      language,
      createdAt: created_at,
      keywordCount: keywords?.length || 0,
    });

    return {
      id,
      workspaceId,
      signalType,
      message: `Signal added to vault (${keywords?.length || 0} keywords)`,
      createdAt: created_at,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error("[StagingVaultService] ❌ UNEXPECTED ERROR:", {
      errorMessage: errorMsg,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      signalType,
      source,
      language,
      workspaceId,
    });

    throw error;
  }
}

export async function getStagingVaultItems(
  supabase: SupabaseClient,
  workspaceId: string,
  options: { includeDeleted?: boolean } = {}
) {
  const { includeDeleted = false } = options;

  console.log("[StagingVaultService] 📖 FETCHING ITEMS:", {
    workspaceId,
    includeDeleted,
  });

  try {
    let query = supabase
      .from("workspace_staging_vault")
      .select(
        `id, workspace_id, signal_type, content, source, source_app_id, source_context, source_context_id, language, metadata, created_at, deleted_at`
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[StagingVaultService] ❌ FETCH FAILED:", {
        errorCode: error.code,
        errorMessage: error.message,
        workspaceId,
      });
      throw new Error(
        `Failed to fetch staging items: ${error.message} (${error.code})`
      );
    }

    console.log("[StagingVaultService] ✅ ITEMS FETCHED:", {
      itemCount: data?.length || 0,
      workspaceId,
    });

    return data || [];
  } catch (error) {
    console.error(
      "[StagingVaultService] ❌ UNEXPECTED ERROR:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function archiveStagingItem(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string
) {
  console.log("[StagingVaultService] 🗑️ ARCHIVING ITEM:", {
    itemId,
    workspaceId,
  });

  try {
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("workspace_id", workspaceId)
      .select("id");

    if (error) {
      throw new Error(
        `Failed to archive item: ${error.message} (${error.code})`
      );
    }

    if (!data || data.length === 0) {
      throw new Error("Item not found or already archived");
    }

    console.log("[StagingVaultService] ✅ ITEM ARCHIVED:", {
      itemId,
      workspaceId,
    });

    return { success: true, itemId };
  } catch (error) {
    console.error(
      "[StagingVaultService] ❌ ARCHIVE FAILED:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function restoreStagingItem(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string
) {
  console.log("[StagingVaultService] 🔄 RESTORING ITEM:", {
    itemId,
    workspaceId,
  });

  try {
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: null,
      })
      .eq("id", itemId)
      .eq("workspace_id", workspaceId)
      .select("id");

    if (error) {
      throw new Error(
        `Failed to restore item: ${error.message} (${error.code})`
      );
    }

    if (!data || data.length === 0) {
      throw new Error("Item not found");
    }

    console.log("[StagingVaultService] ✅ ITEM RESTORED:", {
      itemId,
      workspaceId,
    });

    return { success: true, itemId };
  } catch (error) {
    console.error(
      "[StagingVaultService] ❌ RESTORE FAILED:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
