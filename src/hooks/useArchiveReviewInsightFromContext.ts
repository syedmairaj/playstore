"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import { OPTIMIZATION_QUEUE_KEY } from "@/lib/client/optimization-queue-client";
import {
  beginQueueUndoRestore,
  endQueueUndoRestore,
  getOptimizationQueueSnapshot,
  optimizationQueueStoreKey,
  optimisticallyRemoveOptimizationQueueItem,
  patchOptimizationQueueStore,
  restoreOptimizationQueueSnapshot,
  revertOptimisticQueueRemoval,
} from "@/lib/client/optimization-queue-store";
import {
  archiveReviewFromActiveClient,
  restoreStagedReviewClient,
} from "@/lib/client/review-insight-staging";
import {
  ACTIVE_CONTEXT_ARCHIVE_DURATION_MS,
  ACTIVE_CONTEXT_TOAST_CLASS_NAMES,
  ACTIVE_CONTEXT_TOAST_POSITION,
} from "@/lib/client/active-context-toast";

type ArchiveSession = {
  undone: boolean;
  backlogId?: string;
};

type QueueQueryData = {
  items: OptimizationQueueItem[];
  stats?: unknown;
};

function resolveQueueItemForArchive(
  storeKey: string,
  queueKey: ReturnType<typeof OPTIMIZATION_QUEUE_KEY>,
  itemId: string,
  queryClient: ReturnType<typeof useQueryClient>,
): { item: OptimizationQueueItem; index: number } | null {
  const snapshot = getOptimizationQueueSnapshot(storeKey);
  let items = snapshot.items;

  if (!items.some((row) => row.id === itemId)) {
    const cached = queryClient.getQueryData<QueueQueryData>(queueKey);
    if (cached?.items?.length) {
      items = cached.items;
    }
  }

  const index = items.findIndex((row) => row.id === itemId);
  if (index === -1) return null;
  return { item: items[index]!, index };
}

function buildFallbackReviewQueueItem(
  itemId: string,
  title: string,
  locale: "en" | "ar",
): OptimizationQueueItem {
  return {
    id: itemId,
    type: "review_pain_point",
    category: "review",
    content: title.trim() || "Review insight",
    source: "review_analysis",
    sourceContext: "common_issues_theme",
    language: locale,
    stagedAt: new Date().toISOString(),
    metadata: { explicitly_staged: true },
  };
}

function archivableType(
  item: OptimizationQueueItem,
): "review_pain_point" | "feature_request" {
  return item.type === "feature_request" ? "feature_request" : "review_pain_point";
}

