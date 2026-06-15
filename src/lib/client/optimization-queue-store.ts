/**
 * Client-side OptimizationQueue store for useSyncExternalStore reactivity.
 * React Query hydrates this store; optimistic mutations patch it immediately.
 *
 * getSnapshot MUST return a referentially stable value between store updates
 * (React compares snapshots with Object.is).
 */

import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
  OptimizationQueueStats,
} from "@/lib/optimization-queue";

export type OptimizationQueueStoreSnapshot = {
  items: OptimizationQueueItem[];
  stats?: OptimizationQueueStats;
  version: number;
};

type StoreEntry = {
  listeners: Set<() => void>;
  /** Cached snapshot — replaced only when store data changes. */
  cachedSnapshot: OptimizationQueueStoreSnapshot;
  /** IDs optimistically removed — ignored on hydrate until server confirms deletion. */
  pendingRemovalIds: Set<string>;
  /** Review insight titles being restored via undo — preserved across stale hydrates. */
  pendingUndoTitles: Set<string>;
};

const stores = new Map<string, StoreEntry>();

/** Keys of stores touched this session — used for cross-appId cache sync. */
export function getOptimizationQueueStoreRegistryKeys(): string[] {
  return [...stores.keys()];
}

/** Singleton for keys with no store entry yet — never allocate per getSnapshot call. */
const EMPTY_SNAPSHOT: OptimizationQueueStoreSnapshot = { items: [], version: 0 };

export function optimizationQueueStoreKey(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
): string {
  return `${workspaceId}:${locale}:${appId ?? ""}`;
}

function createSnapshot(
  items: OptimizationQueueItem[],
  version: number,
  stats?: OptimizationQueueStats,
): OptimizationQueueStoreSnapshot {
  return { items, version, stats };
}

function getOrCreateStore(key: string): StoreEntry {
  let entry = stores.get(key);
  if (!entry) {
    entry = {
      listeners: new Set(),
      cachedSnapshot: createSnapshot([], 0),
      pendingRemovalIds: new Set(),
      pendingUndoTitles: new Set(),
    };
    stores.set(key, entry);
  }
  return entry;
}

function commitSnapshot(
  entry: StoreEntry,
  items: OptimizationQueueItem[],
  stats?: OptimizationQueueStats,
): OptimizationQueueStoreSnapshot {
  const version = entry.cachedSnapshot.version + 1;
  entry.cachedSnapshot = createSnapshot(items, version, stats);
  return entry.cachedSnapshot;
}

function emit(key: string): void {
  const entry = stores.get(key);
  if (!entry) return;
  for (const listener of entry.listeners) {
    listener();
  }
}

function filterPendingRemovals(
  items: OptimizationQueueItem[],
  pendingRemovalIds: Set<string>,
): OptimizationQueueItem[] {
  if (pendingRemovalIds.size === 0) return items;
  return items.filter((item) => !pendingRemovalIds.has(item.id));
}

function reconcilePendingRemovals(
  entry: StoreEntry,
  serverItems: OptimizationQueueItem[],
): void {
  if (entry.pendingRemovalIds.size === 0) return;
  const serverIds = new Set(serverItems.map((item) => item.id));
  for (const id of entry.pendingRemovalIds) {
    if (!serverIds.has(id)) {
      entry.pendingRemovalIds.delete(id);
    }
  }
}

function normalizeReviewTitle(content: string): string {
  return content.trim().toLowerCase();
}

function isReviewInsightQueueItem(item: OptimizationQueueItem): boolean {
  return item.type === "review_pain_point" || item.type === "feature_request";
}

function mergePendingUndoRestores(
  localItems: OptimizationQueueItem[],
  serverItems: OptimizationQueueItem[],
  pendingUndoTitles: Set<string>,
): OptimizationQueueItem[] {
  if (pendingUndoTitles.size === 0) return serverItems;

  const merged = [...serverItems];
  for (const title of pendingUndoTitles) {
    const alreadyPresent = merged.some(
      (item) =>
        isReviewInsightQueueItem(item) &&
        normalizeReviewTitle(item.content) === title,
    );
    if (alreadyPresent) continue;

    const localItem = localItems.find(
      (item) =>
        isReviewInsightQueueItem(item) &&
        normalizeReviewTitle(item.content) === title,
    );
    if (localItem) {
      merged.push(localItem);
    }
  }

  return merged;
}

