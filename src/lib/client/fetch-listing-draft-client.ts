"use client";

import type { ListingDraftPersistState } from "@/lib/listing/listing-draft-persist.types";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

export type { ListingDraftPersistState };

export type FetchListingDraftResult =
  | { ok: true; draft: ListingDraftPersistState }
  | { ok: false; error: string };

/**
 * Load a persisted modular listing draft for workspace + app + queue hash.
 * Always returns a draft object (`isEmpty: true` when nothing is stored).
 */
export async function fetchDraftState(
  workspaceId: string,
  queueHash: string,
  options?: {
    appId?: string;
    vaultLocale?: OptimizationQueueLocale;
  },
): Promise<FetchListingDraftResult> {
  if (!workspaceId.trim() || !queueHash.trim()) {
    return {
      ok: true,
      draft: {
        id: null,
        workspaceId: workspaceId.trim(),
        appId: options?.appId ?? null,
        vaultLocale: options?.vaultLocale ?? "en",
        queueHash: queueHash.trim(),
        modularState: {
          title: { value: "", locked: false },
          shortDescription: { variations: [], selectedIndex: 0 },
          longDescription: { hook: "", features: "", closing: "" },
        },
        editedTitle: "",
        editedShort: "",
        editedLong: "",
        modularDraftReady: false,
        updatedAt: null,
        isEmpty: true,
        persistedPhases: { title: false, short: false, long: false },
      },
    };
  }

  const params = new URLSearchParams({
    workspaceId: workspaceId.trim(),
    queueHash: queueHash.trim(),
  });
  if (options?.appId?.trim()) {
    params.set("appId", options.appId.trim());
  }
  if (options?.vaultLocale) {
    params.set("vaultLocale", options.vaultLocale);
  }

  const res = await fetch(`/api/listings/draft?${params.toString()}`, {
    credentials: "same-origin",
  });

  const json = (await res.json()) as
    | { ok: true; draft: ListingDraftPersistState }
    | { ok: false; error?: { message?: string } };

  if (!res.ok || !json.ok) {
    const message =
      "error" in json && json.error?.message
        ? json.error.message
        : "Could not load listing draft.";
    return { ok: false, error: message };
  }

  return { ok: true, draft: json.draft };
}
