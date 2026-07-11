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
  Circle,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ISO Monday (YYYY-MM-DD) for the week containing `date`. */
function isoMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatMetricWeekLabel(week: string, isRtl: boolean): string {
  const d = new Date(`${week}T00:00:00Z`);
  return d.toLocaleDateString(isRtl ? "ar-SA" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function suggestedBaselineMonday(snapshotIso: string): string {
  const snap = new Date(snapshotIso);
  snap.setUTCDate(snap.getUTCDate() - 7);
  return isoMondayOfWeek(snap);
}

function suggestedPostMonday(snapshotIso: string): string {
  return isoMondayOfWeek(new Date(snapshotIso));
}

type ReadinessFieldId =
  | "conversionRate"
  | "storeVisitors"
  | "categoryRank"
  | "searchVisibility"
  | "costPerInstall";

type ReadinessField = {
  id: ReadinessFieldId;
  label: string;
  required: boolean;
  hasBaseline: boolean;
  hasPost: boolean;
  deltaReady: boolean;
  gapKey: string;
  gapParams?: Record<string, string>;
};

type AttributionReadiness = {
  baselineWeekLogged: boolean;
  postWeekLogged: boolean;
  suggestedBaselineWeek: string;
  suggestedPostWeek: string;
  daysSinceChange: number;
  waitPeriodComplete: boolean;
  waitDaysRemaining: number;
  fields: ReadinessField[];
  checklistDone: number;
  checklistTotal: number;
  percentComplete: number;
  topGapKey: string;
  topGapParams: Record<string, string>;
};

function buildAttributionReadiness(
  record: AttributionRecord,
  t: Record<string, string>,
): AttributionReadiness {
  const baseline = record.baselineMetrics;
  const post = record.postMetrics;
  const delta = record.performanceDelta;
  const suggestedBaselineWeek = suggestedBaselineMonday(record.createdAt);
  const suggestedPostWeek = suggestedPostMonday(record.createdAt);
  const daysSinceChange = Math.floor(
    (Date.now() - new Date(record.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const waitPeriodComplete = daysSinceChange >= 7;
  const waitDaysRemaining = Math.max(0, 7 - daysSinceChange);

  const fieldDefs: Array<{
    id: ReadinessFieldId;
    label: string;
    required: boolean;
    baselineVal: number | null | undefined;
    postVal: number | null | undefined;
    deltaVal: string;
  }> = [
    {
      id: "conversionRate",
      label: t.conversionChange,
      required: true,
      baselineVal: baseline?.conversionRate,
      postVal: post?.conversionRate,
      deltaVal: delta.conversionRateChange,
    },
    {
      id: "storeVisitors",
      label: t.visitorsChange,
      required: true,
      baselineVal: baseline?.storeVisitors,
      postVal: post?.storeVisitors,
      deltaVal: delta.storeVisitorsChange,
    },
    {
      id: "categoryRank",
      label: t.rankChange,
      required: false,
      baselineVal: baseline?.categoryRank,
      postVal: post?.categoryRank,
      deltaVal: delta.rankShift,
    },
    {
      id: "searchVisibility",
      label: t.visibilityChange,
      required: false,
      baselineVal: baseline?.searchVisibility,
      postVal: post?.searchVisibility,
      deltaVal: delta.searchVisibilityChange,
    },
    {
      id: "costPerInstall",
      label: t.cpiChange,
      required: false,
      baselineVal: baseline?.costPerInstall,
      postVal: post?.costPerInstall,
      deltaVal: delta.costPerInstallChange,
    },
  ];

  const fields: ReadinessField[] = fieldDefs.map((f) => {
    const hasBaseline = f.baselineVal != null;
    const hasPost = f.postVal != null;
    const deltaReady = f.deltaVal !== "—" && f.deltaVal !== "unchanged";

    let gapKey = "gapFieldBothWeeks";
    const gapParams: Record<string, string> = { field: f.label };

    if (!baseline && !post) {
      gapKey = "gapNoWeeks";
    } else if (!baseline) {
      gapKey = "gapBaselineWeek";
      gapParams.week = formatMetricWeekLabel(suggestedBaselineWeek, false);
    } else if (!post) {
      gapKey = "gapPostWeek";
      gapParams.week = formatMetricWeekLabel(suggestedPostWeek, false);
    } else if (!hasBaseline && hasPost) {
      gapKey = "gapFieldBaseline";
      gapParams.field = f.label;
      gapParams.week = formatMetricWeekLabel(baseline.week, false);
    } else if (hasBaseline && !hasPost) {
      gapKey = "gapFieldPost";
      gapParams.field = f.label;
      gapParams.week = formatMetricWeekLabel(post.week, false);
    } else if (!hasBaseline && !hasPost) {
      gapKey = "gapFieldBoth";
      gapParams.field = f.label;
    }

    return {
      id: f.id,
      label: f.label,
      required: f.required,
      hasBaseline,
      hasPost,
      deltaReady,
      gapKey,
      gapParams,
    };
  });

  const checklist = [
    { done: !!baseline, key: "checkBaselineWeek", params: { week: formatMetricWeekLabel(suggestedBaselineWeek, false) } },
    { done: !!post, key: "checkPostWeek", params: { week: formatMetricWeekLabel(suggestedPostWeek, false) } },
    { done: fields.find((f) => f.id === "conversionRate")?.deltaReady ?? false, key: "checkConversion", params: {} },
    { done: fields.find((f) => f.id === "storeVisitors")?.deltaReady ?? false, key: "checkVisitors", params: {} },
    { done: waitPeriodComplete, key: waitPeriodComplete ? "checkWaitDone" : "checkWaitPending", params: { days: String(waitDaysRemaining) } },
  ];

  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;
  const percentComplete = Math.round((checklistDone / checklistTotal) * 100);

  const topPending = checklist.find((c) => !c.done) ?? checklist[0];

  return {
    baselineWeekLogged: !!baseline,
    postWeekLogged: !!post,
    suggestedBaselineWeek,
    suggestedPostWeek,
    daysSinceChange,
    waitPeriodComplete,
    waitDaysRemaining,
    fields,
    checklistDone,
    checklistTotal,
    percentComplete,
    topGapKey: topPending.key,
    topGapParams: topPending.params,
  };
}

function applyGapTemplate(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );
}

function formatAppDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MetricEntry = {
  id: string;
  metric_week: string;
  conversion_rate: number | null;
  store_visitors: number | null;
  category_rank: number | null;
  search_visibility: number | null;
  cost_per_install: number | null;
  note: string | null;
  created_at: string;
};

type PerformanceDelta = {
  conversionRateChange: string;
  searchVisibilityChange: string;
  rankShift: string;
  storeVisitorsChange: string;
  costPerInstallChange: string;
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
    costPerInstall: number | null;
  } | null;
  postMetrics: {
    week: string;
    conversionRate: number | null;
    storeVisitors: number | null;
    categoryRank: number | null;
    searchVisibility: number | null;
    costPerInstall: number | null;
  } | null;
  performanceDelta: PerformanceDelta;
  attributionAnalysis: string;
  nextStep: string;
  verdict: "success" | "needs_adjustment" | "pending";
  metricsStatus: "none" | "partial" | "comparable";
};

// ── i18n strings (EN + AR) ────────────────────────────────────────────────────

type Lang = "en" | "ar";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    // ── Section header ──────────────────────────────────────────────────────
    heading: "Did your listing change work?",
    subheading: "Log numbers from Play Console. We compare the week before vs after each listing you generated.",
    youLogLabel: "You log",
    youLogDesc: "Weekly conversion rate & store visitors (from Play Console).",
    youGetLabel: "You get",
    youGetDesc: "Before/after change, plain-English summary, and what to try next.",

    // ── "How it works" info panel ───────────────────────────────────────────
    howItWorksTitle: "How this works",
    howItWorksToggleShow: "How it works",
    howItWorksToggleHide: "Hide",
    whyTrackHeading: "Why track performance?",
    whyTrackBody: "ASO is about testing, not guessing — every listing change is an experiment with a measurable outcome. This tool bridges the gap between your listing updates and your real-world store analytics so you know exactly what moved the needle.",
    howStep1: "Make an update — generate a new listing with review issues or keyword signals active.",
    howStep2: "Wait 7–14 days — give the Play Store algorithm time to index your changes and stabilise rankings.",
    howStep3: "Log your metrics — copy Conversion rate and Store visitors from Play Console; add Cost per install if you run UAC (weekly spend ÷ installers).",
    howCta: "Understand exactly what drives your downloads.",

    // ── Metric entry form ───────────────────────────────────────────────────
    enterMetrics: "Log Play Console numbers",
    enterMetricsHint: "Play Console → Acquire users → Store listing analytics",
    enterMetricsTooltip:
      "Log this week's Play Console numbers so Growth Tracking can compare before vs after your listing change.",
    enterMetricsGuide:
      "Open Google Play Console → your app → Acquire users → Store listing analytics. Copy Conversion rate and Store visitors (optional: category rank, search visibility). For paid campaigns, enter Cost per install = weekly UAC spend ÷ installers. Paste values here, then Save. Wait 7–14 days after each listing unlock before comparing weeks.",
    conversionRate: "Conversion Rate (%)",
    storeVisitors: "Store Visitors",
    categoryRank: "Category Rank",
    searchVisibility: "Search Visibility (0–100)",
    costPerInstall: "Cost Per Install (optional)",
    costPerInstallHint: "Weekly UAC spend ÷ installers (e.g. $1.42)",
    costPerInstallTooltip:
      "Divide your Google Ads / UAC weekly spend by installer count. Lower CPI after a listing change signals better paid efficiency.",
    metricWeek: "Week (Monday)",
    metricWeekHint: "Pick the Monday for this week's data. For CPI baseline, choose a week before your listing change.",
    baselineWeekCta: "Log a baseline week (before your listing change) with CPI to unlock the delta.",
    partialDeltaHint: "Deltas need two weeks — a baseline (before) and post-optimization (after) with the same fields.",
    timelineHeading: "Your listing experiments",
    timelineSubheading: "Each card is one AI listing you generated. Open a card to see before vs after once you log two weeks.",
    forApp: "App · {name}",
    experimentCardTitle: "Listing change · {date}",
    storeTitleUsed: "Store title tested",
    listingTitleLabel: "Store title at generation",
    noMetricsSaved: "No weeks logged yet.",
    metricsSavedCount: "{count} week(s) saved",
    dataReadiness: "What to log next",
    readinessPercent: "{percent}% of checklist done",
    readinessPlaySource: "Source: Play Console → Acquire users → Store listing analytics",
    requiredMetric: "Required",
    optionalMetric: "Optional",
    gapNoWeeks: "Log baseline and post weeks to start attribution",
    gapBaselineWeek: "Log baseline week (before listing change) — e.g. {week}",
    gapPostWeek: "Log post-optimization week (on/after change) — e.g. {week}",
    gapFieldBaseline: "Add {field} to baseline week ({week})",
    gapFieldPost: "Add {field} to post week ({week})",
    gapFieldBoth: "Add {field} to both baseline and post weeks",
    gapFieldBothWeeks: "Log {field} in baseline and post weeks to compare",
    checkBaselineWeek: "Baseline week (before change) — target {week}",
    checkPostWeek: "Post week (after change) — target {week}",
    checkConversion: "Conversion rate in both weeks",
    checkVisitors: "Store visitors in both weeks",
    checkWaitDone: "7-day indexing window elapsed",
    checkWaitPending: "Wait {days} more day(s) for Play Store indexing (7–14 days recommended)",
    baselineMissingCard: "Baseline not logged",
    baselineMissingHint: "Log the week before your listing change. Suggested Monday: {week}",
    postMissingCard: "Post week not logged",
    postMissingHint: "Log a week on or after your listing change. Suggested Monday: {week}",
    pendingInput: "Pending input",
    loggedValue: "Logged",
    noAiBadge: "Rule-based · no AI credits",
    weekNote: "Note (optional)",
    weekNotePlaceholder: "e.g. ran a promotion this week",
    saveMetrics: "Save Metrics",
    saving: "Saving…",
    saved: "Saved",
    metricsSavedToast: "Metrics saved for this week.",

    // ── Attribution alert banner ────────────────────────────────────────────
    alertTitle: "Your last optimisation is working! 🎉",
    alertBody: "The Attribution Engine detected a {metric} improvement of {delta} since your listing update. Check the card below for the full breakdown.",
    alertMetricConversion: "conversion rate",
    alertMetricVisibility: "search visibility",
    alertMetricVisitors: "store visitor",
    alertDismiss: "Dismiss",

    // ── Timeline / cards ────────────────────────────────────────────────────
    noSnapshots: "No listing generations yet.",
    noSnapshotsHint: "Generate a listing first — then log Play Console numbers to measure results.",
    generatedOn: "Changed on",
    signals: "Signals used",
    reviewSignals: "Review Issues",
    marketSignals: "Market Keywords",
    noSignals: "No extra signals — standard generation",
    strategy: "Strategy",
    asoScore: "ASO Score",
    toneStyle: "Tone",
    verdictSuccess: "Working",
    verdictNeedsAdjustment: "Needs tweak",
    verdictPending: "Awaiting input",
    verdictPartial: "Incomplete",
    performanceDelta: "Before vs after",
    performanceDeltaHint: "Fills in when you log the same fields for two weeks.",
    conversionChange: "Conversion Rate",
    visibilityChange: "Search Visibility",
    rankChange: "Category Rank",
    visitorsChange: "Store Visitors",
    cpiChange: "Cost Per Install",
    attribution: "What changed & why",
    nextStep: "What to do next",
    baseline: "Before change",
    postOptimization: "After change",
    noData: "—",
    enterDataNudge: "Log Play Console numbers above to unlock this section.",
    expandDetails: "View details",
    collapseDetails: "Hide",
    metricsHistory: "Weeks you've logged",
    week: "Week",
    loadingHistory: "Loading…",
    loadError: "Could not load history. Try refreshing.",
    tone_professional: "Professional",
    tone_friendly: "Friendly",
    tone_bold: "Bold",
    tone_minimal: "Minimal",
    qualityMaximum: "All signals active",
    qualityPartial: "Partial signals",
    pendingInput: "Pending input",
  },
  ar: {
    heading: "هل نجح تغيير قائمتك؟",
    subheading: "سجّل أرقام Play Console. نقارن الأسبوع قبل وبعد كل قائمة أنشأتها.",
    youLogLabel: "أنت تُدخل",
    youLogDesc: "معدل التحويل وزوار المتجر أسبوعياً (من Play Console).",
    youGetLabel: "تحصل على",
    youGetDesc: "مقارنة قبل/بعد، ملخص واضح، والخطوة التالية.",
    howItWorksTitle: "كيف يعمل",
    howItWorksToggleShow: "كيف يعمل؟",
    howItWorksToggleHide: "إخفاء",
    whyTrackHeading: "لماذا تتبع الأداء؟",
    whyTrackBody: "تحسين ASO يعتمد على التجريب لا التخمين — كل تعديل على قائمتك تجربة بقياس واضح.",
    howStep1: "أجرِ تحديثاً — أنشئ قائمة جديدة مع إشارات المراجعات أو الكلمات المفتاحية.",
    howStep2: "انتظر 7–14 يوماً — امنح Play Store وقتاً لفهرسة التغييرات.",
    howStep3: "سجّل الأرقام — انسخ معدل التحويل وزوار المتجر من Play Console.",
    howCta: "اعرف ما الذي يُحرّك تنزيلاتك.",
    enterMetrics: "سجّل أرقام Play Console",
    enterMetricsHint: "Play Console ← اكتساب المستخدمين ← تحليلات قائمة المتجر",
    enterMetricsTooltip: "سجّل أرقام هذا الأسبوع لمقارنة ما قبل وما بعد تغيير القائمة.",
    enterMetricsGuide:
      "افتح Play Console → تطبيقك → اكتساب المستخدمين → تحليلات قائمة المتجر. انسخ معدل التحويل وزوار المتجر. للحملات المدفوعة: تكلفة التثبيت = إنفاق UAC ÷ التثبيتات.",
    conversionRate: "معدل التحويل (%)",
    storeVisitors: "زوار صفحة المتجر",
    categoryRank: "مرتبة الفئة",
    searchVisibility: "مؤشر الظهور (0–100)",
    costPerInstall: "تكلفة التثبيت (اختياري)",
    costPerInstallHint: "إنفاق UAC ÷ التثبيتات (مثال: 1.42$)",
    costPerInstallTooltip: "اقسم إنفاق UAC الأسبوعي على التثبيتات.",
    metricWeek: "الأسبوع (الاثنين)",
    metricWeekHint: "اختر الاثنين. لخط الأساس، اختر أسبوعاً قبل تغيير القائمة.",
    baselineWeekCta: "سجّل أسبوعاً قبل التغيير لفتح الفروقات.",
    partialDeltaHint: "تحتاج أسبوعين بنفس الحقول — قبل وبعد.",
    timelineHeading: "تجارب القائمة",
    timelineSubheading: "كل بطاقة = قائمة AI أنشأتها. افتح البطاقة لمشاهدة قبل/بعد عند تسجيل أسبوعين.",
    forApp: "التطبيق · {name}",
    experimentCardTitle: "تغيير القائمة · {date}",
    storeTitleUsed: "عنوان المتجر المُختبَر",
    listingTitleLabel: "عنوان المتجر عند التوليد",
    noMetricsSaved: "لا أسابيع مسجّلة بعد.",
    metricsSavedCount: "{count} أسبوع/أسابيع محفوظة",
    dataReadiness: "ما الذي تُدخله بعد",
    readinessPercent: "{percent}% من القائمة مكتمل",
    readinessPlaySource: "المصدر: Play Console → اكتساب المستخدمين → تحليلات القائمة",
    requiredMetric: "مطلوب",
    optionalMetric: "اختياري",
    gapNoWeeks: "سجّل أسبوعين — قبل وبعد التغيير",
    gapBaselineWeek: "سجّل الأسبوع قبل التغيير — مثال: {week}",
    gapPostWeek: "سجّل الأسبوع بعد التغيير — مثال: {week}",
    gapFieldBaseline: "أضف {field} لأسبوع ما قبل ({week})",
    gapFieldPost: "أضف {field} لأسبوع ما بعد ({week})",
    gapFieldBoth: "أضف {field} للأسبوعين",
    gapFieldBothWeeks: "سجّل {field} في الأسبوعين للمقارنة",
    checkBaselineWeek: "أسبوع قبل التغيير — الهدف {week}",
    checkPostWeek: "أسبوع بعد التغيير — الهدف {week}",
    checkConversion: "معدل التحويل في الأسبوعين",
    checkVisitors: "زوار المتجر في الأسبوعين",
    checkWaitDone: "مرّت 7 أيام للفهرسة",
    checkWaitPending: "انتظر {days} يوم/أيام إضافية (يُوصى بـ 7–14)",
    baselineMissingCard: "قبل التغيير — غير مسجّل",
    baselineMissingHint: "سجّل الأسبوع قبل تغيير القائمة. الاثنين المقترح: {week}",
    postMissingCard: "بعد التغيير — غير مسجّل",
    postMissingHint: "سجّل أسبوعاً عند أو بعد التغيير. الاثنين المقترح: {week}",
    pendingInput: "بانتظار الإدخال",
    loggedValue: "مسجّل",
    noAiBadge: "تحليل تلقائي · بدون رصيد AI",
    weekNote: "ملاحظة (اختياري)",
    weekNotePlaceholder: "مثال: عرض ترويجي هذا الأسبوع",
    saveMetrics: "حفظ",
    saving: "جاري الحفظ…",
    saved: "تم الحفظ",
    metricsSavedToast: "تم حفظ الأرقام.",
    alertTitle: "تحسينك يعمل! 🎉",
    alertBody: "تحسّن {metric} بمقدار {delta} منذ آخر تغيير. التفاصيل في البطاقة أدناه.",
    alertMetricConversion: "معدل التحويل",
    alertMetricVisibility: "الظهور في البحث",
    alertMetricVisitors: "زوار المتجر",
    alertDismiss: "إغلاق",
    noSnapshots: "لا قوائم مُولَّدة بعد.",
    noSnapshotsHint: "أنشئ قائمة أولاً — ثم سجّل أرقام Play Console.",
    generatedOn: "تاريخ التغيير",
    signals: "الإشارات",
    reviewSignals: "مشكلات المراجعات",
    marketSignals: "كلمات السوق",
    noSignals: "بدون إشارات إضافية",
    strategy: "الاستراتيجية",
    asoScore: "درجة ASO",
    toneStyle: "الأسلوب",
    verdictSuccess: "يعمل",
    verdictNeedsAdjustment: "يحتاج تعديل",
    verdictPending: "بانتظار الإدخال",
    verdictPartial: "غير مكتمل",
    performanceDelta: "قبل مقابل بعد",
    performanceDeltaHint: "يُملأ عند تسجيل نفس الحقول لأسبوعين.",
    conversionChange: "معدل التحويل",
    visibilityChange: "الظهور في البحث",
    rankChange: "مرتبة الفئة",
    visitorsChange: "زوار المتجر",
    cpiChange: "تكلفة التثبيت",
    attribution: "ماذا تغيّر ولماذا",
    nextStep: "ماذا تفعل بعد",
    baseline: "قبل التغيير",
    postOptimization: "بعد التغيير",
    noData: "—",
    enterDataNudge: "سجّل أرقام Play Console أعلاه لفتح هذا القسم.",
    expandDetails: "عرض التفاصيل",
    collapseDetails: "إخفاء",
    metricsHistory: "الأسابيع المسجّلة",
    week: "الأسبوع",
    loadingHistory: "جاري التحميل…",
    loadError: "تعذّر التحميل. حاول التحديث.",
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
  metricsStatus,
  t,
}: {
  verdict: AttributionRecord["verdict"];
  metricsStatus: AttributionRecord["metricsStatus"];
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
  if (verdict === "pending" && metricsStatus === "partial") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300 ring-1 ring-sky-500/25">
        <Clock className="size-3 shrink-0" aria-hidden />
        {t.verdictPartial}
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

function MetricDeltaCell({
  label,
  value,
  gapText,
  required = false,
  isRank = false,
  isCpi = false,
  isRtl = false,
  t,
}: {
  label: string;
  value: string;
  gapText?: string;
  required?: boolean;
  isRank?: boolean;
  isCpi?: boolean;
  isRtl?: boolean;
  t: Record<string, string>;
}) {
  const isNeutral = value === "—" || value === "unchanged";

  if (isNeutral && gapText) {
    return (
      <div className={cn("flex flex-col gap-1", isRtl && "items-end")}>
        <div className={cn("flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
              required ? "bg-amber-500/15 text-amber-300" : "bg-zinc-700/50 text-zinc-500",
            )}
          >
            {required ? t.requiredMetric : t.optionalMetric}
          </span>
        </div>
        <p className="text-[11px] font-medium text-amber-300/90">{t.pendingInput}</p>
        <p className="text-[10px] leading-relaxed text-zinc-500">{gapText}</p>
      </div>
    );
  }

  return <DeltaCell label={label} value={value} isRank={isRank} isCpi={isCpi} isRtl={isRtl} />;
}

function DataReadinessPanel({
  readiness,
  t,
  isRtl,
  compact = false,
}: {
  readiness: AttributionReadiness;
  t: Record<string, string>;
  isRtl: boolean;
  compact?: boolean;
}) {
  const checklist = [
    { done: readiness.baselineWeekLogged, key: "checkBaselineWeek", params: { week: formatMetricWeekLabel(readiness.suggestedBaselineWeek, isRtl) } },
    { done: readiness.postWeekLogged, key: "checkPostWeek", params: { week: formatMetricWeekLabel(readiness.suggestedPostWeek, isRtl) } },
    { done: readiness.fields.find((f) => f.id === "conversionRate")?.deltaReady ?? false, key: "checkConversion", params: {} },
    { done: readiness.fields.find((f) => f.id === "storeVisitors")?.deltaReady ?? false, key: "checkVisitors", params: {} },
    { done: readiness.waitPeriodComplete, key: readiness.waitPeriodComplete ? "checkWaitDone" : "checkWaitPending", params: { days: String(readiness.waitDaysRemaining) } },
  ];

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/20 bg-amber-500/5",
        compact ? "px-3 py-2.5" : "p-4",
        isRtl && "text-end",
      )}
    >
      <div className={cn("mb-2 flex flex-wrap items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
          {t.dataReadiness}
        </p>
        <p className="text-[10px] font-medium text-amber-200/70">
          {t.readinessPercent.replace("{percent}", String(readiness.percentComplete))}
        </p>
      </div>

      {!compact && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-amber-400/80 transition-all"
            style={{ width: `${readiness.percentComplete}%` }}
          />
        </div>
      )}

      <ul className={cn("space-y-1.5", compact && "space-y-1")}>
        {checklist.map((item) => (
          <li
            key={item.key}
            className={cn("flex items-start gap-2 text-[11px] leading-relaxed", isRtl && "flex-row-reverse")}
          >
            {item.done ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-zinc-600" aria-hidden />
            )}
            <span className={item.done ? "text-zinc-400 line-through" : "text-zinc-300"}>
              {applyGapTemplate(t[item.key] ?? item.key, item.params)}
            </span>
          </li>
        ))}
      </ul>

      {!compact && (
        <p className="mt-3 text-[10px] text-zinc-500">{t.readinessPlaySource}</p>
      )}
    </div>
  );
}

