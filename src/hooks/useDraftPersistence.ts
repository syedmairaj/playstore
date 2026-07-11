"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const DRAFT_VERSION = 1 as const;

export type DraftPersistenceEnvelope<T> = {
  version: typeof DRAFT_VERSION;
  savedAt: string;
  payload: T;
};

export type UseDraftPersistenceOptions<T> = {
  workspaceId: string;
  /** When set, drafts are isolated per workspace app (multi-app ASO). */
  appId?: string;
  storageKey: string;
  payload: T | null;
  enabled?: boolean;
  onRestore: (payload: T, savedAt: string) => void;
};

export type UseDraftPersistenceResult = {
  restoredFromStorage: boolean;
  clearDraft: () => void;
};

function buildStorageKey(
  workspaceId: string,
  storageKey: string,
  appId?: string,
): string {
  const aid = appId?.trim();
  if (aid) {
    return `listing-modular-draft:${workspaceId}:${aid}:${storageKey}`;
  }
  return `listing-modular-draft:${workspaceId}:${storageKey}`;
}

/** Remove persisted modular draft for one app (or legacy workspace-wide key when appId omitted). */
export function clearModularDraftStorage(
  workspaceId: string,
  storageKey: string,
  appId?: string,
): void {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(buildStorageKey(workspaceId, storageKey, appId));
    if (appId?.trim()) {
      localStorage.removeItem(buildStorageKey(workspaceId, storageKey));
    }
  } catch {
    // ignore
  }
}

/** Read savedAt from localStorage before effects run — avoids hydration races on F5. */
export function readModularDraftSavedAtMs(
  workspaceId: string,
  storageKey: string,
  appId?: string,
): number {
  if (!workspaceId || typeof window === "undefined") return 0;
  try {
    const raw =
      localStorage.getItem(buildStorageKey(workspaceId, storageKey, appId)) ??
      (appId?.trim()
        ? null
        : localStorage.getItem(buildStorageKey(workspaceId, storageKey)));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as DraftPersistenceEnvelope<unknown>;
    if (parsed?.version !== DRAFT_VERSION || !parsed.payload) return 0;
    const ts = Date.parse(parsed.savedAt ?? "");
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

export function useDraftPersistence<T>({
  workspaceId,
  appId,
  storageKey,
  payload,
  enabled = true,
  onRestore,
}: UseDraftPersistenceOptions<T>): UseDraftPersistenceResult {
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const resolvedAppId = appId?.trim() ?? "";

  useLayoutEffect(() => {
    if (!enabled || !workspaceId) return;
    setRestoredFromStorage(false);

    try {
      const raw = localStorage.getItem(
        buildStorageKey(workspaceId, storageKey, resolvedAppId || undefined),
      );
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftPersistenceEnvelope<T>;
      if (parsed?.version !== DRAFT_VERSION || !parsed.payload) return;
      onRestoreRef.current(parsed.payload, parsed.savedAt ?? new Date().toISOString());
      setRestoredFromStorage(true);
    } catch {
      // Ignore corrupt drafts
    }
  }, [enabled, workspaceId, storageKey, resolvedAppId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !payload) return;
    try {
      const envelope: DraftPersistenceEnvelope<T> = {
        version: DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        payload,
      };
      localStorage.setItem(
        buildStorageKey(workspaceId, storageKey, resolvedAppId || undefined),
        JSON.stringify(envelope),
      );
    } catch {
      // Quota exceeded — non-fatal
    }
  }, [enabled, workspaceId, storageKey, resolvedAppId, payload]);

  const clearDraft = useCallback(() => {
    if (!workspaceId) return;
    clearModularDraftStorage(workspaceId, storageKey, resolvedAppId || undefined);
  }, [workspaceId, storageKey, resolvedAppId]);

  return {
    restoredFromStorage,
    clearDraft,
  };
}
