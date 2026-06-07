/**
 * useStagingWorkflow Hook
 *
 * Manages the complete staging and archiving workflow for issues.
 * Handles:
 * - Staging signals to vault
 * - Archiving signals (soft delete)
 * - Restoring archived signals
 * - Permanent deletion
 * - Toast notifications with undo
 * - Optimistic UI updates
 */

"use client";

import { useCallback, useState } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import type { ArchivedSignal } from "@/components/reviews/ArchiveCard";

export interface StagingWorkflowOptions {
  workspaceId: string;
  onSuccess?: (action: "stage" | "archive" | "restore" | "delete") => void;
  onError?: (error: Error) => void;
}

interface StageActionContext {
  issueId: string;
  issueName: string;
  wasStagedAt?: string;
}

export function useStagingWorkflow(options: StagingWorkflowOptions) {
  const { workspaceId, onSuccess, onError } = options;
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [stagingIds, setStagingIds] = useState<Set<string>>(new Set());
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());

  // ── Stage Signal ──────────────────────────────────────────────────────
  const stageSignal = useCallback(
    async (context: StageActionContext) => {
      const { issueId, issueName } = context;
      setStagingIds((prev) => new Set(prev).add(issueId));

      let toastId: string | number | undefined;
      const stagingStartTime = new Date().toISOString();

      try {
        // Stage to vault API
        const response = await fetch(
          `/api/workspaces/${workspaceId}/staging/add`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              signalType: "review_issue",
              content: issueName,
              source: "review_analysis",
              sourceContext: "common_issues_theme",
              sourceContextId: issueId,
              language: locale === "ar" ? "ar" : "en",
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Failed to stage issue");
        }

        const data = await response.json();

        // Show success toast with undo
        toastId = toast.success(
          isRtl
            ? `تم إضافة "${issueName}" إلى محسّن القوائم`
            : `Issue "${issueName}" staged to Listing Optimizer`,
          {
            duration: 5000,
            action: {
              label: isRtl ? "تراجع" : "Undo",
              onClick: async () => {
                // Revert the stage
                await revertStage({
                  signalId: data.data?.id,
                  issueName,
                  stagedAt: stagingStartTime,
                });
              },
            },
          }
        );

        onSuccess?.("stage");
        return data.data;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[useStagingWorkflow] Stage failed:", err);

        toast.error(
          isRtl
            ? "فشل في إضافة المشكلة"
            : "Failed to stage issue",
          {
            description: err.message,
            duration: 4000,
          }
        );

        onError?.(err);
        throw err;
      } finally {
        setStagingIds((prev) => {
          const next = new Set(prev);
          next.delete(issueId);
          return next;
        });
      }
    },
    [workspaceId, locale, isRtl, onSuccess, onError]
  );

  // ── Archive Signal (Soft Delete) ──────────────────────────────────────
  const archiveSignal = useCallback(
    async (signalId: string, signalName: string) => {
      setArchivingIds((prev) => new Set(prev).add(signalId));

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/staging/archive`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signalId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to archive signal");
        }

        toast.success(
          isRtl
            ? `تم أرشفة "${signalName}"`
            : `"${signalName}" archived`,
          { duration: 3000 }
        );

        onSuccess?.("archive");
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[useStagingWorkflow] Archive failed:", err);

        toast.error(
          isRtl
            ? "فشل الأرشفة"
            : "Failed to archive",
          { description: err.message }
        );

        onError?.(err);
        throw err;
      } finally {
        setArchivingIds((prev) => {
          const next = new Set(prev);
          next.delete(signalId);
          return next;
        });
      }
    },
    [workspaceId, isRtl, onSuccess, onError]
  );

  // ── Revert Stage (Undo) ───────────────────────────────────────────────
  const revertStage = useCallback(
    async (context: {
      signalId?: string;
      issueName: string;
      stagedAt: string;
    }) => {
      const { signalId, issueName } = context;

      if (!signalId) {
        toast.error(
          isRtl
            ? "لا يمكن التراجع عن هذه العملية"
            : "Cannot undo this action"
        );
        return false;
      }

      try {
        // Delete the staged signal
        const response = await fetch(
          `/api/workspaces/${workspaceId}/staging/delete`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signalId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to revert stage");
        }

        toast.success(
          isRtl
            ? `تم التراجع عن إضافة "${issueName}"`
            : `Reverted staging of "${issueName}"`,
          { duration: 3000 }
        );

        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[useStagingWorkflow] Revert failed:", err);

        toast.error(
          isRtl
            ? "فشل التراجع"
            : "Failed to undo",
          { description: err.message }
        );

        return false;
      }
    },
    [workspaceId, isRtl]
  );

  // ── Restore from Archive ──────────────────────────────────────────────
  const restoreSignal = useCallback(
    async (signal: ArchivedSignal) => {
      const archiveId = signal.id;

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/staging/restore`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signalId: archiveId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to restore signal");
        }

        toast.success(
          isRtl
            ? `تم استعادة "${signal.content}"`
            : `"${signal.content}" restored`,
          { duration: 3000 }
        );

        onSuccess?.("restore");
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[useStagingWorkflow] Restore failed:", err);

        toast.error(
          isRtl
            ? "فشل في الاستعادة"
            : "Failed to restore",
          { description: err.message }
        );

        onError?.(err);
        throw err;
      }
    },
    [workspaceId, isRtl, onSuccess, onError]
  );

  // ── Permanently Delete ────────────────────────────────────────────────
  const deleteSignal = useCallback(
    async (signal: ArchivedSignal) => {
      const signalId = signal.id;

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/staging/delete`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signalId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to delete signal");
        }

        toast.success(
          isRtl
            ? `تم حذف "${signal.content}"`
            : `"${signal.content}" deleted`,
          { duration: 3000 }
        );

        onSuccess?.("delete");
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error("[useStagingWorkflow] Delete failed:", err);

        toast.error(
          isRtl
            ? "فشل في الحذف"
            : "Failed to delete",
          { description: err.message }
        );

        onError?.(err);
        throw err;
      }
    },
    [workspaceId, isRtl, onSuccess, onError]
  );

  return {
    // State
    stagingIds,
    archivingIds,
    isStaging: (id: string) => stagingIds.has(id),
    isArchiving: (id: string) => archivingIds.has(id),

    // Actions
    stageSignal,
    archiveSignal,
    revertStage,
    restoreSignal,
    deleteSignal,
  };
}

export type UseStagingWorkflowReturn = ReturnType<typeof useStagingWorkflow>;
