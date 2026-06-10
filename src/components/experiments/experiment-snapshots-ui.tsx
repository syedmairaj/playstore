/**
 * Experiment Snapshots UI Component
 *
 * Manages A/B experiment snapshots for listing variants.
 * Displays baseline and variants with performance metrics.
 *
 * Features:
 * - Create baseline snapshot
 * - Create variant from baseline
 * - Record weekly metrics (manual entry)
 * - Compare baseline vs variant performance
 * - Publish winning variant
 * - Performance visualization
 * - Bilingual support (EN/AR)
 *
 * Usage:
 * <ExperimentSnapshotsUI
 *   appId={appId}
 *   workspaceId={workspaceId}
 *   locale="en"
 *   isRtl={false}
 * />
 */

"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Plus,
  TrendingUp,
  Zap,
  Check,
  X,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ExperimentSnapshot {
  id: string;
  appId: string;
  workspaceId: string;
  name: string;
  type: "baseline" | "variant";
  baselineSnapshotId?: string;
  listing: {
    title: string;
    shortDescription: string;
    fullDescription: string;
    language: "en" | "ar";
    previewImageUrl?: string;
  };
  metrics: Array<{
    weekNumber: number;
    impressions: number;
    installs: number;
    uninstalls: number;
    crashRate: number;
    rating: number;
    reviews: number;
    metricsSource: "manual" | "google_play_api";
  }>;
  createdAt: string;
  publishedAt?: string;
}

export interface ExperimentSnapshotsUIProps {
  appId: string;
  workspaceId: string;
  locale: string;
  isRtl?: boolean;
}

/**
 * Experiment Snapshots UI Component
 */
