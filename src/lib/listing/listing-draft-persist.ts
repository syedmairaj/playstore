import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import {
  computePersistedPhases,
  createEmptyListingDraftState,
  fetchDraftStateRow,
  upsertWorkspaceListingDraftPhase,
} from "@/lib/db/workspace-listing-drafts";
import type {
  ModularListingGenerationStep,
  ModularListingState,
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import type { ListingModularGenerateBody } from "@/lib/validation/listing-modular-generate-body";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ListingPersistenceContext } from "@/lib/listing/listing-persistence-context";
import type { ListingDraftPersistState } from "@/lib/listing/listing-draft-persist.types";
import {
  safeFinalizeOutputFields,
  safeListingPhaseFields,
  safeLongStepFields,
  safeShortStepFields,
  safeTitleStepFields,
} from "@/lib/listing/safe-listing-persist-fields";

export type { ListingDraftPersistState, ListingDraftPersistedPhases } from "@/lib/listing/listing-draft-persist.types";

export type DraftPersistPhase = Extract<
  ModularListingGenerationStep,
  "title" | "short" | "long" | "hook" | "features" | "closing" | "finalize"
>;

export type FetchDraftStateParams = {
  workspaceId: string;
  appId?: string | null;
  queueHash: string;
  userId?: string;
  vaultLocale?: OptimizationQueueLocale;
};

export type SaveDraftPhaseParams = {
  workspaceId: string;
  userId: string;
  appId?: string | null;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  phase: DraftPersistPhase;
  existingModularListing?: ModularListingState | null;
  titleData?: ModularTitleStepData;
  shortData?: ModularShortStepData;
  longData?: ModularLongStepData;
  finalizeOutput?: ListingGenerationOutput;
  modularListing?: ModularListingState;
};

type PersistDraftArgs = {
  supabase: SupabaseClient;
  persistence: ListingPersistenceContext;
  body: ListingModularGenerateBody;
  step: ModularListingGenerationStep;
  titleData?: ModularTitleStepData;
  shortData?: ModularShortStepData;
  longData?: ModularLongStepData;
  finalizeOutput?: ListingGenerationOutput;
};

function logPersistenceAudit(queueHash: string, draft: ListingDraftPersistState): void {
  if (draft.isEmpty) return;
  console.log("[Persistence Audit] Draft rehydrated from DB for queueHash:", queueHash);
}

/**
 * Load draft for workspace + app + queue hash. Returns an empty state object when no row exists.
 */
export async function fetchDraftState(
  supabase: SupabaseClient,
  params: FetchDraftStateParams,
): Promise<ListingDraftPersistState> {
  const queueHash = params.queueHash.trim();
  const vaultLocale = params.vaultLocale ?? "en";

  if (!params.workspaceId.trim() || !queueHash) {
    return createEmptyListingDraftState({
      workspaceId: params.workspaceId,
      appId: params.appId,
      queueHash,
      vaultLocale,
    });
  }

  const row = await fetchDraftStateRow(supabase, {
    workspaceId: params.workspaceId,
    queueHash,
    appId: params.appId,
    userId: params.userId,
    vaultLocale: params.vaultLocale,
  });

  if (!row) {
    return createEmptyListingDraftState({
      workspaceId: params.workspaceId,
      appId: params.appId,
      queueHash,
      vaultLocale,
    });
  }

  logPersistenceAudit(queueHash, row);
  return row;
}

function phaseToStep(phase: DraftPersistPhase): ModularListingGenerationStep {
  return phase;
}

