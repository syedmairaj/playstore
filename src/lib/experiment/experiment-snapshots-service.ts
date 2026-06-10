/**
 * Experiment Snapshots Service
 *
 * Manages A/B experiment snapshots for ASO testing.
 * Tracks baseline listings and variant performance metrics.
 *
 * Features:
 * - Baseline snapshot creation (current listing state)
 * - Variant snapshot creation (experimental changes)
 * - Weekly metrics recording (manual or automated)
 * - Performance comparison across variants
 * - Soft-delete with recovery capability
 *
 * Schema: experiment_snapshots, experiment_snapshot_metrics
 */

import { createClient } from "@/lib/supabase/server";

export interface BaselineSnapshot {
  id: string;
  appId: string;
  workspaceId: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  previewImageUrl?: string;
  language: "en" | "ar";
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ExperimentVariant extends BaselineSnapshot {
  baselineSnapshotId: string;
  variantName: string;
  changes: Record<string, string>; // { fieldName: newValue }
  hypothesis: string;
}

export interface WeeklyMetrics {
  weekNumber: number;
  impressions: number;
  installs: number;
  uninstalls: number;
  crashRate: number;
  rating: number;
  reviews: number;
  metricsSource: "manual" | "google_play_api";
  recordedAt: string;
}

export interface ExperimentSnapshot {
  id: string;
  appId: string;
  workspaceId: string;
  name: string;
  type: "baseline" | "variant";
  baselineSnapshotId?: string; // For variants
  listing: BaselineSnapshot;
  metrics: WeeklyMetrics[];
  createdAt: string;
  publishedAt?: string;
  deletedAt?: string;
}

/**
 * Experiment Snapshots Service
 * Manages A/B testing infrastructure for app listing optimization
 */
export class ExperimentSnapshotsService {
  private supabase;
  private appId: string;
  private workspaceId: string;

  constructor(appId: string, workspaceId: string) {
    this.appId = appId;
    this.workspaceId = workspaceId;
  }

  /**
   * Initialize Supabase client (call from route handler)
   */
  async init() {
    this.supabase = await createClient();
  }

  /**
   * Create a baseline snapshot of the current listing
   * Captures the current state as a reference point
   */
  async createBaseline(
    title: string,
    shortDescription: string,
    fullDescription: string,
    language: "en" | "ar" = "en",
    previewImageUrl?: string,
    metadata?: Record<string, unknown>
  ): Promise<ExperimentSnapshot> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    const snapshotId = crypto.getRandomUUID();

    const { data, error } = await this.supabase
      .from("experiment_snapshots")
      .insert({
        id: snapshotId,
        app_id: this.appId,
        workspace_id: this.workspaceId,
        name: `Baseline - ${language.toUpperCase()} - ${new Date().toISOString().split("T")[0]}`,
        type: "baseline",
        listing: {
          title,
          shortDescription,
          fullDescription,
          language,
          previewImageUrl,
        },
        metadata,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[ExperimentSnapshotsService] Error creating baseline:", error);
      throw new Error(`Failed to create baseline: ${error.message}`);
    }

    console.log("[ExperimentSnapshotsService] ✅ Baseline created:", {
      snapshotId,
      appId: this.appId,
      language,
    });

    return this.mapRowToSnapshot(data);
  }

  /**
   * Create a variant from a baseline snapshot
   * Represents an experimental version of the listing
   */
  async createVariant(
    baselineSnapshotId: string,
    variantName: string,
    changes: Record<string, string>,
    hypothesis: string,
    language: "en" | "ar" = "en"
  ): Promise<ExperimentSnapshot> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    // Fetch baseline to apply changes
    const baseline = await this.getBaseline(baselineSnapshotId);
    if (!baseline) {
      throw new Error(`Baseline snapshot ${baselineSnapshotId} not found`);
    }

    const variantId = crypto.getRandomUUID();
    const baselineListng = baseline.listing as Record<string, unknown>;
    const variantListing = {
      ...baselineListng,
      ...changes, // Apply changes to baseline
    };

