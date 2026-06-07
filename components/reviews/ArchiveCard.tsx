/**
 * ArchiveCard Component
 *
 * Displays archived/previously staged issues in a de-emphasized style.
 * Allows restoring, deleting, and previewing archived signals.
 *
 * Used in: Optimization History Archive section
 */

"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RotateCcw,
  Trash2,
  Eye,
  AlertTriangle,
  Calendar,
  Package,
} from "lucide-react";

export interface ArchivedSignal {
  id: string;
  signalType: string;
  content: string;
  severity?: "critical" | "high" | "medium" | "low";
  impactPercent?: number;
  description?: string;
  quote?: string;
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;
  stagedAt: string;
  deletedAt?: string;
  metadata?: Record<string, unknown>;
}

export type ArchiveCardProps = {
  signal: ArchivedSignal;
  workspaceId: string;
  onRestore?: (signal: ArchivedSignal) => Promise<void>;
  onDelete?: (signal: ArchivedSignal) => Promise<void>;
  onPreview?: (signal: ArchivedSignal) => void;
  isLoading?: boolean;
};

const SEVERITY_CONFIG: Record<
  string,
  { badge: string; label: string; textColor: string }
> = {
  CRITICAL: {
    badge: "bg-red-500/5 text-red-400/60 border border-red-500/10",
    label: "Critical",
    textColor: "text-red-400/60",
  },
  MEDIUM: {
    badge: "bg-amber-500/5 text-amber-400/60 border border-amber-500/10",
    label: "Medium",
    textColor: "text-amber-400/60",
  },
  LOW: {
    badge: "bg-blue-500/5 text-blue-400/60 border border-blue-500/10",
    label: "Low",
    textColor: "text-blue-400/60",
  },
};

export function ArchiveCard({
  signal,
  workspaceId,
  onRestore,
  onDelete,
  onPreview,
  isLoading = false,
}: ArchiveCardProps) {
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const impactPct = signal.impactPercent
    ? Math.round(signal.impactPercent)
    : undefined;

  const severity =
    (signal.metadata?.severity as string) || signal.severity || "medium";
  const config =
    SEVERITY_CONFIG[severity.toUpperCase()] || SEVERITY_CONFIG.MEDIUM;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch {
      return isoString;
    }
  };

  const handleRestore = async () => {
    if (!onRestore || isRestoring || isLoading) return;
    setIsRestoring(true);
    try {
      await onRestore(signal);
    } catch (error) {
      console.error("Failed to restore signal:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isDeleting || isLoading) return;
    setIsDeleting(true);
    try {
      await onDelete(signal);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete signal:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePreview = () => {
    if (onPreview) {
      onPreview(signal);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden border border-zinc-800/40 bg-zinc-900/20 rounded-lg transition-all hover:bg-zinc-900/30",
          "text-zinc-400"
        )}
      >
        {/* Left accent stripe - muted */}
        <div
          className={cn("absolute left-0 top-0 bottom-0 w-1 bg-zinc-700/40")}
          aria-hidden
        />

        <CardHeader className="space-y-2 pb-2 pl-6 pr-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  config.badge
                )}
              >
                {config.label}
              </span>

              <CardTitle
                className={cn(
                  "text-sm font-semibold leading-snug text-zinc-300 mt-2 line-clamp-2"
                )}
              >
                {signal.content}
              </CardTitle>
            </div>

            {/* Impact badge - optional */}
            {impactPct !== undefined && (
              <span className={cn("text-[11px] font-medium tabular-nums")}>
                <span className="text-zinc-500">Impact:</span>
                <br />
                <span className={config.textColor}>{impactPct}%</span>
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0 pl-6 pr-4">
          {/* Description */}
          {signal.description && (
            <p className="text-xs leading-relaxed text-zinc-500">
              {signal.description}
            </p>
          )}

          {/* Quote */}
          {signal.quote && (
            <blockquote className="border-l border-zinc-700/40 pl-3 text-[11px] italic leading-relaxed text-zinc-600">
              &ldquo;{signal.quote}&rdquo;
            </blockquote>
          )}

          {/* Metadata footer */}
          <div className="space-y-2 pt-2">
            {/* Staged date */}
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <Calendar className="w-3 h-3 shrink-0 text-zinc-600" />
              <span>{isRtl ? "تاريخ الإضافة:" : "Staged:"}</span>
              <span className="font-mono text-zinc-500">
                {formatDate(signal.stagedAt)}
              </span>
            </div>

            {/* Source (app or competitor) */}
            {(signal.sourceAppId || signal.sourceContext) && (
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Package className="w-3 h-3 shrink-0 text-zinc-600" />
                <span>{isRtl ? "المصدر:" : "Source:"}</span>
                <span className="font-mono text-zinc-500 truncate">
                  {signal.sourceContext || signal.sourceAppId}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 pt-2">
            {/* Restore button */}
            {onRestore && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleRestore}
                      disabled={isRestoring || isLoading}
                      className={cn(
                        "p-1.5 rounded transition-colors",
                        "hover:bg-emerald-500/10 text-emerald-400/60 hover:text-emerald-400",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                      aria-label={
                        isRtl ? "استعادة المشكلة" : "Restore issue"
                      }
                    >
                      {isRestoring ? (
                        <div className="w-4 h-4 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isRtl ? "استعادة إلى Active Insights" : "Restore to Active Insights"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Delete button with confirmation */}
            {onDelete && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (showDeleteConfirm) {
                          handleDelete();
                        } else {
                          setShowDeleteConfirm(true);
                        }
                      }}
                      disabled={isDeleting || isLoading}
                      className={cn(
                        "p-1.5 rounded transition-colors",
                        showDeleteConfirm
                          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          : "hover:bg-red-500/10 text-red-400/60 hover:text-red-400",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                      aria-label={isRtl ? "حذف المشكلة" : "Delete issue"}
                    >
                      {isDeleting ? (
                        <div className="w-4 h-4 border-2 border-red-400/20 border-t-red-400 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {showDeleteConfirm
                      ? isRtl
                        ? "انقر مجددا للتأكيد"
                        : "Click again to confirm"
                      : isRtl
                        ? "حذف نهائيا"
                        : "Delete permanently"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Preview button */}
            {onPreview && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handlePreview}
                      className={cn(
                        "p-1.5 rounded transition-colors",
                        "hover:bg-blue-500/10 text-blue-400/60 hover:text-blue-400"
                      )}
                      aria-label={isRtl ? "معاينة" : "Preview"}
                    >
                      <Eye className="w-4 h-4" />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isRtl ? "معاينة التفاصيل" : "Preview details"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Delete confirmation hint */}
            {showDeleteConfirm && (
              <motion.button
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 text-xs rounded border border-zinc-700/40 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700/60 transition-colors"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </motion.button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default ArchiveCard;
