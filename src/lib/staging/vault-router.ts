/**
 * Vault Router Service
 *
 * Routes all feature requests to correct producers
 * Handles persistence, caching, and error handling
 */

import { createClient } from "@/lib/supabase/server";
import {
  WorkspaceStagingVault,
  ProducerRequest,
  ProducerResponse,
} from "./vault.types";
import { producerRegistry } from "./producer-registry";

export class VaultRouterService {
  /**
   * Main entry point: Route a producer request
   *
   * Flow:
   * 1. Validate request
   * 2. Fetch vault (or create new)
   * 3. Route to producer
   * 4. Persist updated vault
   * 5. Return feature data
   */
  async routeProducerRequest(
    req: ProducerRequest
  ): Promise<ProducerResponse> {
    try {
      console.log(`[VaultRouter] Routing request:`, {
        feature: req.feature,
        locale: req.locale,
        workspace: req.workspaceId,
        app: req.appId,
      });

      // Validate
      if (!["en", "ar"].includes(req.locale)) {
        return {
          ok: false,
          error: { code: "invalid_locale", message: `Invalid locale: ${req.locale}` },
        };
      }

      // Fetch or create vault
      let vault = await this.getOrCreateVault(req.workspaceId, req.appId);

      // Route to producer
      const updatedVault = await producerRegistry.produce(
        req.feature,
        vault,
        req.payload,
        req.locale,
        req.userId
      );

      // Persist
      await this.saveVault(updatedVault);

      // Return only requested feature data
      const state =
        req.locale === "en" ? updatedVault.state_en : updatedVault.state_ar;
      const featureData = state.features[req.feature];

      console.log(`[VaultRouter] ✅ Request routed successfully:`, {
        feature: req.feature,
        locale: req.locale,
        hasFeaturedData: !!featureData,
      });

      return {
        ok: true,
        data: featureData,
      };
    } catch (error) {
      console.error(`[VaultRouter] Error:`, error);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        ok: false,
        error: {
          code: "routing_error",
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Get vault for an app, or create if doesn't exist
   */
  async getOrCreateVault(
    workspaceId: string,
    appId: string
  ): Promise<WorkspaceStagingVault> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .single();

    if (data) {
      return this.mapRowToVault(data);
    }

    // Create new vault
    const newVault: Partial<WorkspaceStagingVault> = {
      workspace_id: workspaceId,
      app_id: appId,
      state_en: {
        features: {},
        metadata: {
          workspace_id: workspaceId,
          app_id: appId,
          locale: "en",
          schema_version: "1.0",
          last_producer: "",
          last_producer_timestamp: new Date().toISOString(),
          feature_count: 0,
          total_bytes: 0,
          dirty_flags: {},
        },
      },
      state_ar: {
        features: {},
        metadata: {
          workspace_id: workspaceId,
          app_id: appId,
          locale: "ar",
          schema_version: "1.0",
          last_producer: "",
          last_producer_timestamp: new Date().toISOString(),
          feature_count: 0,
          total_bytes: 0,
          dirty_flags: {},
        },
      },
      active_features: [],
      created_at: new Date(),
      updated_at: new Date(),
      change_count: 0,
      is_deleted: false,
    };

    const { data: created, error: createError } = await supabase
      .from("workspace_staging_vault")
      .insert([newVault])
      .select()
      .single();

    if (createError || !created) {
      throw new Error(`Failed to create vault: ${createError?.message}`);
    }

    console.log(`[VaultRouter] Created new vault:`, {
      workspaceId,
      appId,
      vaultId: created.id,
    });

    return this.mapRowToVault(created);
  }

  /**
   * Save/update vault to database
   */
  async saveVault(vault: WorkspaceStagingVault): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from("workspace_staging_vault")
      .upsert(
        {
          id: vault.id,
          workspace_id: vault.workspace_id,
          app_id: vault.app_id,
          state_en: vault.state_en,
          state_ar: vault.state_ar,
          active_features: vault.active_features,
          last_modified_by: vault.last_modified_by,
          change_count: vault.change_count,
          updated_at: vault.updated_at,
        },
        { onConflict: "id" }
      );

    if (error) {
      throw new Error(`Failed to save vault: ${error.message}`);
    }

    console.log(`[VaultRouter] Vault saved:`, {
      vaultId: vault.id,
      changeCount: vault.change_count,
      activeFeatures: vault.active_features.length,
    });
  }

  /**
   * Get vault without modifying
   */
  async getVault(workspaceId: string, appId: string): Promise<WorkspaceStagingVault | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .eq("is_deleted", false)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapRowToVault(data);
  }

  /**
   * List all vaults for a workspace
   */
  async listVaults(workspaceId: string): Promise<WorkspaceStagingVault[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_deleted", false);

    if (error || !data) {
      return [];
    }

    return data.map((row) => this.mapRowToVault(row));
  }

  /**
   * Delete vault (soft delete)
   */
  async deleteVault(workspaceId: string, appId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from("workspace_staging_vault")
      .update({
        is_deleted: true,
        deleted_at: new Date(),
      })
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId);

    if (error) {
      throw new Error(`Failed to delete vault: ${error.message}`);
    }

    console.log(`[VaultRouter] Vault deleted:`, { workspaceId, appId });
  }

  /**
   * Map database row to vault object
   */
  private mapRowToVault(row: any): WorkspaceStagingVault {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      app_id: row.app_id,
      state_en: row.state_en,
      state_ar: row.state_ar,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      deleted_at: row.deleted_at ? new Date(row.deleted_at) : undefined,
      last_modified_by: row.last_modified_by,
      change_count: row.change_count || 0,
      active_features: row.active_features || [],
      is_deleted: row.is_deleted || false,
    };
  }
}

/**
 * Global instance
 */
export const vaultRouter = new VaultRouterService();
