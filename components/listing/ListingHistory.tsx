"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Info,
  Loader2,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type MetricEntry = {
  id: string;
  metric_week: string;
  conversion_rate: number | null;
  store_visitors: number | null;
  category_rank: number | null;
  search_visibility: number | null;
  note: string | null;
  created_at: string;
};

type PerformanceDelta = {
  conversionRateChange: string;
  searchVisibilityChange: string;
  rankShift: string;
  storeVisitorsChange: string;
};

type AttributionRecord = {
  snapshotId: string;
  createdAt: string;
  title: string;
  shortDescription: string;
  strategySummary: string | null;
  asoScore: number | null;
  toneStyle: string | null;
  qualityStatus: string | null;
  reviewSignals: string[];
  marketSignals: string[];
  reviewSignalCount: number;
  marketSignalCount: number;
  baselineMetrics: {
    week: string;
    conversionRate: number | null;
    storeVisitors: number | null;
    categoryRank: number | null;
    searchVisibility: number | null;
  } | null;
  postMetrics: {
    week: string;
    conversionRate: number | null;
    storeVisitors: number | null;
    categoryRank: number | null;
    searchVisibility: number | null;
  } | null;
  performanceDelta: PerformanceDelta;
  attributionAnalysis: string;
  nextStep: string;
  verdict: "success" | "needs_adjustment" | "pending";
};

// ── i18n strings (EN + AR) ────────────────────────────────────────────────────

