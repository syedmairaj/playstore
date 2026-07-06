import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModularListingGenerationStep } from "@/lib/listing/modular-listing.types";
import {
  fetchDraftState,
  type FetchDraftStateParams,
} from "@/lib/listing/listing-draft-persist";
import {
  ModularPhaseOrderError,
  assertModularPhaseOrder,
  checkModularPhaseOrder,
  type ModularPhaseGuardStep,
  type ModularPhaseOrderCheckResult,
} from "@/lib/listing/modular-phase-guard";
import type { ListingDraftPersistedPhases } from "@/lib/listing/listing-draft-persist.types";

const SEQUENTIAL_CLIENT_STEPS = new Set<ModularListingGenerationStep>([
  "title",
  "short",
  "long",
  "hook",
  "features",
  "closing",
]);

/** Granular long blocks — require isRegenerate; title/short/long allowed for phase-chain recovery. */
const GRANULAR_LONG_STEPS = new Set<ModularListingGenerationStep>([
  "hook",
  "features",
  "closing",
]);

export class ModularPipelineEntryError extends Error {
  readonly code = "modular_pipeline_required" as const;

  constructor(
    message = "Use generationStep: pipeline for modular generation. Individual steps are only allowed for regenerate.",
  ) {
    super(message);
    this.name = "ModularPipelineEntryError";
  }
}

export class GenerationInProgressError extends Error {
  readonly code = "generation_in_progress" as const;

  constructor(
    message = "A listing generation is already in progress for this optimization queue. Please wait for it to finish.",
  ) {
    super(message);
    this.name = "GenerationInProgressError";
  }
}

/** Blocks out-of-order client step calls — pipeline serializes server-side. */
export function assertModularPipelineEntry(params: {
  step: ModularListingGenerationStep;
  isRegenerate?: boolean;
  isDraft?: boolean;
  fastDraft?: boolean;
}): void {
  if (params.isDraft || params.fastDraft) return;
  if (
    params.step === "pipeline" ||
    params.step === "finalize" ||
    params.step === "full"
  ) {
    return;
  }
  if (params.isRegenerate && SEQUENTIAL_CLIENT_STEPS.has(params.step)) {
    return;
  }
  // Title / short / long may be invoked by the client phase-chain fallback when
  // finalize returns WAITING_FOR_PHASES (instant-draft rows with stale flags).
  if (
    params.step === "title" ||
    params.step === "short" ||
    params.step === "long"
  ) {
    return;
  }
  if (GRANULAR_LONG_STEPS.has(params.step)) {
    throw new ModularPipelineEntryError();
  }
  if (SEQUENTIAL_CLIENT_STEPS.has(params.step)) {
    throw new ModularPipelineEntryError();
  }
}

/**
 * Re-read `workspace_listing_drafts` and enforce persisted prerequisites (worker execute path).
 */
export async function assertDraftPhasesPersisted(
  supabase: SupabaseClient,
  params: FetchDraftStateParams,
  required: Array<"title" | "short" | "long">,
): Promise<ListingDraftPersistedPhases> {
  const draft = await fetchDraftState(supabase, params);
  const missing = required.filter((phase) => !draft.persistedPhases[phase]);
  if (missing.length > 0) {
    throw new ModularPhaseOrderError(missing, "modular_phase_order_conflict");
  }
  return draft.persistedPhases;
}

export type PipelineStateCheckResult = ModularPhaseOrderCheckResult & {
  persistedPhases: ListingDraftPersistedPhases;
};

/**
 * Read-only gate for producer routes — never throws.
 */
export async function checkPipelineStateForStep(
  supabase: SupabaseClient,
  params: {
    step: ModularPhaseGuardStep;
    queueHash: string;
    isRegenerate?: boolean;
    skipGuard?: boolean;
    draftParams: FetchDraftStateParams;
  },
): Promise<PipelineStateCheckResult> {
  const draft = await fetchDraftState(supabase, params.draftParams);
  const phaseCheck = checkModularPhaseOrder({
    step: params.step,
    persistedPhases: draft.persistedPhases,
    queueHash: params.queueHash,
    isRegenerate: params.isRegenerate,
    skipGuard: params.skipGuard,
  });

  if (!phaseCheck.ok) {
    return { ...phaseCheck, persistedPhases: draft.persistedPhases };
  }

  return { ok: true, persistedPhases: draft.persistedPhases };
}

/**
 * Unified state-machine gate — draft persistence + phase order (worker execute path).
 *
 * Debugging: when a conflict is detected, emits a structured JSON log so that
 * SREs can quickly identify which phases are "persisted" (written to
 * workspace_listing_drafts) vs "transient" (only held in client memory).
 *
 * Phase lifecycle:
 *  - "persisted" = the draft row has the phase marked true (server-side DB)
 *  - "transient" = the phase was generated but not yet flushed to the draft row
 *    (can happen if the client navigated away or if a prior pipeline step failed
 *    before the DB write completed)
 *
 * If this guard fires unexpectedly:
 *  1. Check `workspace_listing_drafts.persisted_phases` for the (workspace, app,
 *     queue_hash) triple — if it shows all phases as true but the guard still
 *     throws, verify that `queueHash` is identical between the producer enqueue
 *     call and the draft row lookup (a stale client hash causes a mismatch).
 *  2. If the draft row is missing entirely, the client called an advanced step
 *     (e.g. "full", "finalize") before the title/short phases completed.
 */
export async function assertPipelineStateForStep(
  supabase: SupabaseClient,
  params: {
    step: ModularPhaseGuardStep;
    queueHash: string;
    isRegenerate?: boolean;
    skipGuard?: boolean;
    draftParams: FetchDraftStateParams;
  },
): Promise<ListingDraftPersistedPhases> {
  const result = await checkPipelineStateForStep(supabase, params);
  if (!result.ok) {
    console.warn(
      JSON.stringify({
        event: "modular_phase_order_conflict",
        step: params.step,
        queueHash: params.queueHash,
        missingPhases: result.missingPhases,
        persistedPhases: result.persistedPhases,
        isRegenerate: params.isRegenerate ?? false,
        skipGuard: params.skipGuard ?? false,
        workspaceId: params.draftParams.workspaceId,
        appId: params.draftParams.appId ?? null,
        hint: "Check workspace_listing_drafts for this (workspaceId, appId, queueHash). " +
          "If the row is missing or persistedPhases is stale, the client sent an " +
          "advanced step before earlier phases were persisted to the DB.",
      }),
    );
    throw new ModularPhaseOrderError(
      result.missingPhases,
      "modular_phase_order_conflict",
    );
  }
  return result.persistedPhases;
}