export function useArchiveReviewInsightFromContext(options: {
  workspaceId: string;
  locale: "en" | "ar";
  selectedAppId: string;
  onArchived?: () => void;
  refreshOptimizerContext: () => void;
  refetchReviewDerived: () => void;
  refetchOptimizationQueue: () => void;
}) {
  const {
    workspaceId,
    locale,
    selectedAppId,
    onArchived,
    refreshOptimizerContext,
    refetchReviewDerived,
    refetchOptimizationQueue,
  } = options;

  const t = useTranslations("optimizer.reviewInsights");
  const queryClient = useQueryClient();
  const archiveSessionsRef = useRef<Map<string, ArchiveSession>>(new Map());
  const undoneArchiveIdsRef = useRef<Set<string>>(new Set());
  const undoneArchiveTitlesRef = useRef<Set<string>>(new Set());
  const inFlightArchiveIdsRef = useRef<Set<string>>(new Set());
  const finalizeUndoInFlightRef = useRef<Set<string>>(new Set());

  const isArchiveUndone = useCallback((itemId: string, title?: string) => {
    if (undoneArchiveIdsRef.current.has(itemId)) return true;
    const normTitle = title ? normalizeInsightContent(title) : "";
    return normTitle ? undoneArchiveTitlesRef.current.has(normTitle) : false;
  }, []);

  const markArchiveUndone = useCallback((itemId: string, title: string) => {
    undoneArchiveIdsRef.current.add(itemId);
    undoneArchiveTitlesRef.current.add(normalizeInsightContent(title));
  }, []);

  const clearUndoneArchive = useCallback((itemId: string, title?: string) => {
    undoneArchiveIdsRef.current.delete(itemId);
    if (title) {
      undoneArchiveTitlesRef.current.delete(normalizeInsightContent(title));
    }
    archiveSessionsRef.current.delete(itemId);
  }, []);

  const restoreQueueItemAtIndex = useCallback(
    (
      storeKey: string,
      queueKey: ReturnType<typeof OPTIMIZATION_QUEUE_KEY>,
      item: OptimizationQueueItem,
      index: number,
    ) => {
      revertOptimisticQueueRemoval(storeKey, item, index);
      queryClient.setQueryData<QueueQueryData>(queueKey, (prev) => {
        if (!prev) return prev;
        if (prev.items.some((row) => row.id === item.id)) return prev;
        const items = [...prev.items];
        const insertAt = Math.min(Math.max(index, 0), items.length);
        items.splice(insertAt, 0, item);
        return { ...prev, items };
      });
    },
    [queryClient],
  );

  const finalizeUndoOnServer = useCallback(
    async (
      itemId: string,
      backlogId: string,
      originalItem: OptimizationQueueItem,
      insertIndex: number,
    ) => {
      if (finalizeUndoInFlightRef.current.has(itemId)) return true;

      const appId = selectedAppId.trim() || undefined;
      const storeKey = optimizationQueueStoreKey(workspaceId, locale, appId);
      const queueKey = OPTIMIZATION_QUEUE_KEY(workspaceId, locale, appId);
      const normTitle = normalizeInsightContent(originalItem.content);

      finalizeUndoInFlightRef.current.add(itemId);
      beginQueueUndoRestore(storeKey, normTitle, itemId);

      const snapshot = getOptimizationQueueSnapshot(storeKey);
      const hasLocalRestore = snapshot.items.some(
        (row) =>
          isReviewInsightItem(row) && normalizeInsightContent(row.content) === normTitle,
      );
      if (!hasLocalRestore) {
        restoreQueueItemAtIndex(storeKey, queueKey, originalItem, insertIndex);
      }

      try {
        const result = await restoreStagedReviewClient(workspaceId, backlogId, {
          locale,
          appId,
          dispatchEvent: false,
        });
        if (!result.ok) {
          toast.error(t("archiveUndoFailed"), { position: ACTIVE_CONTEXT_TOAST_POSITION });
          return false;
        }

        if (result.queueItemId && result.title) {
          reconcileQueueAfterUndo(
            storeKey,
            queueKey,
            queryClient,
            originalItem,
            result.queueItemId,
            result.title,
            insertIndex,
          );
        }

        clearUndoneArchive(itemId, originalItem.content);
        return true;
      } finally {
        endQueueUndoRestore(storeKey, normTitle);
        finalizeUndoInFlightRef.current.delete(itemId);
      }
    },
    [
      workspaceId,
      locale,
      selectedAppId,
      t,
      queryClient,
      restoreQueueItemAtIndex,
      clearUndoneArchive,
    ],
  );

  const runUndo = useCallback(
    (
      itemId: string,
      toastId: string | number,
      session: ArchiveSession,
      storeKey: string,
      queueKey: ReturnType<typeof OPTIMIZATION_QUEUE_KEY>,
      item: OptimizationQueueItem,
      insertIndex: number,
    ) => {
      toast.dismiss(toastId);
      session.undone = true;
      markArchiveUndone(itemId, item.content);

      const normTitle = normalizeInsightContent(item.content);
      beginQueueUndoRestore(storeKey, normTitle, itemId);

      if (!session.backlogId) {
        restoreQueueItemAtIndex(storeKey, queueKey, item, insertIndex);
        return;
      }

      void finalizeUndoOnServer(itemId, session.backlogId, item, insertIndex);
    },
    [markArchiveUndone, restoreQueueItemAtIndex, finalizeUndoOnServer],
  );

  const archiveReviewInsight = useCallback(
    async (itemId: string, title: string, queueItem?: OptimizationQueueItem) => {
      if (inFlightArchiveIdsRef.current.has(itemId)) return;

      const appId = selectedAppId.trim() || undefined;
      const storeKey = optimizationQueueStoreKey(workspaceId, locale, appId);
      const queueKey = OPTIMIZATION_QUEUE_KEY(workspaceId, locale, appId);
      const previousSnapshot = getOptimizationQueueSnapshot(storeKey);
      const previousQuery = queryClient.getQueryData<QueueQueryData>(queueKey);

      const resolved =
        resolveQueueItemForArchive(storeKey, queueKey, itemId, queryClient) ??
        (queueItem ? { item: queueItem, index: -1 } : null);

      const itemIndex = resolved?.index ?? -1;
      const item =
        resolved?.item ??
        buildFallbackReviewQueueItem(itemId, title, locale);
      const insertIndex = itemIndex >= 0 ? itemIndex : previousSnapshot.items.length;

      const session: ArchiveSession = { undone: false };
      archiveSessionsRef.current.set(itemId, session);
      inFlightArchiveIdsRef.current.add(itemId);

      optimisticallyRemoveOptimizationQueueItem(storeKey, itemId);
      queryClient.setQueryData<QueueQueryData>(queueKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((row) => row.id !== itemId),
        };
      });

      const archivedMessage = t("archivedToast");
      const undoLabel = t("archiveUndo");

      const toastId = toast.success(archivedMessage, {
        id: `review-insight-archived-${itemId}`,
        duration: ACTIVE_CONTEXT_ARCHIVE_DURATION_MS,
        position: ACTIVE_CONTEXT_TOAST_POSITION,
        classNames: ACTIVE_CONTEXT_TOAST_CLASS_NAMES,
        action: {
          label: undoLabel,
          onClick: () => {
            runUndo(itemId, toastId, session, storeKey, queueKey, item, insertIndex);
          },
        },
      });

      try {
        const result = await archiveReviewFromActiveClient(workspaceId, item.id, {
          locale,
          appId,
          title: item.content,
          content: item.content,
          type: archivableType(item),
          metadata: item.metadata,
          dispatchEvents: !session.undone,
        });

        if (!result.ok) {
          toast.dismiss(toastId);
          archiveSessionsRef.current.delete(itemId);

          if (session.undone) {
            endQueueUndoRestore(storeKey, normalizeInsightContent(item.content));
          } else {
            restoreOptimizationQueueSnapshot(storeKey, {
              items: previousSnapshot.items,
              stats: previousSnapshot.stats,
            });
            if (previousQuery) {
              queryClient.setQueryData(queueKey, previousQuery);
            }
            toast.error(result.error ?? t("archiveFailed"), {
              position: ACTIVE_CONTEXT_TOAST_POSITION,
            });
          }
          return;
        }

        session.backlogId = result.backlogId;

        if (session.undone) {
          toast.dismiss(toastId);
          if (result.backlogId && !finalizeUndoInFlightRef.current.has(itemId)) {
            await finalizeUndoOnServer(itemId, result.backlogId, item, insertIndex);
          }
          return;
        }

        onArchived?.();
        void refreshOptimizerContext();
        void refetchReviewDerived();
      } catch {
        toast.dismiss(toastId);
        archiveSessionsRef.current.delete(itemId);

        if (session.undone) {
          endQueueUndoRestore(storeKey, normalizeInsightContent(item.content));
        } else {
          restoreOptimizationQueueSnapshot(storeKey, {
            items: previousSnapshot.items,
            stats: previousSnapshot.stats,
          });
          if (previousQuery) {
            queryClient.setQueryData(queueKey, previousQuery);
          }
          toast.error(t("archiveFailed"), { position: ACTIVE_CONTEXT_TOAST_POSITION });
        }
      } finally {
        inFlightArchiveIdsRef.current.delete(itemId);
      }
    },
    [
      workspaceId,
      locale,
      selectedAppId,
      t,
      queryClient,
      runUndo,
      finalizeUndoOnServer,
      onArchived,
      refreshOptimizerContext,
      refetchReviewDerived,
    ],
  );

  return {
    archiveReviewInsight,
    isArchiveUndone,
    clearUndoneArchive,
  };
}

