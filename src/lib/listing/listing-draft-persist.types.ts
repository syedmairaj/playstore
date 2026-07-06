import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";

export type ListingDraftPersistedPhases = {
  title: boolean;
  short: boolean;
  long: boolean;
};

/** Canonical draft snapshot — always defined (use `isEmpty` when no DB row). */
export type ListingDraftPersistState = {
  id: string | null;
  workspaceId: string;
  appId: string | null;
  vaultLocale: OptimizationQueueLocale;
  queueHash: string;
  modularState: ModularListingState;
  editedTitle: string;
  editedShort: string;
  editedLong: string;
  modularDraftReady: boolean;
  updatedAt: string | null;
  isEmpty: boolean;
  persistedPhases: ListingDraftPersistedPhases;
};