    const { data, error } = await this.supabase
      .from("experiment_snapshots")
      .insert({
        id: variantId,
        app_id: this.appId,
        workspace_id: this.workspaceId,
        name: variantName,
        type: "variant",
        baseline_snapshot_id: baselineSnapshotId,
        listing: variantListing,
        metadata: {
          changes,
          hypothesis,
          baselineId: baselineSnapshotId,
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[ExperimentSnapshotsService] Error creating variant:", error);
      throw new Error(`Failed to create variant: ${error.message}`);
    }

    console.log("[ExperimentSnapshotsService] ✅ Variant created:", {
      variantId,
      variantName,
      baselineSnapshotId,
    });

    return this.mapRowToSnapshot(data);
  }

  /**
   * Record weekly metrics for a snapshot
   * Supports both manual and automated (Google Play API) data
   */
  async recordWeeklyMetrics(
    snapshotId: string,
    weekNumber: number,
    metrics: Omit<WeeklyMetrics, "weekNumber" | "recordedAt">
  ): Promise<WeeklyMetrics> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    const metricsId = crypto.getRandomUUID();

    const { data, error } = await this.supabase
      .from("experiment_snapshot_metrics")
      .insert({
        id: metricsId,
        snapshot_id: snapshotId,
        week_number: weekNumber,
        impressions: metrics.impressions,
        installs: metrics.installs,
        uninstalls: metrics.uninstalls,
        crash_rate: metrics.crashRate,
        rating: metrics.rating,
        reviews: metrics.reviews,
        metrics_source: metrics.metricsSource,
        recorded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[ExperimentSnapshotsService] Error recording metrics:", error);
      throw new Error(`Failed to record metrics: ${error.message}`);
    }

    console.log("[ExperimentSnapshotsService] ✅ Metrics recorded:", {
      snapshotId,
      weekNumber,
      installs: metrics.installs,
      metricsSource: metrics.metricsSource,
    });

    return this.mapRowToWeeklyMetrics(data);
  }

  /**
   * Get baseline snapshot by ID
   */
  async getBaseline(baselineSnapshotId: string): Promise<ExperimentSnapshot | null> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    const { data, error } = await this.supabase
      .from("experiment_snapshots")
      .select(
        `
        id,
        app_id,
        workspace_id,
        name,
        type,
        listing,
        metadata,
        created_at,
        experiment_snapshot_metrics (
          id,
          week_number,
          impressions,
          installs,
          uninstalls,
          crash_rate,
          rating,
          reviews,
          metrics_source,
          recorded_at
        )
      `
      )
      .eq("id", baselineSnapshotId)
      .eq("workspace_id", this.workspaceId)
      .is("deleted_at", null)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      throw new Error(`Failed to fetch baseline: ${error.message}`);
    }

    return this.mapRowToSnapshot(data);
  }

  /**
   * Get all snapshots (baseline + variants) for an app
   */
  async getSnapshots(
    filters?: {
      type?: "baseline" | "variant";
      language?: "en" | "ar";
    }
  ): Promise<ExperimentSnapshot[]> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    let query = this.supabase
      .from("experiment_snapshots")
      .select(
        `
        id,
        app_id,
        workspace_id,
        name,
        type,
        baseline_snapshot_id,
        listing,
        metadata,
        created_at,
        published_at,
        experiment_snapshot_metrics (
          id,
          week_number,
          impressions,
          installs,
          uninstalls,
          crash_rate,
          rating,
          reviews,
          metrics_source,
          recorded_at
        )
      `
      )
      .eq("app_id", this.appId)
      .eq("workspace_id", this.workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filters?.type) {
      query = query.eq("type", filters.type);
    }