export function beginQueueUndoRestore(
  key: string,
  normalizedTitle: string,
  itemId?: string,
): void {
  const entry = getOrCreateStore(key);
  entry.pendingUndoTitles.add(normalizedTitle);
  if (itemId) {
    entry.pendingRemovalIds.delete(itemId);
  }
}

export function endQueueUndoRestore(key: string, normalizedTitle: string): void {
  const entry = stores.get(key);
  entry?.pendingUndoTitles.delete(normalizedTitle);
}

export function isQueueUndoRestorePending(key: string, normalizedTitle: string): boolean {
  const entry = stores.get(key);
  return entry?.pendingUndoTitles.has(normalizedTitle) ?? false;
}

export function subscribeOptimizationQueue(
  key: string,
  listener: () => void,
): () => void {
  const entry = getOrCreateStore(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function getOptimizationQueueSnapshot(
  key: string,
): OptimizationQueueStoreSnapshot {
  const entry = stores.get(key);
  return entry?.cachedSnapshot ?? EMPTY_SNAPSHOT;
}

export function hydrateOptimizationQueueStore(
  key: string,
  snapshot: Pick<OptimizationQueueStoreSnapshot, "items" | "stats">,
): void {
  const entry = getOrCreateStore(key);
  reconcilePendingRemovals(entry, snapshot.items);
  let nextItems = filterPendingRemovals(snapshot.items, entry.pendingRemovalIds);
  nextItems = mergePendingUndoRestores(
    entry.cachedSnapshot.items,
    nextItems,
    entry.pendingUndoTitles,
  );
  commitSnapshot(entry, nextItems, snapshot.stats);
  emit(key);
}

export function patchOptimizationQueueStore(
  key: string,
  updater: (prev: OptimizationQueueItem[]) => OptimizationQueueItem[],
): OptimizationQueueStoreSnapshot {
  const entry = getOrCreateStore(key);
  const nextItems = updater(entry.cachedSnapshot.items);
  const snapshot = commitSnapshot(entry, nextItems, entry.cachedSnapshot.stats);
  emit(key);
  return snapshot;
}

/** Optimistically remove one item and tombstone it against stale refetches. */
export function optimisticallyRemoveOptimizationQueueItem(
  key: string,
  itemId: string,
): OptimizationQueueStoreSnapshot {
  const entry = getOrCreateStore(key);
  entry.pendingRemovalIds.add(itemId);
  const nextItems = entry.cachedSnapshot.items.filter((item) => item.id !== itemId);
  const snapshot = commitSnapshot(entry, nextItems, entry.cachedSnapshot.stats);
  emit(key);
  return snapshot;
}

/** Roll back a failed removal — restores snapshot and clears the tombstone. */
export function restoreOptimizationQueueSnapshot(
  key: string,
  snapshot: Pick<OptimizationQueueStoreSnapshot, "items" | "stats">,
): void {
  const entry = getOrCreateStore(key);
  entry.pendingRemovalIds.clear();
  commitSnapshot(entry, snapshot.items, snapshot.stats);
  emit(key);
}

/** Undo an optimistic removal — splices the item back at its prior index. */
export function revertOptimisticQueueRemoval(
  key: string,
  item: OptimizationQueueItem,
  index: number,
): OptimizationQueueStoreSnapshot {
  const entry = getOrCreateStore(key);
  entry.pendingRemovalIds.delete(item.id);
  const items = [...entry.cachedSnapshot.items];
  if (!items.some((row) => row.id === item.id)) {
    const insertAt = Math.min(Math.max(index, 0), items.length);
    items.splice(insertAt, 0, item);
  }
  const snapshot = commitSnapshot(entry, items, entry.cachedSnapshot.stats);
  emit(key);
  return snapshot;
}

export function resetOptimizationQueueStore(key: string): void {
  const entry = stores.get(key);
  if (!entry) return;
  entry.pendingRemovalIds.clear();
  entry.pendingUndoTitles.clear();
  commitSnapshot(entry, [], undefined);
  emit(key);
}