type Lang = "en" | "ar";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    // ── Section header ──────────────────────────────────────────────────────
    heading: "Growth Tracking & Insights",
    subheading: "Every listing update is an experiment. Log your Play Console numbers weekly and we'll show you exactly what drove the change.",

    // ── "How it works" info panel ───────────────────────────────────────────
    howItWorksTitle: "How Growth Tracking works",
    howItWorksToggleShow: "How it works",
    howItWorksToggleHide: "Hide",
    whyTrackHeading: "Why track performance?",
    whyTrackBody: "ASO is about testing, not guessing — every listing change is an experiment with a measurable outcome. This tool bridges the gap between your listing updates and your real-world store analytics so you know exactly what moved the needle.",
    howStep1: "Make an update — generate a new listing with review issues or keyword signals active.",
    howStep2: "Wait 7–14 days — give the Play Store algorithm time to index your changes and stabilise rankings.",
    howStep3: "Log your metrics — copy Conversion rate and Store visitors from Play Console (Acquire users → Store listing analytics) into the form below.",
    howCta: "Understand exactly what drives your downloads.",

    // ── Metric entry form ───────────────────────────────────────────────────
    enterMetrics: "Enter This Week's Metrics",
    enterMetricsHint: "Play Console → Acquire users → Store listing analytics",
    conversionRate: "Conversion Rate (%)",
    storeVisitors: "Store Visitors",
    categoryRank: "Category Rank",
    searchVisibility: "Search Visibility (0–100)",
    weekNote: "Note (optional)",
    weekNotePlaceholder: "e.g. ran a promotion this week",
    saveMetrics: "Save Metrics",
    saving: "Saving…",
    saved: "Saved",
    metricsSavedToast: "Metrics saved for this week.",

    // ── Timeline / cards ────────────────────────────────────────────────────
    noSnapshots: "No listing generations yet.",
    noSnapshotsHint: "Generate your first AI listing to start tracking performance.",
    generatedOn: "Generated",
    signals: "Signals used",
    reviewSignals: "Review Issues",
    marketSignals: "Market Keywords",
    noSignals: "No signals — baseline generation",
    strategy: "Strategy",
    asoScore: "ASO Score",
    toneStyle: "Tone",
    verdict: "Verdict",
    verdictSuccess: "Success",
    verdictNeedsAdjustment: "Needs Adjustment",
    verdictPending: "Pending Data",
    performanceDelta: "Performance Delta",
    conversionChange: "Conversion Rate",
    visibilityChange: "Search Visibility",
    rankChange: "Category Rank",
    visitorsChange: "Store Visitors",
    attribution: "Attribution Analysis",
    nextStep: "Next Recommended Pivot",
    baseline: "Baseline (week before)",
    postOptimization: "Post-Optimization",
    noData: "—",
    enterDataNudge: "Enter weekly metrics above to see attribution.",
    expandDetails: "View attribution",
    collapseDetails: "Hide",
    metricsHistory: "Metric History",
    week: "Week",
    loadingHistory: "Loading history…",
    loadError: "Could not load history. Try refreshing.",
    tone_professional: "Professional",
    tone_friendly: "Friendly",
    tone_bold: "Bold",
    tone_minimal: "Minimal",
    qualityMaximum: "All signals active",
    qualityPartial: "Partial signals",
  },
  ar: {
    // ── Section header ──────────────────────────────────────────────────────
    heading: "تتبع النمو والتحليلات",
    subheading: "كل تحديث لقائمتك هو تجربة قابلة للقياس. سجّل أرقامك من Play Console أسبوعياً وسنُظهر لك بالضبط ما الذي أحدث الفارق.",

    // ── "How it works" info panel ───────────────────────────────────────────
    howItWorksTitle: "كيف يعمل تتبع النمو",
    howItWorksToggleShow: "كيف يعمل؟",
    howItWorksToggleHide: "إخفاء",
    whyTrackHeading: "لماذا تتبع الأداء؟",
    whyTrackBody: "تحسين ASO يعتمد على التجريب لا التخمين — كل تعديل تُجريه على قائمتك هو تجربة بنتيجة قابلة للقياس. هذه الأداة تربط بين تعديلاتك وأرقام متجرك الفعلية حتى تعرف بدقة ما الذي أحدث الأثر.",
    howStep1: "أجرِ تحديثاً — أنشئ قائمة جديدة مع تفعيل إشارات المراجعات أو الكلمات المفتاحية.",
    howStep2: "انتظر 7–14 يوماً — امنح خوارزمية Play Store الوقت الكافي لفهرسة تغييراتك واستقرار ترتيباتك.",
    // Note: "معدل التحويل" and "زوار صفحة المتجر" are the exact Arabic labels in Play Console
    howStep3: "سجّل مقاييسك — انسخ معدل التحويل وزوار صفحة المتجر من Play Console (اكتساب المستخدمين ← تحليلات قائمة المتجر) في النموذج أدناه.",
    howCta: "افهم بالضبط ما الذي يُحرّك عدد تنزيلات تطبيقك.",

    // ── Metric entry form ───────────────────────────────────────────────────
    enterMetrics: "أدخل مقاييس هذا الأسبوع",
    // Uses exact Arabic Play Console navigation path
    enterMetricsHint: "Play Console ← اكتساب المستخدمين ← تحليلات قائمة المتجر",
    // Exact Arabic Play Console field labels:
    conversionRate: "معدل التحويل (%)",
    storeVisitors: "زوار صفحة المتجر",
    categoryRank: "مرتبة الفئة",
    searchVisibility: "مؤشر الظهور في البحث (0–100)",
    weekNote: "ملاحظة (اختياري)",
    weekNotePlaceholder: "مثال: أجرينا عرضاً ترويجياً هذا الأسبوع",
    saveMetrics: "حفظ المقاييس",
    saving: "جاري الحفظ…",
    saved: "تم الحفظ",
    metricsSavedToast: "تم حفظ مقاييس هذا الأسبوع.",

    // ── Timeline / cards ────────────────────────────────────────────────────
    noSnapshots: "لا توجد قوائم مُولَّدة بعد.",
    noSnapshotsHint: "أنشئ أول قائمة AI لبدء تتبع الأداء.",
    generatedOn: "تاريخ الإنشاء",
    signals: "الإشارات المستخدمة",
    reviewSignals: "مشكلات المراجعات",
    marketSignals: "كلمات السوق",
    noSignals: "لا إشارات — توليد أساسي",
    strategy: "الاستراتيجية",
    asoScore: "درجة ASO",
    toneStyle: "الأسلوب",
    verdict: "الحكم",
    verdictSuccess: "نجح",
    verdictNeedsAdjustment: "يحتاج تعديل",
    verdictPending: "في انتظار البيانات",
    performanceDelta: "مؤشر التغيير",
    conversionChange: "معدل التحويل",
    visibilityChange: "الظهور في البحث",
    rankChange: "مرتبة الفئة",
    visitorsChange: "زوار صفحة المتجر",
    attribution: "تحليل الإسناد",
    nextStep: "الخطوة التالية الموصى بها",
    baseline: "الأساس (الأسبوع السابق)",
    postOptimization: "ما بعد التحسين",
    noData: "—",
    enterDataNudge: "أدخل المقاييس الأسبوعية أعلاه لعرض الإسناد.",
    expandDetails: "عرض الإسناد",
    collapseDetails: "إخفاء",
    metricsHistory: "سجل المقاييس",
    week: "الأسبوع",
    loadingHistory: "جاري تحميل السجل…",
    loadError: "تعذّر تحميل السجل. حاول التحديث.",
    tone_professional: "احترافي",
    tone_friendly: "ودّي",
    tone_bold: "جريء",
    tone_minimal: "بسيط",
    qualityMaximum: "جميع الإشارات نشطة",
    qualityPartial: "إشارات جزئية",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function VerdictBadge({
  verdict,
  t,
}: {
  verdict: AttributionRecord["verdict"];
  t: Record<string, string>;
}) {
  if (verdict === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/25">
        <CheckCircle2 className="size-3 shrink-0" aria-hidden />
        {t.verdictSuccess}
      </span>
    );
  }
  if (verdict === "needs_adjustment") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/25">
        <AlertTriangle className="size-3 shrink-0" aria-hidden />
        {t.verdictNeedsAdjustment}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 ring-1 ring-zinc-600/30">
      <Clock className="size-3 shrink-0" aria-hidden />
      {t.verdictPending}
    </span>
  );
}