function WeekSnapshotCard({
  kind,
  week,
  metrics,
  missing,
  missingHint,
  t,
  isRtl,
}: {
  kind: "baseline" | "post";
  week?: string;
  metrics?: AttributionRecord["baselineMetrics"];
  missing?: boolean;
  missingHint?: string;
  t: Record<string, string>;
  isRtl: boolean;
}) {
  const title = kind === "baseline" ? t.baseline : t.postOptimization;

  if (missing) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">{title}</p>
        <p className="text-[11px] font-medium text-amber-200/90">
          {kind === "baseline" ? t.baselineMissingCard : t.postMissingCard}
        </p>
        {missingHint ? (
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{missingHint}</p>
        ) : null}
      </div>
    );
  }

  if (!metrics || !week) return null;

  const rows = [
    metrics.conversionRate != null ? `${t.conversionChange}: ${metrics.conversionRate.toFixed(1)}%` : null,
    metrics.storeVisitors != null ? `${t.visitorsChange}: ${metrics.storeVisitors.toLocaleString()}` : null,
    metrics.searchVisibility != null ? `${t.visibilityChange}: ${metrics.searchVisibility.toFixed(1)}` : null,
    metrics.categoryRank != null ? `${t.rankChange}: #${metrics.categoryRank}` : null,
    metrics.costPerInstall != null ? `${t.cpiChange}: $${metrics.costPerInstall.toFixed(2)}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
      <p className="text-[11px] text-zinc-400">{t.week}: {formatMetricWeekLabel(week, isRtl)}</p>
      {rows.length > 0 ? (
        rows.map((row) => (
          <p key={row} className="text-[11px] text-zinc-300">{row}</p>
        ))
      ) : (
        <p className="text-[10px] italic text-zinc-600">{t.gapNoWeeks}</p>
      )}
    </div>
  );
}

function MetricValueCell({
  label,
  value,
  isRtl = false,
}: {
  label: string;
  value: string;
  isRtl?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", isRtl && "items-end")}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-zinc-300">{value}</p>
    </div>
  );
}

function DeltaCell({
  label,
  value,
  isRank = false,
  isCpi = false,
  isRtl = false,
}: {
  label: string;
  value: string;
  isRank?: boolean;
  isCpi?: boolean;
  isRtl?: boolean;
}) {
  const isImprovement =
    value.startsWith("+") ||
    value.startsWith("↑") ||
    (isCpi && (value.startsWith("−") || value.startsWith("-")));
  const isRegression =
    isRank
      ? value.startsWith("↓")
      : isCpi
        ? value.startsWith("+")
        : value.startsWith("-") || value.startsWith("↓");
  const isNeutral = value === "—" || value === "unchanged";

  const showIcon = !isNeutral;
  const Icon = isImprovement ? TrendingUp : isRegression ? TrendingDown : null;
  const iconColor = isImprovement ? "text-emerald-400" : "text-rose-400";

  return (
    <div className={cn("flex flex-col gap-0.5", isRtl && "items-end")}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={cn(
          "flex items-center gap-1 text-sm font-semibold tabular-nums",
          isRtl && "flex-row-reverse",
          isNeutral && "text-zinc-500",
          !isNeutral && (isImprovement ? "text-emerald-400" : isRegression ? "text-rose-400" : "text-zinc-300"),
        )}
      >
        {showIcon && Icon && (
          <Icon className={cn("inline size-3.5 shrink-0", iconColor)} aria-hidden />
        )}
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
  const metricsStatus =
    record.metricsStatus ??
    (record.postMetrics || record.baselineMetrics ? "partial" : "none");
  const readiness = buildAttributionReadiness(record, t);

  const deltaFields = readiness.fields.map((field) => {
    const deltaVal =
      field.id === "conversionRate"
        ? record.performanceDelta.conversionRateChange
        : field.id === "storeVisitors"
          ? record.performanceDelta.storeVisitorsChange
          : field.id === "categoryRank"
            ? record.performanceDelta.rankShift
            : field.id === "searchVisibility"
              ? record.performanceDelta.searchVisibilityChange
              : record.performanceDelta.costPerInstallChange;

    const gapText = field.deltaReady
      ? undefined
      : applyGapTemplate(t[field.gapKey] ?? field.gapKey, field.gapParams ?? {});

    return {
      ...field,
      deltaVal,
      gapText,
      isRank: field.id === "categoryRank",
      isCpi: field.id === "costPerInstall",
    };
  });

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
            <VerdictBadge verdict={record.verdict} metricsStatus={metricsStatus} t={t} />
            {record.qualityStatus === "maximum" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400/80 ring-1 ring-emerald-500/20">
                <Sparkles className="size-2.5 shrink-0" aria-hidden />
                {t.qualityMaximum}
              </span>
            )}
          </div>
          <p className={cn("text-sm font-semibold text-zinc-100 leading-snug", isRtl && "text-end")}>
            {applyGapTemplate(t.experimentCardTitle, { date: dateLabel })}
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            <span className="text-zinc-500">{t.storeTitleUsed}: </span>
            &ldquo;{record.title}&rdquo;
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

          {/* Delta summary row — only when at least one delta is ready */}
          {deltaFields.some((f) => f.deltaReady) && (
            <div className={cn("flex flex-wrap gap-4 pt-1", isRtl && "flex-row-reverse")}>
              {deltaFields
                .filter((f) => f.deltaReady)
                .map((f) => (
                  <MetricDeltaCell
                    key={f.id}
                    label={f.label}
                    value={f.deltaVal}
                    required={f.required}
                    isRank={f.isRank}
                    isCpi={f.isCpi}
                    isRtl={isRtl}
                    t={t}
                  />
                ))}
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
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {t.performanceDelta}
                </p>
                <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">{t.performanceDeltaHint}</p>
                <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", isRtl && "text-end")}>
                  {deltaFields.map((f) => {
                    const postOnlyVal =
                      !f.deltaReady && f.hasPost && !f.hasBaseline
                        ? f.id === "conversionRate" && record.postMetrics?.conversionRate != null
                          ? `${record.postMetrics.conversionRate.toFixed(1)}%`
                          : f.id === "storeVisitors" && record.postMetrics?.storeVisitors != null
                            ? record.postMetrics.storeVisitors.toLocaleString()
                            : f.id === "categoryRank" && record.postMetrics?.categoryRank != null
                              ? `#${record.postMetrics.categoryRank}`
                              : f.id === "searchVisibility" && record.postMetrics?.searchVisibility != null
                                ? `${record.postMetrics.searchVisibility.toFixed(1)}`
                                : f.id === "costPerInstall" && record.postMetrics?.costPerInstall != null
                                  ? `$${record.postMetrics.costPerInstall.toFixed(2)}`
                                  : null
                        : null;

                    return (
                      <div key={f.id} className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3">
                        {f.deltaReady ? (
                          <MetricDeltaCell
                            label={f.label}
                            value={f.deltaVal}
                            required={f.required}
                            isRank={f.isRank}
                            isCpi={f.isCpi}
                            isRtl={isRtl}
                            t={t}
                          />
                        ) : postOnlyVal ? (
                          <div className="space-y-1">
                            <MetricValueCell label={f.label} value={postOnlyVal} isRtl={isRtl} />
                            <p className="text-[10px] leading-relaxed text-zinc-500">
                              {t.loggedValue} · {f.gapText}
                            </p>
                          </div>
                        ) : (
                          <MetricDeltaCell
                            label={f.label}
                            value="—"
                            gapText={f.gapText}
                            required={f.required}
                            isRank={f.isRank}
                            isCpi={f.isCpi}
                            isRtl={isRtl}
                            t={t}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Before / After metric snapshot — always show both slots */}
              <div className={cn("grid grid-cols-2 gap-3", isRtl && "direction-rtl")}>
                <WeekSnapshotCard
                  kind="baseline"
                  week={record.baselineMetrics?.week}
                  metrics={record.baselineMetrics ?? undefined}
                  missing={!record.baselineMetrics}
                  missingHint={applyGapTemplate(t.baselineMissingHint, {
                    week: formatMetricWeekLabel(readiness.suggestedBaselineWeek, isRtl),
                  })}
                  t={t}
                  isRtl={isRtl}
                />
                <WeekSnapshotCard
                  kind="post"
                  week={record.postMetrics?.week}
                  metrics={record.postMetrics ?? undefined}
                  missing={!record.postMetrics}
                  missingHint={applyGapTemplate(t.postMissingHint, {
                    week: formatMetricWeekLabel(readiness.suggestedPostWeek, isRtl),
                  })}
                  t={t}
                  isRtl={isRtl}
                />
              </div>

              {/* Attribution analysis */}
              <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                <div className={cn("mb-2 flex flex-wrap items-center gap-2", isRtl && "flex-row-reverse")}>
                  <div className={cn("flex items-center gap-1.5", isRtl && "flex-row-reverse")}>
                    <BarChart2 className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t.attribution}</p>
                  </div>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-medium text-zinc-500">
                    {t.noAiBadge}
                  </span>
                </div>
                {metricsStatus === "none" ? (
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
    metricWeek: isoMondayOfWeek(new Date()),
    conversionRate: "",
    storeVisitors: "",
    categoryRank: "",
    searchVisibility: "",
    costPerInstall: "",
    note: "",
  });

  function setField(k: keyof typeof fields, v: string) {
    setFields((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!appId) return;
    setSaving(true);
    try {
      const body: Record<string, number | string | null> = {
        metricWeek: fields.metricWeek,
      };
      if (fields.conversionRate !== "") body.conversionRate = parseFloat(fields.conversionRate);
      if (fields.storeVisitors !== "") body.storeVisitors = parseInt(fields.storeVisitors, 10);
      if (fields.categoryRank !== "") body.categoryRank = parseInt(fields.categoryRank, 10);
      if (fields.searchVisibility !== "") body.searchVisibility = parseFloat(fields.searchVisibility);
      if (fields.costPerInstall !== "") body.costPerInstall = parseFloat(fields.costPerInstall);
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
        setFields({
          metricWeek: isoMondayOfWeek(new Date()),
          conversionRate: "",
          storeVisitors: "",
          categoryRank: "",
          searchVisibility: "",
          costPerInstall: "",
          note: "",
        });
        // Re-fetch parent
        onSaved({
          id: "",
          metric_week: fields.metricWeek,
          conversion_rate: body.conversionRate != null ? Number(body.conversionRate) : null,
          store_visitors: body.storeVisitors != null ? Number(body.storeVisitors) : null,
          category_rank: body.categoryRank != null ? Number(body.categoryRank) : null,
          search_visibility: body.searchVisibility != null ? Number(body.searchVisibility) : null,
          cost_per_install: body.costPerInstall != null ? Number(body.costPerInstall) : null,
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
        title={t.enterMetricsTooltip}
        aria-describedby="metric-entry-guide"
        className={cn(
          "group flex w-full items-center gap-2.5 px-5 py-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.03]",
          isRtl && "flex-row-reverse",
        )}
      >
        <Plus className="size-4 shrink-0 text-emerald-400" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="flex w-full items-center gap-2">
            {savedOk ? t.saved : t.enterMetrics}
            <Info
              className="size-3.5 shrink-0 text-zinc-500 opacity-70 transition group-hover:text-emerald-400/80 group-hover:opacity-100"
              aria-hidden
            />
          </span>
          <span className="text-[10px] font-normal text-zinc-500 group-hover:text-zinc-400">
            {t.enterMetricsTooltip}
          </span>
        </span>
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
              <p id="metric-entry-guide" className="text-[11px] leading-relaxed text-zinc-400">
                {t.enterMetricsGuide}
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-500">{t.enterMetricsHint}</p>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-zinc-400">{t.metricWeek}</label>
                <p className="text-[10px] leading-relaxed text-zinc-500">{t.metricWeekHint}</p>
                <input
                  type="date"
                  value={fields.metricWeek}
                  onChange={(e) => {
                    const picked = e.target.value;
                    if (!picked) return;
                    setField("metricWeek", isoMondayOfWeek(new Date(`${picked}T00:00:00Z`)));
                  }}
                  className="w-full max-w-xs rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500/50"
                  dir="ltr"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { key: "conversionRate", label: t.conversionRate, placeholder: "e.g. 3.2", type: "number", step: "0.01" },
                    { key: "storeVisitors", label: t.storeVisitors, placeholder: "e.g. 14200", type: "number", step: "1" },
                    { key: "categoryRank", label: t.categoryRank, placeholder: "e.g. 12", type: "number", step: "1" },
                    { key: "searchVisibility", label: t.searchVisibility, placeholder: "e.g. 47.5", type: "number", step: "0.1" },
                    { key: "costPerInstall", label: t.costPerInstall, placeholder: t.costPerInstallHint, type: "number", step: "0.01" },
                  ] as const
                ).map(({ key, label, placeholder, type, step }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-zinc-400">{label}</label>
                    {key === "costPerInstall" ? (
                      <p className="text-[10px] leading-relaxed text-zinc-500">{t.costPerInstallTooltip}</p>
                    ) : null}
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

// ── Saved metrics history ─────────────────────────────────────────────────────

function MetricsHistoryPanel({
  metrics,
  loading,
  t,
  isRtl,
}: {
  metrics: MetricEntry[];
  loading: boolean;
  t: Record<string, string>;
  isRtl: boolean;
}) {
  if (loading) return null;

  return (
    <div className={cn("rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4", isRtl && "text-end")}>
      <div className={cn("mb-3 flex items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {t.metricsHistory}
        </p>
        <p className="text-[10px] text-zinc-600">
          {metrics.length > 0 ? t.metricsSavedCount.replace("{count}", String(metrics.length)) : t.noMetricsSaved}
        </p>
      </div>

      {metrics.length === 0 ? (
        <p className="text-xs text-zinc-500">{t.noMetricsSaved}</p>
      ) : (
        <div className="space-y-2">
          {metrics.map((m) => (
            <div
              key={m.id || m.metric_week}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-3 py-2 text-[11px]",
                isRtl && "flex-row-reverse",
              )}
            >
              <span className="font-semibold text-zinc-300">
                {formatMetricWeekLabel(m.metric_week, isRtl)}
              </span>
              {m.conversion_rate != null && (
                <span className="text-zinc-400">{m.conversion_rate.toFixed(1)}% CVR</span>
              )}
              {m.store_visitors != null && (
                <span className="text-zinc-400">{m.store_visitors.toLocaleString()} visitors</span>
              )}
              {m.cost_per_install != null && (
                <span className="font-medium text-emerald-300/90">CPI ${m.cost_per_install.toFixed(2)}</span>
              )}
              {m.category_rank != null && (
                <span className="text-zinc-500">#{m.category_rank}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type ListingHistoryProps = {
  workspaceId: string;
  appId?: string;
  appName?: string;
  locale?: string;
  className?: string;
};

export function ListingHistory({
  workspaceId,
  appId,
  appName,
  locale = "en",
  className,
}: ListingHistoryProps) {
  const isRtl = locale === "ar";
  const lang: Lang = isRtl ? "ar" : "en";
  const t = STRINGS[lang];

  const [attribution, setAttribution] = useState<AttributionRecord[]>([]);
  const [savedMetrics, setSavedMetrics] = useState<MetricEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const hasFetched = useRef(false);

  // ── Derive attribution alert from most recent "success" record ────────────
  type AlertData = { metric: string; delta: string } | null;
  const attributionAlert = ((): AlertData => {
    if (alertDismissed) return null;
    const successRecord = attribution.find((r) => r.verdict === "success");
    if (!successRecord) return null;
    const pd = successRecord.performanceDelta;
    // Parse numeric value from strings like "+4.2%", "↑3", etc.
    function extractPct(val: string): number {
      const match = val.replace(/[↑↓+]/g, "").replace(/%/g, "").trim();
      return parseFloat(match) || 0;
    }
    // Check each metric for > 3% positive change
    const candidates: { metric: string; delta: string; magnitude: number }[] = [];
    const cr = extractPct(pd.conversionRateChange);
    if (pd.conversionRateChange.startsWith("+") || pd.conversionRateChange.startsWith("↑")) {
      if (cr >= 3) candidates.push({ metric: t.alertMetricConversion, delta: pd.conversionRateChange, magnitude: cr });
    }
    const sv = extractPct(pd.searchVisibilityChange);
    if (pd.searchVisibilityChange.startsWith("+") || pd.searchVisibilityChange.startsWith("↑")) {
      if (sv >= 3) candidates.push({ metric: t.alertMetricVisibility, delta: pd.searchVisibilityChange, magnitude: sv });
    }
    const visitors = extractPct(pd.storeVisitorsChange);
    if (pd.storeVisitorsChange.startsWith("+") || pd.storeVisitorsChange.startsWith("↑")) {
      if (visitors >= 3) candidates.push({ metric: t.alertMetricVisitors, delta: pd.storeVisitorsChange, magnitude: visitors });
    }
    // Surface the largest positive signal
    candidates.sort((a, b) => b.magnitude - a.magnitude);
    const top = candidates[0];
    if (!top) return null;
    return { metric: top.metric, delta: top.delta };
  })();

  const fetchAttribution = useCallback(async () => {
    if (!workspaceId || !appId) return;
    setLoading(true);
    setError(null);
    try {
      const [attrRes, metricsRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/apps/${appId}/attribution`, { credentials: "same-origin" }),
        fetch(`/api/workspaces/${workspaceId}/apps/${appId}/metrics`, { credentials: "same-origin" }),
      ]);
      const json = (await attrRes.json()) as {
        ok: boolean;
        attribution?: AttributionRecord[];
        error?: { message?: string };
      };
      const metricsJson = (await metricsRes.json()) as {
        ok: boolean;
        metrics?: MetricEntry[];
      };
      if (json.ok) {
        setAttribution(json.attribution ?? []);
        if (json.attribution && json.attribution.length > 0 && !expandedId) {
          setExpandedId(json.attribution[0].snapshotId);
        }
      } else {
        setError(json.error?.message ?? t.loadError);
      }
      if (metricsJson.ok) {
        setSavedMetrics(metricsJson.metrics ?? []);
      }
    } catch {
      setError(t.loadError);
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

  const formattedAppName = appName?.trim() ? formatAppDisplayName(appName) : undefined;
  const focusRecord =
    attribution.find((r) => r.snapshotId === expandedId) ?? attribution[0] ?? null;
  const focusReadiness = focusRecord ? buildAttributionReadiness(focusRecord, t) : null;
  const showTimelineReadiness =
    focusReadiness != null && focusReadiness.percentComplete < 100;

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
        <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", isRtl && "text-end")}>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">{t.youLogLabel}</p>
            <p className="text-[11px] leading-relaxed text-zinc-400">{t.youLogDesc}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-400/90">{t.youGetLabel}</p>
            <p className="text-[11px] leading-relaxed text-zinc-400">{t.youGetDesc}</p>
          </div>
        </div>
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

      <MetricsHistoryPanel
        metrics={savedMetrics}
        loading={loading}
        t={t}
        isRtl={isRtl}
      />

      {/* ── Attribution Alert Banner ─────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {attributionAlert && (
          <motion.div
            key="attribution-alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3.5",
              isRtl && "flex-row-reverse",
            )}
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
            <div className={cn("flex-1 min-w-0", isRtl && "text-end")}>
              <p className="text-sm font-semibold text-emerald-300">{t.alertTitle}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-400/70">
                {t.alertBody
                  .replace("{metric}", attributionAlert.metric)
                  .replace("{delta}", attributionAlert.delta)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAlertDismissed(true)}
              aria-label={t.alertDismiss}
              className="mt-0.5 shrink-0 text-emerald-500/60 transition-colors hover:text-emerald-400"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      {!loading && !error && attribution.length > 0 ? (
        <div className={cn("space-y-3", isRtl && "text-end")}>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-300">{t.timelineHeading}</h3>
            <p className="text-[11px] leading-relaxed text-zinc-500">{t.timelineSubheading}</p>
            {formattedAppName ? (
              <p className="text-[11px] text-zinc-500">
                {applyGapTemplate(t.forApp, { name: formattedAppName })}
              </p>
            ) : null}
          </div>
          {showTimelineReadiness && focusReadiness ? (
            <DataReadinessPanel readiness={focusReadiness} t={t} isRtl={isRtl} />
          ) : null}
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
      ) : loading ? (
        <div className={cn("flex items-center gap-2 text-sm text-zinc-500", isRtl && "flex-row-reverse")}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.loadingHistory}
        </div>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : (
        <div className={cn("rounded-2xl border border-zinc-800/50 bg-zinc-900/40 px-6 py-8 text-center", isRtl && "text-center")}>
          <Clock className="mx-auto mb-3 size-8 text-zinc-600" aria-hidden />
          <p className="text-sm font-medium text-zinc-400">{t.noSnapshots}</p>
          <p className="mt-1 text-xs text-zinc-600">{t.noSnapshotsHint}</p>
        </div>
      )}
    </div>
  );
}