function sanitizePhasePayload(params: SaveDraftPhaseParams): SaveDraftPhaseParams {
  const next = { ...params };

  if (next.titleData) {
    const safe = safeTitleStepFields(next.titleData);
    next.titleData = {
      ...next.titleData,
      title: safe.title,
      lockedKeywords: (next.titleData.lockedKeywords ?? [])
        .map((k) => k.trim())
        .filter(Boolean),
    };
  }

  if (next.shortData) {
    const safe = safeShortStepFields(next.shortData);
    next.shortData = {
      variations: (next.shortData.variations ?? [])
        .map((v) => ({ ...v, text: (v.text ?? "").trim() }))
        .filter((v) => v.text.length > 0),
    };
    if (next.shortData.variations.length === 0 && safe.short_description) {
      next.shortData = {
        variations: [
          { type: "growth", text: safe.short_description },
          { type: "conversion", text: safe.short_description },
          { type: "utility", text: safe.short_description },
        ],
      };
    }
  }

  if (next.longData) {
    const safe = safeLongStepFields(next.longData);
    next.longData = {
      hook: safe.hook,
      features: safe.features,
      closing: safe.closing,
    };
  }

  if (next.finalizeOutput) {
    const safe = safeFinalizeOutputFields(next.finalizeOutput);
    next.finalizeOutput = {
      ...next.finalizeOutput,
      title: safe.title,
      shortDescription: safe.short_description,
      fullDescription: safe.long_description,
    };
  }

  if (next.modularListing) {
    const safe = safeListingPhaseFields({
      title: next.modularListing.title.value,
      shortDescription: next.modularListing.shortDescription.variations[0]?.text,
      fullDescription: [
        next.modularListing.longDescription.hook,
        next.modularListing.longDescription.features,
        next.modularListing.longDescription.closing,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (safe.title) {
      next.modularListing = {
        ...next.modularListing,
        title: { value: safe.title.slice(0, 30), locked: true },
      };
    }
  }

  return next;
}

/**
 * Atomic phase-wise UPSERT — merges into existing draft without wiping other phases.
 */
export async function saveDraftPhase(
  supabase: SupabaseClient,
  params: SaveDraftPhaseParams,
): Promise<{ ok: true; updatedAt: string } | { ok: false; message?: string }> {
  const queueHash = params.queueHash.trim();
  if (!queueHash) return { ok: false, message: "queueHash required" };

  const sanitized = sanitizePhasePayload(params);
  const step = phaseToStep(sanitized.phase);

  const result = await upsertWorkspaceListingDraftPhase(supabase, {
    workspaceId: sanitized.workspaceId,
    userId: sanitized.userId,
    appId: sanitized.appId,
    vaultLocale: sanitized.vaultLocale,
    queueHash,
    step,
    existingModularListing: sanitized.existingModularListing,
    titleData: sanitized.titleData,
    shortData: sanitized.shortData,
    longData: sanitized.longData,
    finalizeOutput: sanitized.finalizeOutput,
    modularListing: sanitized.modularListing,
  });

  if (result.ok) {
    console.log(
      JSON.stringify({
        event: "listing_draft_phase_saved",
        phase: sanitized.phase,
        workspaceId: sanitized.workspaceId,
        queueHash,
      }),
    );
  }

  return result;
}

/** Merge DB draft with request payload — request wins only on non-empty fields. */
export function mergeModularListingBaseline(
  fromDraft: ModularListingState,
  incoming?: ModularListingState | null,
): ModularListingState {
  if (!incoming) return fromDraft;

  return {
    title: incoming.title.value.trim() ? incoming.title : fromDraft.title,
    shortDescription: incoming.shortDescription.variations.some((v) => v.text.trim())
      ? incoming.shortDescription
      : fromDraft.shortDescription,
    longDescription: {
      hook: incoming.longDescription.hook.trim() || fromDraft.longDescription.hook,
      features:
        incoming.longDescription.features.trim() || fromDraft.longDescription.features,
      closing:
        incoming.longDescription.closing.trim() || fromDraft.longDescription.closing,
    },
  };
}

/**
 * Ensures workspace_listing_drafts.persisted_phases reflects a complete client
 * modular state before finalize/full producer checks. Instant-draft and legacy
 * draft rows may have copy in modular_listing but stale phase flags.
 */
export async function ensureModularListingDraftPersisted(
  supabase: SupabaseClient,
  params: FetchDraftStateParams & {
    userId: string;
    modularListing: ModularListingState;
  },
): Promise<
  { ok: true; persistedPhases: ListingDraftPersistedPhases } | { ok: false }
> {
  const queueHash = params.queueHash.trim();
  const vaultLocale = params.vaultLocale ?? "en";
  if (!params.workspaceId.trim() || !queueHash) {
    return { ok: false };
  }

  const computed = computePersistedPhases(params.modularListing);
  if (!computed.title || !computed.short || !computed.long) {
    return { ok: false };
  }

  const existing = await fetchDraftState(supabase, {
    workspaceId: params.workspaceId,
    queueHash,
    appId: params.appId,
    userId: params.userId,
    vaultLocale,
  });

  if (
    existing.persistedPhases.title &&
    existing.persistedPhases.short &&
    existing.persistedPhases.long
  ) {
    return { ok: true, persistedPhases: existing.persistedPhases };
  }

  const saved = await upsertWorkspaceListingDraftPhase(supabase, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    appId: params.appId ?? null,
    vaultLocale,
    queueHash,
    step: "long",
    modularListing: params.modularListing,
  });

  if (!saved.ok) {
    console.warn(
      JSON.stringify({
        event: "ensure_modular_listing_draft_persist_failed",
        workspaceId: params.workspaceId,
        queueHash,
        message: saved.message,
      }),
    );
    return { ok: false };
  }

  console.log(
    JSON.stringify({
      event: "ensure_modular_listing_draft_persisted",
      workspaceId: params.workspaceId,
      queueHash,
      persistedPhases: computed,
    }),
  );

  return { ok: true, persistedPhases: computed };
}

/** Best-effort upsert of modular phase output keyed by queue_hash. Never throws. */
export async function persistListingDraftOnGenerate(
  args: PersistDraftArgs,
): Promise<{ ok: true; updatedAt: string } | { ok: false }> {
  const queueHash = args.body.queueHash?.trim();
  if (!queueHash) return { ok: false };

  try {
    const step = args.step;
    const phase =
      step === "full"
        ? ("finalize" as const)
        : (step as DraftPersistPhase);

    const result = await saveDraftPhase(args.supabase, {
      workspaceId: args.persistence.workspaceId,
      userId: args.persistence.userId,
      appId: args.persistence.appId,
      vaultLocale: args.body.vaultLocale,
      queueHash,
      phase,
      existingModularListing: args.body.modularListing,
      titleData: args.titleData
        ? { ...args.titleData, title: safeTitleStepFields(args.titleData).title }
        : undefined,
      shortData: args.shortData,
      longData: args.longData,
      finalizeOutput: args.finalizeOutput,
      modularListing: args.body.modularListing,
    });

    if (!result.ok) {
      console.warn(
        JSON.stringify({
          event: "workspace_listing_draft_upsert_failed",
          workspaceId: args.persistence.workspaceId,
          queueHash,
          step: args.step,
          message: result.message ?? "unknown",
        }),
      );
      return { ok: false };
    }

    return { ok: true, updatedAt: result.updatedAt };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "workspace_listing_draft_upsert_error",
        workspaceId: args.persistence.workspaceId,
        queueHash,
        step: args.step,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false };
  }
}
