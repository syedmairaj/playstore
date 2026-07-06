import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingGenerationJobStatus } from "@/lib/listing/listing-generation-job.types";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type PipelineEventCode =
  | "STALE_VAULT_CONTEXT"
  | "modular_phase_order_conflict"
  | "WAITING_FOR_PHASES"
  | "worker_failed"
  | "job_not_found"
  | "generation_timeout"
  | "queue_publish_failed"
  /** Emitted by syncVisualAssetManifest after each pipeline/full generation. */
  | "visual_alignment_check";

export type PipelineEventSeverity = "error" | "warn" | "info";

export type PipelineEventPayload = {
  event: PipelineEventCode;
  severity: PipelineEventSeverity;
  jobId?: string;
  workspaceId: string;
  vaultLocale?: "en" | "ar";
  queueHash?: string;
  /** Server-side recomputed vault hash (populated on STALE_VAULT_CONTEXT). */
  serverQueueHash?: string;
  missingPhases?: Array<"title" | "short" | "long">;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Observability sink
// Swap the body of `emitToObservabilityService` for a real provider
// (e.g. Sentry, Datadog Logs REST, Axiom) without changing call-sites.
// ──────────────────────────────────────────────────────────────────────────────

function emitToObservabilityService(payload: PipelineEventPayload): void {
  const fn =
    payload.severity === "error"
      ? console.error
      : payload.severity === "warn"
        ? console.warn
        : console.log;

  fn(JSON.stringify(payload));
}

/**
 * Log a structured pipeline event.
 *
 * Intended to be called from:
 *  - `app/api/listings/worker/route.ts`        (STALE_VAULT_CONTEXT, worker_failed)
 *  - `src/lib/listing/listing-generation-executor.ts` (modular_phase_order_conflict)
 *  - `src/lib/client/poll-listing-generation-status.ts` (generation_timeout)
 *  - `src/lib/listing/sync-visual-asset-manifest.ts` (visual_alignment_check)
 *
 * EN/AR pipelines both pass through this function; `vaultLocale` tags which
 * vault branch was active when the event occurred.
 */
export function logPipelineEvent(
  event: PipelineEventCode,
  payload: Omit<PipelineEventPayload, "event" | "severity" | "timestamp">,
): void {
  const severityMap: Record<PipelineEventCode, PipelineEventSeverity> = {
    STALE_VAULT_CONTEXT: "warn",
    modular_phase_order_conflict: "error",
    WAITING_FOR_PHASES: "info",
    worker_failed: "error",
    job_not_found: "error",
    generation_timeout: "warn",
    queue_publish_failed: "error",
    visual_alignment_check: "info",
  };

  emitToObservabilityService({
    ...payload,
    event,
    severity: severityMap[event],
    timestamp: new Date().toISOString(),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Health aggregation
// ──────────────────────────────────────────────────────────────────────────────

export type PipelinePhaseStats = {
  phase: "title" | "short" | "long" | "full";
  totalRuns: number;
  totalCredits: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  avgCreditsPerRun: number;
};

export type PipelineJobStats = {
  status: ListingGenerationJobStatus;
  count: number;
};

export type PipelineHealthSummary = {
  workspaceId: string;
  windowDays: number;
  fetchedAt: string;
  jobStats: PipelineJobStats[];
  phaseStats: PipelinePhaseStats[];
  /** Count of jobs older than `staleDraftDays` with status "pending" or "processing". */
  stuckJobCount: number;
};

/**
 * Aggregates pipeline health data for a workspace from:
 *   - `workspace_listing_drafts`  (job lifecycle statistics)
 *   - `listing_generation_costs`  (per-phase telemetry)
 *
 * Caller supplies a Supabase admin client (service role) so RLS does not filter results.
 */
export async function getPipelineHealthSummary(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: {
    /** Rolling window in days (default: 30). */
    windowDays?: number;
    /** Jobs older than this many days with active status are counted as stuck (default: 1). */
    staleDraftDays?: number;
  },
): Promise<PipelineHealthSummary> {
  const windowDays = options?.windowDays ?? 30;
  const staleDraftDays = options?.staleDraftDays ?? 1;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const staleThreshold = new Date(
    Date.now() - staleDraftDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [draftsResult, costsResult, stuckResult] = await Promise.all([
    // Job lifecycle counts
    supabase
      .from("workspace_listing_drafts")
      .select("generation_status")
      .eq("workspace_id", workspaceId)
      .gte("updated_at", since),

    // Per-phase cost rows
    supabase
      .from("listing_generation_costs")
      .select("generation_step, credits_charged, prompt_tokens, completion_tokens")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since),

    // Stuck jobs
    supabase
      .from("workspace_listing_drafts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("generation_status", ["pending", "processing"])
      .lt("updated_at", staleThreshold),
  ]);

  // ── Job stats ──────────────────────────────────────────────────────────────
  const jobCountMap = new Map<string, number>();
  for (const row of (draftsResult.data ?? []) as Array<{
    generation_status: string | null;
  }>) {
    const s = row.generation_status ?? "unknown";
    jobCountMap.set(s, (jobCountMap.get(s) ?? 0) + 1);
  }
  const jobStats: PipelineJobStats[] = Array.from(jobCountMap.entries()).map(
    ([status, count]) => ({ status: status as ListingGenerationJobStatus, count }),
  );

  // ── Phase stats ────────────────────────────────────────────────────────────
  type CostRow = {
    generation_step: string;
    credits_charged: number | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
  };

  const phaseMap = new Map<
    string,
    { runs: number; credits: number; prompt: number; completion: number }
  >();
  for (const row of (costsResult.data ?? []) as CostRow[]) {
    const phase = row.generation_step ?? "unknown";
    const existing = phaseMap.get(phase) ?? { runs: 0, credits: 0, prompt: 0, completion: 0 };
    phaseMap.set(phase, {
      runs: existing.runs + 1,
      credits: existing.credits + (row.credits_charged ?? 0),
      prompt: existing.prompt + (row.prompt_tokens ?? 0),
      completion: existing.completion + (row.completion_tokens ?? 0),
    });
  }
  const phaseStats: PipelinePhaseStats[] = Array.from(phaseMap.entries()).map(
    ([phase, s]) => ({
      phase: phase as PipelinePhaseStats["phase"],
      totalRuns: s.runs,
      totalCredits: s.credits,
      totalPromptTokens: s.prompt,
      totalCompletionTokens: s.completion,
      avgCreditsPerRun: s.runs > 0 ? Math.round((s.credits / s.runs) * 100) / 100 : 0,
    }),
  );

  return {
    workspaceId,
    windowDays,
    fetchedAt: new Date().toISOString(),
    jobStats,
    phaseStats,
    stuckJobCount: (stuckResult.count ?? 0) as number,
  };
}
