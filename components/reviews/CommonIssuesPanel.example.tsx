/**
 * CommonIssuesPanel Component - Example Implementation
 *
 * Complete example showing:
 * - Active Insights with IssueCard
 * - Staging workflow integration
 * - Optimization History Archive with ArchiveCard
 * - Full RTL/LTR support for EN/AR
 *
 * Copy relevant parts into your actual CommonIssuesPanel component.
 */

"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "next-intl";
import { useStagingWorkflow } from "@/hooks/useStagingWorkflow";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import { IssueCard } from "@/components/reviews/IssueCard";
import { ArchiveCard } from "@/components/reviews/ArchiveCard";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";
import type { ArchivedSignal } from "@/components/reviews/ArchiveCard";

interface CommonIssuesPanelProps {
  workspaceId: string;
  appId?: string;
  issues: IssueItem[];
  isLoading?: boolean;
}

export function CommonIssuesPanel({
  workspaceId,
  appId,
  issues,
  isLoading = false,
}: CommonIssuesPanelProps) {
  const locale = useLocale();
  const isRtl = locale === "ar";

  // ── Staging Workflow ──────────────────────────────────────────────────────
  const stagingWorkflow = useStagingWorkflow({
    workspaceId,
    onSuccess: (action) => {
      console.log(`Staging action succeeded: ${action}`);
      // Optionally refresh optimizer context
      // refreshOptimizerContext?.();
    },
    onError: (error) => {
      console.error("Staging error:", error);
    },
  });

  // ── Optimizer Context (for archived signals) ──────────────────────────────
  const { data: optimizerContext } = useOptimizerSync(workspaceId, {
    enabled: true,
    staleTime: 5000,
  });

  // ── State ─────────────────────────────────────────────────────────────────
  const [stagedIssueIds, setStagedIssueIds] = useState<Set<string>>(
    new Set()
  );
  const [previewSignal, setPreviewSignal] = useState<ArchivedSignal | null>(
    null
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  // Active issues (not yet staged)
  const activeIssues = useMemo(
    () => issues.filter((issue) => !stagedIssueIds.has(issue.title)),
    [issues, stagedIssueIds]
  );

  // Archived signals from staging vault
  const archivedSignals: ArchivedSignal[] = useMemo(() => {
    if (!optimizerContext?.archivedItems) return [];

    return optimizerContext.archivedItems
      .filter((item) => item.signalType === "review_issue")
      .map((item) => ({
        id: item.id,
        signalType: item.signalType,
        content: item.content,
        severity: item.metadata?.severity as any,
        impactPercent: item.metadata?.impactPercent as number,
        description: item.metadata?.description as string,
        quote: item.metadata?.quote as string,
        sourceAppId: appId,
        sourceContext: "common_issues_theme",
        sourceContextId: item.id,
        stagedAt: item.createdAt || new Date().toISOString(),
        deletedAt: item.archivedAt,
        metadata: item.metadata,
      }));
  }, [optimizerContext?.archivedItems, appId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleIssueStaged = (issueTitle: string) => {
    setStagedIssueIds((prev) => new Set(prev).add(issueTitle));
  };

  const handleRestoreArchived = async (signal: ArchivedSignal) => {
    try {
      await stagingWorkflow.restoreSignal(signal);
      // Optionally remove from archived display
    } catch (error) {
      console.error("Restore failed:", error);
    }
  };

  const handleDeleteArchived = async (signal: ArchivedSignal) => {
    try {
      await stagingWorkflow.deleteSignal(signal);
      // Signal will be removed from display after deletion
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handlePreviewArchived = (signal: ArchivedSignal) => {
    setPreviewSignal(signal);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── ACTIVE INSIGHTS ────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">
            {isRtl ? "الرؤى النشطة" : "Active Insights"}
          </h3>
          <span className="text-sm text-gray-400">
            {activeIssues.length}{" "}
            {isRtl ? (activeIssues.length === 1 ? "مشكلة" : "مشاكل") : `issue${activeIssues.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {activeIssues.length > 0 ? (
          <motion.div
            className="space-y-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            layout
          >
            <AnimatePresence mode="popLayout">
              {activeIssues.map((issue) => (
                <motion.div
                  key={issue.title}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    x: isRtl ? 20 : -20,
                    transition: { duration: 0.2 },
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <IssueCard
                    issue={issue}
                    workspaceId={workspaceId}
                    appId={appId}
                    stagingWorkflow={stagingWorkflow}
                    onStaged={() => handleIssueStaged(issue.title)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/20 p-8 text-center">
            <p className="text-gray-500">
              {isRtl
                ? "لا توجد مشاكل شائعة في الوقت الراهن"
                : "No common issues at this time"}
            </p>
          </div>
        )}
      </section>

      {/* ── OPTIMIZATION HISTORY ARCHIVE ──────────────────────────────────────── */}
      {archivedSignals.length > 0 && (
        <section className="border-t border-gray-700 pt-8">
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white">
              {isRtl ? "سجل الأرشفة" : "Optimization History Archive"}
            </h3>
            <span className="text-sm text-gray-400">
              {archivedSignals.length}{" "}
              {isRtl
                ? archivedSignals.length === 1
                  ? "عنصر"
                  : "عناصر"
                : `item${archivedSignals.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          <motion.div
            className="space-y-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            layout
          >
            <AnimatePresence mode="popLayout">
              {archivedSignals.map((signal) => (
                <motion.div
                  key={signal.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <ArchiveCard
                    signal={signal}
                    workspaceId={workspaceId}
                    onRestore={handleRestoreArchived}
                    onDelete={handleDeleteArchived}
                    onPreview={handlePreviewArchived}
                    isLoading={stagingWorkflow.archivingIds.has(signal.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </section>
      )}

      {/* ── PREVIEW SIDE PANEL (Optional) ──────────────────────────────────────– */}
      {previewSignal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPreviewSignal(null)}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4 border border-zinc-700"
          >
            <h2 className="text-lg font-semibold text-white mb-4">
              {previewSignal.content}
            </h2>

            {previewSignal.description && (
              <p className="text-gray-400 text-sm mb-4">
                {previewSignal.description}
              </p>
            )}

            {previewSignal.quote && (
              <blockquote className="border-l border-blue-500 pl-3 italic text-gray-500 text-sm mb-4">
                "{previewSignal.quote}"
              </blockquote>
            )}

            <div className="space-y-2 text-xs text-gray-500 mb-6">
              {previewSignal.impactPercent && (
                <p>
                  <span className="text-gray-400">Impact:</span> {previewSignal.impactPercent}%
                </p>
              )}
              <p>
                <span className="text-gray-400">Staged:</span> {previewSignal.stagedAt}
              </p>
            </div>

            <button
              onClick={() => setPreviewSignal(null)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition"
            >
              {isRtl ? "إغلاق" : "Close"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

export default CommonIssuesPanel;