function DeltaCell({
  label,
  value,
  isRank = false,
}: {
  label: string;
  value: string;
  isRank?: boolean;
}) {
  const isPositive = value.startsWith("+") || value.startsWith("↑");
  const isNegative =
    (value.startsWith("-") || value.startsWith("↓")) && !isRank
      ? true
      : isRank && value.startsWith("↓");
  const isNeutral = value === "—" || value === "unchanged";

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          isNeutral && "text-zinc-500",
          !isNeutral && (isPositive ? "text-emerald-400" : isNegative ? "text-rose-400" : "text-zinc-300"),
        )}
      >
        {isPositive && !isNeutral && <TrendingUp className="mr-1 inline size-3.5 text-emerald-400" aria-hidden />}
        {isNegative && !isNeutral && <TrendingDown className="mr-1 inline size-3.5 text-rose-400" aria-hidden />}
        {value}
      </p>
    </div>
  );
}

function AttributionCard({
  record,
  isExpanded,
  onToggle,
  t,
  isRtl,
}: {
  record: AttributionRecord;
  isExpanded: boolean;
  onToggle: () => void;
  t: Record<string, string>;
  isRtl: boolean;
}) {
  const date = new Date(record.createdAt);
  const dateLabel = date.toLocaleDateString(isRtl ? "ar-SA" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const toneKey = `tone_${record.toneStyle ?? ""}` as keyof typeof t;
  const toneLabel = t[toneKey] ?? record.toneStyle ?? "";

  return (
    <motion.div
      layout
      className={cn(
        "overflow-hidden rounded-2xl border bg-zinc-900/60 transition-colors",
        record.verdict === "success"
          ? "border-emerald-500/20"
          : record.verdict === "needs_adjustment"
            ? "border-amber-500/20"
            : "border-zinc-800/60",
      )}
    >
      {/* ── Card header ── */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-start gap-3 px-5 py-4 text-start transition-colors hover:bg-white/[0.03]",
          isRtl && "flex-row-reverse text-end",
        )}
      >
        {/* Left: dot + date */}
        <div className={cn("flex shrink-0 flex-col items-center gap-1 pt-0.5", isRtl && "items-center")}>
          <div
            className={cn(
              "size-2.5 rounded-full",
              record.verdict === "success"
                ? "bg-emerald-400"
                : record.verdict === "needs_adjustment"
                  ? "bg-amber-400"
                  : "bg-zinc-600",
            )}
          />
          <div className="h-full w-px bg-zinc-800" />
        </div>

        {/* Centre: title + signals */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className={cn("flex flex-wrap items-center gap-2", isRtl && "flex-row-reverse")}>
            <p className="text-[11px] text-zinc-500">{t.generatedOn} {dateLabel}</p>
            <VerdictBadge verdict={record.verdict} t={t} />
            {record.qualityStatus === "maximum" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400/80 ring-1 ring-emerald-500/20">
                <Sparkles className="size-2.5 shrink-0" aria-hidden />
                {t.qualityMaximum}
              </span>
            )}
          </div>
          <p className={cn("text-sm font-semibold text-zinc-100 leading-snug", isRtl && "text-end")}>
            {record.title}
          </p>

          {/* Signal pills */}
          {(record.reviewSignalCount > 0 || record.marketSignalCount > 0) ? (
            <div className={cn("flex flex-wrap gap-1.5", isRtl && "flex-row-reverse")}>
              {record.reviewSignals.slice(0, 4).map((sig, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/8 px-2 py-0.5 text-[10px] font-medium text-rose-300/80"
                >
                  <AlertTriangle className="size-2.5 shrink-0 text-rose-400/60" aria-hidden />
                  {sig}
                </span>
              ))}
              {record.marketSignals.slice(0, 4).map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-medium text-emerald-300/80"
                >
                  <Hash className="size-2.5 shrink-0 text-emerald-400/60" aria-hidden />
                  {kw}
                </span>
              ))}
              {(record.reviewSignals.length + record.marketSignals.length) > 8 && (
                <span className="text-[10px] text-zinc-500">
                  +{(record.reviewSignals.length + record.marketSignals.length) - 8} more
                </span>
              )}
            </div>
          ) : (
            <p className="text-[10px] italic text-zinc-600">{t.noSignals}</p>
          )}

          {/* Delta summary row */}
          {record.verdict !== "pending" && (
            <div className={cn("flex flex-wrap gap-4 pt-1", isRtl && "flex-row-reverse")}>
              <DeltaCell label={t.conversionChange} value={record.performanceDelta.conversionRateChange} />
              <DeltaCell label={t.visibilityChange} value={record.performanceDelta.searchVisibilityChange} />
              <DeltaCell label={t.rankChange} value={record.performanceDelta.rankShift} isRank />
              <DeltaCell label={t.visitorsChange} value={record.performanceDelta.storeVisitorsChange} />
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <div className="mt-1 shrink-0 text-zinc-500 transition-transform" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
          <ChevronRight className="size-4" aria-hidden />
        </div>
      </button>

      {/* ── Expanded detail panel ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={cn("space-y-5 border-t border-zinc-800/60 px-5 py-5", isRtl && "text-end")}>

              {/* Performance delta grid */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {t.performanceDelta}
                </p>
                <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", isRtl && "text-end")}>
                  {[
                    { label: t.conversionChange, value: record.performanceDelta.conversionRateChange },
                    { label: t.visibilityChange, value: record.performanceDelta.searchVisibilityChange },
                    { label: t.rankChange, value: record.performanceDelta.rankShift, isRank: true },
                    { label: t.visitorsChange, value: record.performanceDelta.storeVisitorsChange },
                  ].map(({ label, value, isRank }) => (
                    <div key={label} className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
                      <DeltaCell label={label} value={value} isRank={isRank} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Before / After metric snapshot */}
              {(record.baselineMetrics || record.postMetrics) && (
                <div className={cn("grid grid-cols-2 gap-3", isRtl && "direction-rtl")}>
                  {record.baselineMetrics && (
                    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t.baseline}</p>
                      <p className="text-[11px] text-zinc-400">{t.week}: {record.baselineMetrics.week}</p>
                      {record.baselineMetrics.conversionRate != null && (
                        <p className="text-[11px] text-zinc-300">{t.conversionChange}: {record.baselineMetrics.conversionRate.toFixed(1)}%</p>
                      )}
                      {record.baselineMetrics.categoryRank != null && (
                        <p className="text-[11px] text-zinc-300">{t.rankChange}: #{record.baselineMetrics.categoryRank}</p>
                      )}
                    </div>
                  )}
                  {record.postMetrics && (
                    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t.postOptimization}</p>
                      <p className="text-[11px] text-zinc-400">{t.week}: {record.postMetrics.week}</p>
                      {record.postMetrics.conversionRate != null && (
                        <p className="text-[11px] text-zinc-300">{t.conversionChange}: {record.postMetrics.conversionRate.toFixed(1)}%</p>
                      )}
                      {record.postMetrics.categoryRank != null && (
                        <p className="text-[11px] text-zinc-300">{t.rankChange}: #{record.postMetrics.categoryRank}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Attribution analysis */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                <div className={cn("mb-2 flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
                  <BarChart2 className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t.attribution}</p>
                </div>
                {record.verdict === "pending" ? (
                  <p className="text-[12px] italic leading-relaxed text-zinc-500">{t.enterDataNudge}</p>
                ) : (
                  <p className="text-[12px] leading-relaxed text-zinc-300">{record.attributionAnalysis}</p>
                )}
              </div>

              {/* Next step */}
              <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
                <div className={cn("mb-2 flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
                  <Zap className="size-3.5 shrink-0 text-blue-400" aria-hidden />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400/80">{t.nextStep}</p>
                </div>
                <p className={cn("text-[12px] leading-relaxed text-blue-200/80", isRtl && "text-end")}>
                  {record.nextStep}
                </p>
              </div>

              {/* Strategy summary */}
              {record.strategySummary && (
                <div className={cn("flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500", isRtl && "flex-row-reverse")}>
                  <Info className="mt-0.5 size-3 shrink-0 text-zinc-600" aria-hidden />
                  <span>{record.strategySummary}</span>
                </div>
              )}

              {/* ASO score + tone */}
              <div className={cn("flex flex-wrap gap-4 pt-1 text-[11px] text-zinc-500", isRtl && "flex-row-reverse")}>
                {record.asoScore != null && (
                  <span>{t.asoScore}: <span className="font-semibold text-zinc-300">{record.asoScore}/100</span></span>
                )}
                {toneLabel && (
                  <span>{t.toneStyle}: <span className="font-semibold text-zinc-300">{toneLabel}</span></span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── MetricEntryForm ───────────────────────────────────────────────────────────

function MetricEntryForm({
  workspaceId,
  appId,
  t,
  isRtl,
  onSaved,
}: {
  workspaceId: string;
  appId?: string;
  t: Record<string, string>;
  isRtl: boolean;
  onSaved: (entry: MetricEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [fields, setFields] = useState({
    conversionRate: "",
    storeVisitors: "",
    categoryRank: "",
    searchVisibility: "",
    note: "",
  });

  function setField(k: keyof typeof fields, v: string) {
    setFields((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!appId) return;
    setSaving(true);
    try {
      const body: Record<string, number | string | null> = {};
      if (fields.conversionRate !== "") body.conversionRate = parseFloat(fields.conversionRate);
      if (fields.storeVisitors !== "") body.storeVisitors = parseInt(fields.storeVisitors, 10);
      if (fields.categoryRank !== "") body.categoryRank = parseInt(fields.categoryRank, 10);
      if (fields.searchVisibility !== "") body.searchVisibility = parseFloat(fields.searchVisibility);
      if (fields.note.trim()) body.note = fields.note.trim();

      const res = await fetch(
        `/api/workspaces/${workspaceId}/apps/${appId}/metrics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as { ok: boolean };
      if (json.ok) {
        setSavedOk(true);
        setOpen(false);
        setFields({ conversionRate: "", storeVisitors: "", categoryRank: "", searchVisibility: "", note: "" });
        // Re-fetch parent
        onSaved({
          id: "",
          metric_week: "",
          conversion_rate: body.conversionRate != null ? Number(body.conversionRate) : null,
          store_visitors: body.storeVisitors != null ? Number(body.storeVisitors) : null,
          category_rank: body.categoryRank != null ? Number(body.categoryRank) : null,
          search_visibility: body.searchVisibility != null ? Number(body.searchVisibility) : null,
          note: typeof body.note === "string" ? body.note : null,
          created_at: new Date().toISOString(),
        });
        setTimeout(() => setSavedOk(false), 3000);
      }
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("rounded-2xl border border-zinc-700/50 bg-zinc-900/60", isRtl && "text-end")}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex w-full items-center gap-2.5 px-5 py-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.03]",
          isRtl && "flex-row-reverse",
        )}
      >
        <Plus className="size-4 shrink-0 text-emerald-400" aria-hidden />
        {savedOk ? t.saved : t.enterMetrics}
        <ChevronDown
          className={cn("ms-auto size-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-zinc-800/60 px-5 pb-5 pt-4">
              <p className="text-[11px] leading-relaxed text-zinc-500">{t.enterMetricsHint}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { key: "conversionRate", label: t.conversionRate, placeholder: "e.g. 3.2", type: "number", step: "0.01" },
                    { key: "storeVisitors", label: t.storeVisitors, placeholder: "e.g. 14200", type: "number", step: "1" },
                    { key: "categoryRank", label: t.categoryRank, placeholder: "e.g. 12", type: "number", step: "1" },
                    { key: "searchVisibility", label: t.searchVisibility, placeholder: "e.g. 47.5", type: "number", step: "0.1" },
                  ] as const
                ).map(({ key, label, placeholder, type, step }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-zinc-400">{label}</label>
                    <input
                      type={type}
                      step={step}
                      min={0}
                      value={fields[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      placeholder={placeholder}
                      className="rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500/50"
                      dir="ltr"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-zinc-400">{t.weekNote}</label>
                <input
                  type="text"
                  value={fields.note}
                  onChange={(e) => setField("note", e.target.value)}
                  placeholder={t.weekNotePlaceholder}
                  maxLength={500}
                  className="rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500/50"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/30 transition-colors hover:bg-emerald-500/25 disabled:opacity-60"
              >
                {saving ? (
                  <><Loader2 className="size-3.5 animate-spin" aria-hidden />{t.saving}</>
                ) : (
                  <>{t.saveMetrics}<ArrowRight className="size-3.5" aria-hidden /></>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type ListingHistoryProps = {
  workspaceId: string;
  appId?: string;
  locale?: string;
  className?: string;
};

export function ListingHistory({
  workspaceId,
  appId,
  locale = "en",
  className,
}: ListingHistoryProps) {
  const isRtl = locale === "ar";
  const lang: Lang = isRtl ? "ar" : "en";
  const t = STRINGS[lang];

  const [attribution, setAttribution] = useState<AttributionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const hasFetched = useRef(false);

  const fetchAttribution = useCallback(async () => {
    if (!workspaceId || !appId) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/apps/${appId}/attribution`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as { ok: boolean; attribution?: AttributionRecord[] };
      if (json.ok) {
        setAttribution(json.attribution ?? []);
        // Auto-expand the most recent record
        if (json.attribution && json.attribution.length > 0 && !expandedId) {
          setExpandedId(json.attribution[0].snapshotId);
        }
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, appId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void fetchAttribution();
  }, [fetchAttribution]);

  function handleMetricSaved() {
    // Refetch attribution so the new metric is reflected
    hasFetched.current = false;
    void fetchAttribution();
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      className={cn("space-y-6", isRtl && "font-arabic", className)}
    >
      {/* Header */}
      <div className={cn("space-y-1", isRtl && "text-end")}>
        <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
          <BarChart2 className="size-5 shrink-0 text-zinc-400" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
            {t.heading}
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          {t.subheading}
        </p>
      </div>

      {/* ── "How Growth Tracking works" collapsible info panel ─────────────── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden">
        {/* Toggle row */}
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors",
            isRtl && "flex-row-reverse",
          )}
          aria-expanded={infoOpen}
        >
          <Info className="size-4 shrink-0 text-indigo-400" aria-hidden />
          <span className="flex-1 text-start">{t.howItWorksTitle}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-zinc-500 transition-transform duration-200",
              infoOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {/* Expandable body */}
        <AnimatePresence initial={false}>
          {infoOpen && (
            <motion.div
              key="info-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className={cn("border-t border-zinc-800/60 px-4 pb-5 pt-4 space-y-4", isRtl && "text-end")}>

                {/* Why track? */}
                <div>
                  <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400")}>
                    {t.whyTrackHeading}
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    {t.whyTrackBody}
                  </p>
                </div>

                {/* 3-step how-to */}
                <ol className={cn("space-y-2", isRtl ? "pr-0" : "pl-0")}>
                  {[t.howStep1, t.howStep2, t.howStep3].map((step, i) => (
                    <li
                      key={i}
                      className={cn("flex items-start gap-3", isRtl && "flex-row-reverse")}
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300 ring-1 ring-indigo-500/30">
                        {i + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-zinc-300">{step}</p>
                    </li>
                  ))}
                </ol>

                {/* CTA */}
                <div className={cn("flex items-center gap-2", isRtl && "flex-row-reverse")}>
                  <Zap className="size-4 shrink-0 text-amber-400" aria-hidden />
                  <p className="text-sm font-semibold text-amber-300">{t.howCta}</p>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Manual metric entry form */}
      <MetricEntryForm
        workspaceId={workspaceId}
        appId={appId}
        t={t}
        isRtl={isRtl}
        onSaved={handleMetricSaved}
      />

      {/* Timeline */}
      {loading ? (
        <div className={cn("flex items-center gap-2 text-sm text-zinc-500", isRtl && "flex-row-reverse")}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.loadingHistory}
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">{t.loadError}</p>
      ) : attribution.length === 0 ? (
        <div className={cn("rounded-2xl border border-zinc-800/50 bg-zinc-900/40 px-6 py-8 text-center", isRtl && "text-center")}>
          <Clock className="mx-auto mb-3 size-8 text-zinc-600" aria-hidden />
          <p className="text-sm font-medium text-zinc-400">{t.noSnapshots}</p>
          <p className="mt-1 text-xs text-zinc-600">{t.noSnapshotsHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {attribution.map((record) => (
              <AttributionCard
                key={record.snapshotId}
                record={record}
                isExpanded={expandedId === record.snapshotId}
                onToggle={() =>
                  setExpandedId((prev) =>
                    prev === record.snapshotId ? null : record.snapshotId,
                  )
                }
                t={t}
                isRtl={isRtl}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
