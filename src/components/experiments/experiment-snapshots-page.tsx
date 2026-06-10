/**
 * Experiment Snapshots Page Component
 *
 * Full page for A/B Experiment Snapshots.
 * Allows users to:
 * - Create baseline snapshots
 * - Create variants for testing
 * - Record weekly metrics
 * - Compare performance
 * - Publish winning variants
 */

"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExperimentSnapshotsUI } from "./experiment-snapshots-ui";

interface ExperimentSnapshotsPageProps {
  workspaceId: string;
  locale: string;
}

export function ExperimentSnapshotsPage({
  workspaceId,
  locale,
}: ExperimentSnapshotsPageProps) {
  const isRtl = locale === "ar";
  const params = useParams();
  const appId = params.appId as string;

  // State
  const [error, setError] = useState<string | null>(null);

  if (!appId) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-6 flex items-start gap-4"
      >
        <AlertCircle className="size-6 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-amber-100 mb-1">
            {locale === "ar"
              ? "اختر تطبيقًا أولاً"
              : "Select an app first"}
          </h3>
          <p className="text-sm text-amber-300">
            {locale === "ar"
              ? "يجب اختيار تطبيق لإنشاء لقطات الاختبار"
              : "You need to select an app to create experiment snapshots"}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-blue-500/20 bg-blue-900/10 p-6"
      >
        <h2 className="text-lg font-semibold text-blue-100 mb-2">
          {locale === "ar"
            ? "كيفية استخدام لقطات الاختبار"
            : "How to use experiment snapshots"}
        </h2>
        <ol className={cn("space-y-2 text-sm text-blue-200", isRtl && "text-end")}>
          <li>
            1. <strong>{locale === "ar" ? "إنشاء خط أساسي" : "Create baseline"}:</strong> {locale === "ar" ? "احفظ الحالة الحالية للقائمة" : "Save current listing state"}
          </li>
          <li>
            2. <strong>{locale === "ar" ? "إنشاء متغير" : "Create variant"}:</strong> {locale === "ar" ? "غيّر العنوان أو الوصف" : "Change title or description"}
          </li>
          <li>
            3. <strong>{locale === "ar" ? "تسجيل المقاييس" : "Record metrics"}:</strong> {locale === "ar" ? "اتابع الأداء كل أسبوع" : "Track performance weekly"}
          </li>
          <li>
            4. <strong>{locale === "ar" ? "مقارنة" : "Compare"}:</strong> {locale === "ar" ? "قارن النتائج بين النسخ" : "Compare results"}
          </li>
          <li>
            5. <strong>{locale === "ar" ? "نشر" : "Publish"}:</strong> {locale === "ar" ? "انشر النسخة الفائزة" : "Launch the winner"}
          </li>
        </ol>
      </motion.div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 flex items-start gap-3"
        >
          <AlertCircle className="size-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </motion.div>
      )}

      {/* Main UI */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <ExperimentSnapshotsUI
          appId={appId}
          workspaceId={workspaceId}
          locale={locale}
          isRtl={isRtl}
        />
      </motion.div>
    </div>
  );
}

export default ExperimentSnapshotsPage;
