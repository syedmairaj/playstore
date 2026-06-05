/**
 * Unified Staging Vault State Management
 *
 * Provides shared state logic for all modules (Reviews, Competitor Spy, Market Intel,
 * Keyword Tracker, Alerts) to synchronize with the Staging Vault and AI Listing Optimizer.
 *
 * Key Features:
 * - onStageSuccess callback for auto-archive functionality
 * - Real-time Optimizer synchronization via SWR/React Query
 * - Centralized metadata handling across all signal types
 * - RTL/LTR localization support
 */

export type SignalType = "keyword" | "review_issue" | "competitor_weakness" | "optimization_insight";
export type ArchiveReason = "staged" | "dismissed" | "archived";

export interface StagingCallbackPayload {
  signalType: SignalType;
  signalId: string; // Unique identifier for the signal (keyword, issue ID, alert ID, etc.)
  source: string; // "keyword_tracker", "review_analysis", "competitor_spy", "api"
  metadata: Record<string, unknown>;
  language?: string;
}

export interface OnStageSuccessParams {
  payload: StagingCallbackPayload;
  reason: ArchiveReason;
  timestamp: Date;
}

export interface UnifiedStagingStateOptions {
  // Callback fired after successful staging
  onStageSuccess?: (params: OnStageSuccessParams) => Promise<void> | void;
  // Callback for error handling
  onStageError?: (error: Error) => Promise<void> | void;
  // Whether to immediately archive in local UI
  autoArchive?: boolean;
  // Whether to trigger Optimizer sync
  syncOptimizer?: boolean;
  // Custom mutation key for React Query/SWR
  mutationKey?: string[];
}

/**
 * Creates a unified onStageSuccess handler for all modules
 *
 * Usage:
 * ```typescript
 * const handleStageSuccess = createOnStageSuccessHandler({
 *   onStageSuccess: async ({ payload, reason }) => {
 *     // Move item to archive in local state
 *     setItems(prev => prev.filter(item => item.id !== payload.signalId));
 *     setArchived(prev => [...prev, archiveItem]);
 *     // Trigger Optimizer sync
 *     mutate('/api/workspaces/{id}/optimizer/context');
 *   },
 *   autoArchive: true,
 *   syncOptimizer: true,
 * });
 * ```
 */
