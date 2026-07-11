import type { ToneStyle } from "@/lib/types/listing";
import { buildListingVariantsTonePromptBlock } from "@/lib/listing/tone-ab-deploy-plan";
import type {
  ActiveContextStrategyMode,
  PrioritizedStagedIssue,
} from "@/lib/optimization-queue/resolve-strategy-mode";
import type { TrackedKeywordSignalInput } from "@/lib/types/listing";

export type StrategyModePromptContext = {
  strategyMode: ActiveContextStrategyMode;
  topStagedIssues: PrioritizedStagedIssue[];
  trackedKeywordSignals?: TrackedKeywordSignalInput[];
  targetArabic?: boolean;
  /** User-selected tone — keys listingVariants A/B arms when present. */
  selectedTone?: ToneStyle;
};

function modeLabels(locale: "en" | "ar", mode: ActiveContextStrategyMode) {
  if (locale === "ar") {
    return mode === "defensive"
      ? {
          modeName: "دفاعي (ضمان الجودة / الاحتفاظ)",
          goal: "معالجة نقاط ألم المستخدمين الحاليين، بناء الثقة، ورفع التحويل لدى من يقدّرون الاستقرار.",
          tone: "متعاطف، موثوق، موجّه نحو الحلول.",
        }
      : {
          modeName: "هجومي (استحواذ السوق)",
          goal: "استغلال نقاط ضعف المنافسين، خلق تباين حاد في القيمة، وسرقة حصة السوق.",
          tone: "حازم، مميّز، عالي التحويل.",
        };
  }
  return mode === "defensive"
    ? {
        modeName: "Defensive (QA / Retention)",
        goal:
          "Address existing user pain points, improve trust, and increase conversion among users who value stability.",
        tone: "Empathetic, Reliable, Solution-Oriented.",
      }
    : {
        modeName: "Offensive (Market Capture)",
        goal:
          "Exploit competitor weaknesses, create sharp value-proposition contrast, and steal market share.",
        tone: "Assertive, Differentiating, High-Conversion.",
      };
}

function formatIssueLine(issue: PrioritizedStagedIssue, locale: "en" | "ar"): string {
  const impact =
    issue.impactPercent != null && issue.impactPercent > 0
      ? locale === "ar"
        ? ` (التأثير ${issue.impactPercent}%)`
        : ` (Impact ${issue.impactPercent}%)`
      : "";
  return `${issue.label}${impact}`;
}

/** Strategy Mode block injected into the listing optimizer user prompt. */
export function buildStrategyModePromptBlock(ctx: StrategyModePromptContext): string {
  const locale = ctx.targetArabic ? "ar" : "en";
  const labels = modeLabels(locale, ctx.strategyMode);
  const issues =
    ctx.topStagedIssues.length > 0
      ? ctx.topStagedIssues.map((i) => formatIssueLine(i, locale)).join("; ")
      : locale === "ar"
        ? "(لا توجد مشكلات مُدرَجة — استخدم إشارات الطابور الأخرى)"
        : "(no staged review issues — use other queue signals)";

  const keywordPriority = [...(ctx.trackedKeywordSignals ?? [])]
    .sort((a, b) => b.confidence - a.confidence)
    .map((s) => `"${s.keyword}" (${s.confidence}% conf.)`)
    .join(", ");

  return [
    "",
    "═══════════════════════════════════════════",
    locale === "ar" ? "وضع الاستراتيجية (السياق النشط)" : "STRATEGY MODE (Active Context)",
    "═══════════════════════════════════════════",
    locale === "ar" ? `الوضع المحدد: ${labels.modeName}` : `ACTIVE MODE: ${labels.modeName}`,
    locale === "ar" ? `الهدف الأساسي: ${labels.goal}` : `PRIMARY GOAL: ${labels.goal}`,
    locale === "ar" ? `النبرة الإلزامية: ${labels.tone}` : `MANDATORY TONE: ${labels.tone}`,
    "",
    locale === "ar"
      ? `أهم 3 مشكلات مُدرَجة (حسب التأثير %): ${issues}`
      : `TOP 3 STAGED ISSUES (by Impact %): ${issues}`,
    keywordPriority
      ? locale === "ar"
        ? `أولوية الكلمات المفتاحية (ثقة المتتبع): ${keywordPriority}`
        : `KEYWORD PRIORITY (tracker confidence): ${keywordPriority}`
      : null,
    "",
    locale === "ar"
      ? "قواعد التنفيذ: لا حشو عام. كل جملة يجب أن تخدم الوضع الاستراتيجي. أولِّ مشكلات التأثير الأعلى في النص."
      : "EXECUTION RULES: No generic fluff. Every sentence must serve the Strategy Mode. Prioritize highest Impact % issues in copy.",
    "",
    locale === "ar"
      ? "المخرجات الإلزامية قبل البيانات النهائية:"
      : "MANDATORY PRE-METADATA OUTPUT (strategicRationale object):",
    locale === "ar"
      ? "1. strategicIntent — لماذا اخترت زاوية دفاعية أو هجومية."
      : "1. strategicIntent — why you chose Defensive or Offensive angle.",
    locale === "ar"
      ? "2. exploitationResolutionSummary — أهم 3 مشكلات عالجتها؛ إن كان هجومياً، اشرح كيف وضعت التطبيق مقابل فشل المنافس."
      : "2. exploitationResolutionSummary — top 3 staged issues addressed; if Offensive, how you positioned against competitor failure.",
    locale === "ar"
      ? "3. roiPrediction — كيف يستهدف هذا المحاذاة نسب التأثير لتحسين التحويل والظهور."
      : "3. roiPrediction — how this alignment targets Impact % to improve conversion and store visibility.",
    "",
    ctx.selectedTone
      ? buildListingVariantsTonePromptBlock(ctx.selectedTone)
      : locale === "ar"
        ? "أنشئ نسختين في listingVariants: aggressive (استحواذ سريع) و growth (تحويل مستدام). اجعل الحقول الجذرية title/shortDescription/fullDescription/whatsNew = نسخة aggressive."
        : "Generate TWO versions in listingVariants: aggressive (Variant A) and growth (Variant B). Set root title/shortDescription/fullDescription/whatsNew = aggressive variant values.",
  ]
    .filter(Boolean)
    .join("\n");
}