    // Parity fix: filter by language stored inside the listing JSONB column.
    // Without this, a single workspace's EN and AR snapshots were returned
    // together regardless of which locale the caller requested.
    if (filters?.language) {
      query = query.eq("listing->>language", filters.language);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch snapshots: ${error.message}`);
    }

    return data.map((row) => this.mapRowToSnapshot(row));
  }

  /**
   * Publish a variant to production
   * Marks it as publishedAt and archives the baseline
   */
  async publishVariant(variantSnapshotId: string): Promise<ExperimentSnapshot> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    // Fetch variant to get baseline
    const variant = await this.getSnapshots({ type: "variant" }).then((snapshots) =>
      snapshots.find((s) => s.id === variantSnapshotId)
    );

    if (!variant || variant.type !== "variant") {
      throw new Error("Variant snapshot not found");
    }

    // Update variant as published
    const { data, error } = await this.supabase
      .from("experiment_snapshots")
      .update({
        published_at: new Date().toISOString(),
      })
      .eq("id", variantSnapshotId)
      .eq("workspace_id", this.workspaceId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to publish variant: ${error.message}`);
    }

    console.log("[ExperimentSnapshotsService] ✅ Variant published:", {
      variantSnapshotId,
      variantName: variant.name,
    });

    return this.mapRowToSnapshot(data);
  }

  /**
   * Soft-delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (!this.supabase) throw new Error("Supabase client not initialized");

    const { error } = await this.supabase
      .from("experiment_snapshots")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", snapshotId)
      .eq("workspace_id", this.workspaceId);

    if (error) {
      throw new Error(`Failed to delete snapshot: ${error.message}`);
    }

    console.log("[ExperimentSnapshotsService] ✅ Snapshot deleted:", snapshotId);
  }

  /**
   * Calculate performance comparison between baseline and variant
   */
  async comparePerformance(
    baselineSnapshotId: string,
    variantSnapshotId: string
  ): Promise<{
    baseline: { avgInstalls: number; avgRating: number };
    variant: { avgInstalls: number; avgRating: number };
    improvement: { installs: number; rating: number };
  }> {
    const baseline = await this.getBaseline(baselineSnapshotId);
    const variant = await this.getBaseline(variantSnapshotId);

    if (!baseline?.metrics || !variant?.metrics) {
      throw new Error("No metrics available for comparison");
    }

    const avgInstalls = (metrics: WeeklyMetrics[]) =>
      metrics.reduce((sum, m) => sum + m.installs, 0) / metrics.length;

    const avgRating = (metrics: WeeklyMetrics[]) =>
      metrics.reduce((sum, m) => sum + m.rating, 0) / metrics.length;

    const baselineAvgInstalls = avgInstalls(baseline.metrics);
    const variantAvgInstalls = avgInstalls(variant.metrics);
    const baselineAvgRating = avgRating(baseline.metrics);
    const variantAvgRating = avgRating(variant.metrics);

    return {
      baseline: {
        avgInstalls: Math.round(baselineAvgInstalls),
        avgRating: parseFloat(baselineAvgRating.toFixed(2)),
      },
      variant: {
        avgInstalls: Math.round(variantAvgInstalls),
        avgRating: parseFloat(variantAvgRating.toFixed(2)),
      },
      improvement: {
        installs: Math.round(variantAvgInstalls - baselineAvgInstalls),
        rating: parseFloat((variantAvgRating - baselineAvgRating).toFixed(2)),
      },
    };
  }

  /**
   * Map database row to ExperimentSnapshot
   */
  private mapRowToSnapshot(row: Record<string, unknown>): ExperimentSnapshot {
    const metricsRows = (row.experiment_snapshot_metrics as unknown[]) || [];

    return {
      id: row.id as string,
      appId: row.app_id as string,
      workspaceId: row.workspace_id as string,
      name: row.name as string,
      type: row.type as "baseline" | "variant",
      baselineSnapshotId: (row.baseline_snapshot_id as string) || undefined,
      listing: row.listing as BaselineSnapshot,
      metrics: metricsRows.map((m) => this.mapRowToWeeklyMetrics(m)),
      createdAt: row.created_at as string,
      publishedAt: (row.published_at as string) || undefined,
      deletedAt: (row.deleted_at as string) || undefined,
    };
  }

  /**
   * Map database row to WeeklyMetrics
   */
  private mapRowToWeeklyMetrics(row: Record<string, unknown>): WeeklyMetrics {
    return {
      weekNumber: row.week_number as number,
      impressions: row.impressions as number,
      installs: row.installs as number,
      uninstalls: row.uninstalls as number,
      crashRate: row.crash_rate as number,
      rating: row.rating as number,
      reviews: row.reviews as number,
      metricsSource: row.metrics_source as "manual" | "google_play_api",
      recordedAt: row.recorded_at as string,
    };
  }
}

export default ExperimentSnapshotsService;