function isReviewInsightItem(item: OptimizationQueueItem): boolean {
  return item.type === "review_pain_point" || item.type === "feature_request";
}

function normalizeInsightContent(content: string): string {
  return content.trim().toLowerCase();
}

/** Collapse undo duplicates — update in place so chip order does not flicker. */
function reconcileQueueAfterUndo(
  storeKey: string,
  queueKey: ReturnType<typeof OPTIMIZATION_QUEUE_KEY>,
  queryClient: ReturnType<typeof useQueryClient>,
  originalItem: OptimizationQueueItem,
  serverItemId: string,
  serverTitle: string,
  insertIndex: number,
): void {
  const normTitle = normalizeInsightContent(serverTitle);
  const restoredItem: OptimizationQueueItem = {
    ...originalItem,
    id: serverItemId,
    content: serverTitle,
    type: archivableType(originalItem),
  };

  patchOptimizationQueueStore(storeKey, (prev) => {
    const existingIdx = prev.findIndex(
      (row) =>
        row.id === serverItemId ||
        row.id === originalItem.id ||
        (isReviewInsightItem(row) && normalizeInsightContent(row.content) === normTitle),
    );

    const withoutOtherDupes = prev.filter((row, idx) => {
      if (!isReviewInsightItem(row)) return true;
      if (normalizeInsightContent(row.content) !== normTitle) return true;
      return idx === existingIdx;
    });

    if (existingIdx >= 0) {
      const items = [...withoutOtherDupes];
      const slot = items.findIndex(
        (row) =>
          row.id === serverItemId ||
          row.id === originalItem.id ||
          (isReviewInsightItem(row) && normalizeInsightContent(row.content) === normTitle),
      );
      if (slot >= 0) {
        items[slot] = restoredItem;
        return items;
      }
    }

    const items = [...withoutOtherDupes];
    const insertAt = Math.min(Math.max(insertIndex, 0), items.length);
    items.splice(insertAt, 0, restoredItem);
    return items;
  });

  const snapshot = getOptimizationQueueSnapshot(storeKey);
  queryClient.setQueryData<QueueQueryData>(queueKey, (prev) =>
    prev ? { ...prev, items: snapshot.items } : prev,
  );
}