export function createOnStageSuccessHandler(options: UnifiedStagingStateOptions) {
  return async (params: OnStageSuccessParams) => {
    try {
      // Execute custom callback
      if (options.onStageSuccess) {
        await options.onStageSuccess(params);
      }

      // Log staging event
      console.info("[UnifiedStaging]", {
        signal: params.payload.signalType,
        id: params.payload.signalId,
        reason: params.reason,
        timestamp: params.timestamp.toISOString(),
      });
    } catch (error) {
      console.error("[UnifiedStaging] Error in onStageSuccess:", error);
      if (options.onStageError) {
        await options.onStageError(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  };
}

/**
 * Archive state management hook for modules
 *
 * Provides methods to move items between active and archived states
 */
export interface ArchiveStateManager<T> {
  moveToArchive: (id: string, reason: ArchiveReason) => void;
  moveFromArchive: (id: string) => void;
  getArchivedCount: () => number;
  clearArchive: () => void;
}

export function createArchiveStateManager<T extends { id: string }>(
  activeState: T[],
  setActiveState: (items: T[]) => void,
  archivedState: T[],
  setArchivedState: (items: T[]) => void
): ArchiveStateManager<T> {
  return {
    moveToArchive: (id: string, reason: ArchiveReason) => {
      const itemToArchive = activeState.find((item) => item.id === id);
      if (!itemToArchive) return;

      // Remove from active
      setActiveState(activeState.filter((item) => item.id !== id));

      // Add to archived with metadata
      const archivedItem = {
        ...itemToArchive,
        _archivedAt: new Date().toISOString(),
        _archivedReason: reason,
      } as T & { _archivedAt: string; _archivedReason: ArchiveReason };

      setArchivedState([...archivedState, archivedItem]);
    },

    moveFromArchive: (id: string) => {
      const itemToRestore = archivedState.find((item) => item.id === id);
      if (!itemToRestore) return;

      // Remove archive metadata
      const { _archivedAt, _archivedReason, ...restoredItem } = itemToRestore as any;

      setArchivedState(archivedState.filter((item) => item.id !== id));
      setActiveState([...activeState, restoredItem as T]);
    },

    getArchivedCount: () => archivedState.length,

    clearArchive: () => {
      setArchivedState([]);
    },
  };
}

/**
 * Optimizer synchronization hook
 *
 * Handles real-time updates to AI Listing Optimizer when items are staged
 */
export interface OptimizerSyncOptions {
  workspaceId: string;
  mutate?: (key: string | string[]) => Promise<any>;
  onSyncSuccess?: () => void;
  onSyncError?: (error: Error) => void;
}

export async function triggerOptimizerSync(options: OptimizerSyncOptions) {
  try {
    // If using SWR
    if (options.mutate) {
      const mutationKey = `/api/workspaces/${options.workspaceId}/optimizer/context`;
      await options.mutate(mutationKey);
    }

    // Fallback: Trigger a revalidation via API
    const response = await fetch(
      `/api/workspaces/${options.workspaceId}/optimizer/sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    options.onSyncSuccess?.();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    options.onSyncError?.(err);
    throw err;
  }
}

/**
 * Metadata builder for different signal types
 *
 * Ensures consistent metadata structure across all modules
 */
export interface MetadataBuilderOptions {
  signalType: SignalType;
  language?: string;
  customFields?: Record<string, unknown>;
}

export function buildStagingMetadata(
  options: MetadataBuilderOptions
): Record<string, unknown> {
  const baseMetadata: Record<string, unknown> = {
    stagedAt: new Date().toISOString(),
    language: options.language || "en",
    signalType: options.signalType,
  };

  // Merge custom fields
  return {
    ...baseMetadata,
    ...options.customFields,
  };
}

/**
 * Localization helper for staging UI messages
 */
export const STAGING_UI_MESSAGES = {
  en: {
    moving_to_archive: "Moving to optimization history...",
    moved_to_archive: "Moved to optimization history",
    restore: "Restore",
    restored: "Restored to active view",
    clear_archive: "Clear all",
    archive_cleared: "Archive cleared",
    stage_success: "Staged to vault",
    stage_error: "Failed to stage",
    sync_optimizer: "Syncing with optimizer...",
    sync_success: "Optimizer updated",
    sync_error: "Failed to sync optimizer",
  },
  ar: {
    moving_to_archive: "جاري النقل إلى السجل...",
    moved_to_archive: "تم النقل إلى السجل",
    restore: "استعادة",
    restored: "تم الاستعادة إلى العرض النشط",
    clear_archive: "حذف الكل",
    archive_cleared: "تم حذف السجل",
    stage_success: "تمت الإضافة إلى الخزنة",
    stage_error: "فشل الإضافة إلى الخزنة",
    sync_optimizer: "جاري المزامنة مع المحسّن...",
    sync_success: "تم تحديث المحسّن",
    sync_error: "فشلت المزامنة مع المحسّن",
  },
} as const;

export function getLocaleMessage(
  locale: string,
  messageKey: keyof typeof STAGING_UI_MESSAGES["en"]
): string {
  const messages =
    locale === "ar" ? STAGING_UI_MESSAGES.ar : STAGING_UI_MESSAGES.en;
  return messages[messageKey];
}

/**
 * State transition helpers
 */
export interface StateTransition<T> {
  from: "active" | "archived" | "staging";
  to: "active" | "archived" | "staging";
  id: string;
  item: T;
  timestamp: Date;
  reason?: string;
}

export class StagingStateTransitionManager<T extends { id: string }> {
  private transitions: StateTransition<T>[] = [];
  private maxHistorySize = 100;

  recordTransition(transition: StateTransition<T>) {
    this.transitions.push(transition);
    if (this.transitions.length > this.maxHistorySize) {
      this.transitions.shift();
    }
  }

  getHistory(): StateTransition<T>[] {
    return [...this.transitions];
  }

  getItemHistory(id: string): StateTransition<T>[] {
    return this.transitions.filter((t) => t.id === id);
  }

  canRollback(): boolean {
    return this.transitions.length > 0;
  }

  rollbackLast(): StateTransition<T> | null {
    return this.transitions.pop() || null;
  }
}
