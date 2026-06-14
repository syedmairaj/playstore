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
};

const stores = new Map<string, StoreEntry>();

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
  commitSnapshot(entry, snapshot.items, snapshot.stats);
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

export function resetOptimizationQueueStore(key: string): void {
  const entry = stores.get(key);
  if (!entry) return;
  commitSnapshot(entry, [], undefined);
  emit(key);
}
