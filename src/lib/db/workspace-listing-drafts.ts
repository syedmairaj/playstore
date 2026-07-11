import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { assembleModularFullDescription } from "@/lib/listing/assemble-modular-listing";
import type {
  ModularListingGenerationStep,
  ModularListingState,
  ModularLongStepData,
  ModularShortStepData,
  ModularTitleStepData,
} from "@/lib/listing/modular-listing.types";
import { EMPTY_MODULAR_LISTING_STATE } from "@/lib/listing/modular-listing.types";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type {
  ListingDraftPersistedPhases,
  ListingDraftPersistState,
} from "@/lib/listing/listing-draft-persist.types";
import {
  safeFinalizeOutputFields,
  safeLongStepFields,
  safeShortStepFields,
  safeTitleStepFields,
} from "@/lib/listing/safe-listing-persist-fields";
import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";

export type WorkspaceListingDraftRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  app_id: string | null;
  vault_locale: OptimizationQueueLocale;
  queue_hash: string;
  title: string | null;
  short_description: ModularListingState["shortDescription"] | null;
  long_description: ModularListingState["longDescription"] | null;
  modular_listing: ModularListingState | null;
  /** DB-level phase tracker — written on every upsert; null on legacy rows. */
  persisted_phases: { title: boolean; short: boolean; long: boolean } | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceListingDraftState = ListingDraftPersistState;

export function computePersistedPhases(
  modularState: ModularListingState,
): ListingDraftPersistedPhases {
  return {
    title: Boolean(modularState.title.value.trim()),
    short: modularState.shortDescription.variations.some((v) => v.text.trim()),
    long: Boolean(
      modularState.longDescription.hook.trim() ||
        modularState.longDescription.features.trim() ||
        modularState.longDescription.closing.trim(),
    ),
  };
}

export function createEmptyListingDraftState(params: {
  workspaceId: string;
  appId?: string | null;
  queueHash: string;
  vaultLocale: OptimizationQueueLocale;
}): ListingDraftPersistState {
  return {
    id: null,
    workspaceId: params.workspaceId,
    appId: params.appId ?? null,
    vaultLocale: params.vaultLocale,
    queueHash: params.queueHash,
    modularState: EMPTY_MODULAR_LISTING_STATE,
    editedTitle: "",
    editedShort: "",
    editedLong: "",
    modularDraftReady: false,
    updatedAt: null,
    isEmpty: true,
    persistedPhases: { title: false, short: false, long: false },
  };
}

type DraftPhasePersistParams = {
  workspaceId: string;
  userId: string;
  appId?: string | null;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  step: ModularListingGenerationStep;
  existingModularListing?: ModularListingState | null;
  titleData?: ModularTitleStepData;
  shortData?: ModularShortStepData;
  longData?: ModularLongStepData;
  finalizeOutput?: ListingGenerationOutput;
  modularListing?: ModularListingState;
};

function mergeModularListingState(
  base: ModularListingState,
  params: DraftPhasePersistParams,
): ModularListingState {
  const next: ModularListingState = {
    title: { ...base.title },
    shortDescription: {
      variations: [...base.shortDescription.variations],
      selectedIndex: base.shortDescription.selectedIndex,
    },
    longDescription: { ...base.longDescription },
  };

  if (params.modularListing) {
    return {
      title: { ...params.modularListing.title },
      shortDescription: {
        variations: [...params.modularListing.shortDescription.variations],
        selectedIndex: params.modularListing.shortDescription.selectedIndex,
      },
      longDescription: { ...params.modularListing.longDescription },
    };
  }

  if (params.titleData) {
    const { title } = safeTitleStepFields(params.titleData);
    if (title) {
      next.title = { value: title.slice(0, 30), locked: true };
    }
  }

  if (params.shortData?.variations?.length) {
    const { short_description: shortText } = safeShortStepFields(params.shortData);
    const variations = params.shortData.variations
      .map((variation) => ({
        ...variation,
        text: (variation.text ?? "").trim(),
      }))
      .filter((variation) => variation.text.length > 0);
    next.shortDescription = {
      variations:
        variations.length > 0
          ? variations
          : shortText
            ? [
                { type: "growth" as const, text: shortText },
                { type: "conversion" as const, text: shortText },
                { type: "utility" as const, text: shortText },
              ]
            : [],
      selectedIndex: 2,
    };
  }

  if (params.longData) {
    const longSafe = safeLongStepFields(params.longData);
    next.longDescription = {
      hook: longSafe.hook || (next.longDescription.hook ?? "").trim(),
      features: longSafe.features || (next.longDescription.features ?? "").trim(),
      closing: longSafe.closing || (next.longDescription.closing ?? "").trim(),
    };
  }

  if (params.finalizeOutput) {
    const safe = safeFinalizeOutputFields(params.finalizeOutput);
    if (safe.title) {
      next.title = { value: safe.title.slice(0, 30), locked: true };
    }
    if (safe.short_description) {
      const shortText = normalizeShortVariationText(safe.short_description);
      next.shortDescription = {
        variations: [
          { type: "growth", text: shortText },
          { type: "conversion", text: shortText },
          { type: "utility", text: shortText },
        ],
        selectedIndex: 2,
      };
    }
    if (safe.long_description) {
      next.longDescription = {
        hook: safe.long_description,
        features: "",
        closing: "",
      };
    }
  }

  if (params.step === "hook" && params.longData?.hook != null) {
    next.longDescription.hook = (params.longData.hook ?? "").trim();
  }
  if (params.step === "features" && params.longData?.features != null) {
    next.longDescription.features = (params.longData.features ?? "").trim();
  }
  if (params.step === "closing" && params.longData?.closing != null) {
    next.longDescription.closing = (params.longData.closing ?? "").trim();
  }

  return next;
}