export function ExperimentSnapshotsUI({
  appId,
  workspaceId,
  locale,
  isRtl = false,
}: ExperimentSnapshotsUIProps) {
  const queryClient = useQueryClient();
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [showCreateBaseline, setShowCreateBaseline] = useState(false);
  const [showCreateVariant, setShowCreateVariant] = useState(false);

  // Fetch snapshots — locale is in the query key so EN and AR users never
  // share a cached result, and ?language= filters to the correct vault branch.
  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["experiments", appId, locale],
    queryFn: async () => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/experiments/snapshots?appId=${appId}&language=${locale}`
      );
      if (!res.ok) throw new Error("Failed to fetch snapshots");
      const json = await res.json();
      return json.data || [];
    },
  });

  // Create baseline mutation
  const createBaselineMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      shortDescription: string;
      fullDescription: string;
      language: "en" | "ar";
    }) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/experiments/snapshots`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "create_baseline",
            appId,
            ...data,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create baseline");
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      // Invalidate with locale so only the current environment's cache is cleared
      queryClient.invalidateQueries({ queryKey: ["experiments", appId, locale] });
      setShowCreateBaseline(false);
    },
  });

  // Create variant mutation
  const createVariantMutation = useMutation({
    mutationFn: async (data: {
      baselineSnapshotId: string;
      variantName: string;
      changes: Record<string, string>;
      hypothesis: string;
      language: "en" | "ar";
    }) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/experiments/snapshots`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "create_variant",
            appId,
            ...data,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create variant");
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments", appId, locale] });
      setShowCreateVariant(false);
    },
  });

  // Publish variant mutation
  const publishVariantMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/experiments/snapshots`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "publish_variant",
            snapshotId,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to publish variant");
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experiments", appId, locale] });
    },
  });

  const baselines = snapshots.filter((s: ExperimentSnapshot) => s.type === "baseline");
  const variants = snapshots.filter((s: ExperimentSnapshot) => s.type === "variant");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-white/5 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", isRtl && "text-end")}>
      {/* Header */}
      <div className={cn("flex items-center justify-between", isRtl && "flex-row-reverse")}>
        <div>
          <h2 className="text-lg font-bold text-white">
            {locale === "ar" ? "اختبارات التطبيق" : "Experiment Snapshots"}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            {locale === "ar"
              ? "إدارة الاختبارات والمتغيرات لتحسين الأداء"
              : "Manage A/B testing variants for listing optimization"}
          </p>
        </div>

        {baselines.length === 0 ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreateBaseline(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg",
              "bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold text-sm",
              "hover:shadow-lg hover:shadow-blue-500/50 transition-all",
              isRtl && "flex-row-reverse"
            )}
          >
            <Camera className="size-4" />
            {locale === "ar" ? "إنشاء الخط الأساسي" : "Create Baseline"}
          </motion.button>
        ) : null}
      </div>

      {/* Baselines Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
          {locale === "ar" ? "الخط الأساسي" : "Baselines"}
        </h3>

        <AnimatePresence initial={false}>
          {baselines.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 rounded-lg bg-white/5 border border-white/10 text-center text-zinc-400"
            >
              {locale === "ar"
                ? "لا توجد خطوط أساسية. أنشئ واحدة لبدء الاختبار."
                : "No baselines. Create one to start testing."}
            </motion.div>
          ) : (
            baselines.map((snapshot: ExperimentSnapshot) => (
              <motion.div
                key={snapshot.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-blue-500/30 bg-blue-900/10 p-4"
              >
                <div
                  className={cn(
                    "flex items-center justify-between cursor-pointer",
                    isRtl && "flex-row-reverse"
                  )}
                  onClick={() =>
                    setExpandedSnapshotId(
                      expandedSnapshotId === snapshot.id ? null : snapshot.id
                    )
                  }
                >
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">{snapshot.listing.title}</h4>
                    <p className="text-sm text-zinc-400 mt-1">
                      {snapshot.listing.shortDescription}
                    </p>
                  </div>
                  <motion.div
                    animate={{ rotate: expandedSnapshotId === snapshot.id ? 180 : 0 }}
                    className="text-blue-400"
                  >
                    <ChevronDown className="size-5" />
                  </motion.div>
                </div>

                {/* Expanded Content */}
                <AnimatePresence initial={false}>
                  {expandedSnapshotId === snapshot.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-blue-500/20 space-y-3"
                    >
                      {/* Metrics Summary */}
                      {snapshot.metrics.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-zinc-400">
                              {locale === "ar" ? "التثبيتات" : "Installs"}
                            </span>
                            <div className="font-bold text-green-400">
                              {snapshot.metrics.reduce((sum, m) => sum + m.installs, 0)}
                            </div>
                          </div>
                          <div>
                            <span className="text-zinc-400">
                              {locale === "ar" ? "التقييم" : "Rating"}
                            </span>
                            <div className="font-bold text-blue-400">
                              {(
                                snapshot.metrics.reduce((sum, m) => sum + m.rating, 0) /
                                snapshot.metrics.length
                              ).toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <span className="text-zinc-400">
                              {locale === "ar" ? "الأسابيع" : "Weeks"}
                            </span>
                            <div className="font-bold text-purple-400">
                              {snapshot.metrics.length}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Create Variant Button */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        onClick={() => setShowCreateVariant(true)}
                        className={cn(
                          "w-full py-2 rounded-lg font-semibold text-sm",
                          "bg-blue-600/30 border border-blue-500/50 text-blue-300 hover:bg-blue-600/50",
                          "transition-all flex items-center justify-center gap-2",
                          isRtl && "flex-row-reverse"
                        )}
                      >
                        <Plus className="size-4" />
                        {locale === "ar" ? "إنشاء متغير" : "Create Variant"}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Variants Section */}
      {variants.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            {locale === "ar" ? "المتغيرات" : "Variants"}
          </h3>

          <AnimatePresence initial={false}>
            {variants.map((snapshot: ExperimentSnapshot) => (
              <motion.div
                key={snapshot.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-lg border p-4",
                  snapshot.publishedAt ? "border-green-500/30 bg-green-900/10" : "border-amber-500/30 bg-amber-900/10"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between cursor-pointer",
                    isRtl && "flex-row-reverse"
                  )}
                  onClick={() =>
                    setExpandedSnapshotId(
                      expandedSnapshotId === snapshot.id ? null : snapshot.id
                    )
                  }
                >
                  <div className="flex-1">
                    <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                      <h4 className="font-semibold text-white">{snapshot.name}</h4>
                      {snapshot.publishedAt && (
                        <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold">
                          {locale === "ar" ? "منشور" : "Published"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">
                      {snapshot.listing.shortDescription}
                    </p>
                  </div>
                  <motion.div
                    animate={{ rotate: expandedSnapshotId === snapshot.id ? 180 : 0 }}
                    className="text-amber-400"
                  >
                    <ChevronDown className="size-5" />
                  </motion.div>
                </div>

                {/* Expanded Content */}
                <AnimatePresence initial={false}>
                  {expandedSnapshotId === snapshot.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-amber-500/20 space-y-3"
                    >
                      {!snapshot.publishedAt && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          onClick={() => publishVariantMutation.mutate(snapshot.id)}
                          disabled={publishVariantMutation.isPending}
                          className={cn(
                            "w-full py-2 rounded-lg font-semibold text-sm",
                            "bg-green-600/30 border border-green-500/50 text-green-300 hover:bg-green-600/50",
                            "transition-all flex items-center justify-center gap-2",
                            isRtl && "flex-row-reverse",
                            publishVariantMutation.isPending && "opacity-50 pointer-events-none"
                          )}
                        >
                          <Zap className="size-4" />
                          {locale === "ar" ? "نشر المتغير" : "Publish Variant"}
                        </motion.button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Empty State */}
      {baselines.length === 0 && variants.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-8 rounded-lg bg-white/5 border border-white/10 text-center space-y-3"
        >
          <Camera className="size-12 text-zinc-600 mx-auto" />
          <p className="text-zinc-400">
            {locale === "ar"
              ? "لا توجد لقطات. ابدأ بإنشاء خط أساسي للتجربة."
              : "No snapshots. Start by creating a baseline snapshot."}
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default ExperimentSnapshotsUI;