function draftStateFromRow(row: WorkspaceListingDraftRow): WorkspaceListingDraftState | null {
  const modularState =
    row.modular_listing ??
    ({
      title: {
        value: row.title?.trim() ?? "",
        locked: Boolean(row.title?.trim()),
      },
      shortDescription: row.short_description ?? EMPTY_MODULAR_LISTING_STATE.shortDescription,
      longDescription: row.long_description ?? EMPTY_MODULAR_LISTING_STATE.longDescription,
    } satisfies ModularListingState);

  const editedTitle = modularState.title.value;
  const shortRow =
    modularState.shortDescription.variations[
      modularState.shortDescription.selectedIndex
    ];
  const editedShort = shortRow?.text ?? "";
  const editedLong = assembleModularFullDescription(modularState.longDescription);
  const hasContent =
    Boolean(editedTitle.trim()) ||
    modularState.shortDescription.variations.some((v) => v.text.trim()) ||
    Boolean(editedLong.trim());

  if (!hasContent) return null;

  // Prefer the DB column (set atomically on every upsert) over the computed
  // value so the phase guard always reflects what was actually written to the DB.
  // Fall back to computing from modular_listing for legacy rows missing the column.
  const persistedPhases: ListingDraftPersistedPhases =
    row.persisted_phases ?? computePersistedPhases(modularState);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    appId: row.app_id,
    vaultLocale: row.vault_locale,
    queueHash: row.queue_hash,
    modularState,
    editedTitle,
    editedShort,
    editedLong,
    modularDraftReady: hasContent,
    updatedAt: row.updated_at,
    isEmpty: false,
    persistedPhases,
  };
}

export async function fetchDraftStateRow(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    queueHash: string;
    appId?: string | null;
    userId?: string;
    vaultLocale?: OptimizationQueueLocale;
  },
): Promise<WorkspaceListingDraftState | null> {
  let query = supabase
    .from("workspace_listing_drafts")
    .select(
      "id, workspace_id, user_id, app_id, vault_locale, queue_hash, title, short_description, long_description, modular_listing, persisted_phases, created_at, updated_at",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("queue_hash", params.queueHash)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  }
  if (params.appId) {
    query = query.eq("app_id", params.appId);
  }
  if (params.vaultLocale) {
    query = query.eq("vault_locale", params.vaultLocale);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return null;
  }

  return draftStateFromRow(data as WorkspaceListingDraftRow);
}

export type WorkspaceListingDraftUpsertOptions = {
  ignoreDuplicates?: boolean;
};

function isLegacyWorkspaceDraftUniqueViolation(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "23505" &&
    error.message?.includes("workspace_listing_drafts_workspace_id_key") === true
  );
}

/**
 * Upsert a draft row keyed by `(workspace_id, queue_hash)`.
 * Falls back to in-place UPDATE when the DB still has the legacy
 * one-row-per-workspace unique on `workspace_id` alone.
 */
export async function upsertWorkspaceListingDraftRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  options?: WorkspaceListingDraftUpsertOptions,
): Promise<{ ok: true; updatedAt?: string } | { ok: false; message: string }> {
  const workspaceId = String(row.workspace_id ?? "").trim();
  if (!workspaceId) {
    return { ok: false, message: "workspace_id is required" };
  }

  const upsertOpts: { onConflict: string; ignoreDuplicates?: boolean } = {
    onConflict: "workspace_id,queue_hash",
  };
  if (options?.ignoreDuplicates) {
    upsertOpts.ignoreDuplicates = true;
  }

  const upsertQuery = supabase
    .from("workspace_listing_drafts")
    .upsert(row, upsertOpts);

  const { data, error } = options?.ignoreDuplicates
    ? await upsertQuery
    : await upsertQuery.select("updated_at").single();

  if (!error) {
    const updatedAt =
      data && typeof data === "object" && "updated_at" in data
        ? (data.updated_at as string | undefined)
        : undefined;
    return { ok: true, updatedAt };
  }

  if (!isLegacyWorkspaceDraftUniqueViolation(error)) {
    return { ok: false, message: error.message };
  }

  if (options?.ignoreDuplicates) {
    return { ok: true };
  }

  const { data: updated, error: updateError } = await supabase
    .from("workspace_listing_drafts")
    .update(row)
    .eq("workspace_id", workspaceId)
    .select("updated_at")
    .maybeSingle();

  if (updateError) {
    return { ok: false, message: updateError.message };
  }
  if (!updated?.updated_at) {
    return { ok: false, message: "Legacy draft row update matched zero rows" };
  }

  return { ok: true, updatedAt: updated.updated_at as string };
}

/** @deprecated Prefer `fetchDraftState` from `listing-draft-persist.ts` (returns empty state). */
export async function fetchDraftState(
  supabase: SupabaseClient,
  params: { workspaceId: string; queueHash: string; userId?: string },
): Promise<WorkspaceListingDraftState | null> {
  return fetchDraftStateRow(supabase, params);
}

/**
 * Upsert-on-generate: match by workspace + queue_hash, patch the phase column, merge modular_listing.
 */
export async function upsertWorkspaceListingDraftPhase(
  supabase: SupabaseClient,
  params: DraftPhasePersistParams,
): Promise<{ ok: true; updatedAt: string } | { ok: false; message: string }> {
  const existing = await fetchDraftStateRow(supabase, {
    workspaceId: params.workspaceId,
    queueHash: params.queueHash,
    userId: params.userId,
    appId: params.appId,
    vaultLocale: params.vaultLocale,
  });

  const mergedModular = mergeModularListingState(
    existing?.modularState ?? params.existingModularListing ?? EMPTY_MODULAR_LISTING_STATE,
    params,
  );

  let persistedPhases = computePersistedPhases(mergedModular);
  if (params.finalizeOutput) {
    const safe = safeFinalizeOutputFields(params.finalizeOutput);
    persistedPhases = {
      title: persistedPhases.title || Boolean(safe.title),
      short: persistedPhases.short || Boolean(safe.short_description),
      long: persistedPhases.long || Boolean(safe.long_description),
    };
  }

  const row: Record<string, unknown> = {
    workspace_id: params.workspaceId,
    user_id: params.userId,
    app_id: params.appId ?? null,
    vault_locale: params.vaultLocale,
    queue_hash: params.queueHash,
    modular_listing: mergedModular,
    // Always write the computed phase flags so the worker executor can guard
    // the 'full' step without reading modular_listing from the DB separately.
    persisted_phases: persistedPhases,
  };

  if (mergedModular.title.value.trim()) {
    row.title = mergedModular.title.value;
  }
  if (mergedModular.shortDescription.variations.length > 0) {
    row.short_description = mergedModular.shortDescription;
  }
  if (
    mergedModular.longDescription.hook.trim() ||
    mergedModular.longDescription.features.trim() ||
    mergedModular.longDescription.closing.trim()
  ) {
    row.long_description = mergedModular.longDescription;
  }

  const upsert = await upsertWorkspaceListingDraftRow(supabase, row);
  if (!upsert.ok) {
    return { ok: false, message: upsert.message };
  }
  if (!upsert.updatedAt) {
    return { ok: false, message: "Draft upsert failed" };
  }

  return { ok: true, updatedAt: upsert.updatedAt };
}
