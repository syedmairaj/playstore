import type { ListingOptimizerInput } from "@/lib/types/listing";
import { ORCHESTRATION_PROTOCOL_VERSION } from "@/lib/listing/orchestration-protocol.schema";

export type OrchestrationPromptContext = {
  targetArabic: boolean;
  lockedKeywords: string[];
  strategyMode: NonNullable<ListingOptimizerInput["strategyMode"]>;
  topReviewInsights: string[];
  primaryPainPoint?: string;
};

function profileLabels(locale: "en" | "ar") {
  if (locale === "ar") {
    return {
      defensive: "دفاعي — ضمان الجودة / الاحتفاظ",
      offensive: "هجومي — استحواذ السوق",
      primary: "الملف النشط — يطابق وضع الاستراتيجية المحدد",
    };
  }
  return {
    defensive: "Defensive — QA / Retention",
    offensive: "Offensive — Market Capture",
    primary: "Active Profile — matches selected Strategy Mode",
  };
}

/** Three-phase Orchestration Protocol — injected into system + user prompts (v16). */
export function buildOrchestrationProtocolPromptBlock(ctx: OrchestrationPromptContext): string {
  const locale = ctx.targetArabic ? "ar" : "en";
  const labels = profileLabels(locale);
  const locked = ctx.lockedKeywords.slice(0, 20).join(", ");
  const insights =
    ctx.topReviewInsights.length > 0
      ? ctx.topReviewInsights.join("; ")
      : locale === "ar"
        ? "(لا توجد مراجعات مُدرَجة — استخدم إشارات defensive)"
        : "(no staged review insights — use defensive cluster signals)";
  const pain =
    ctx.primaryPainPoint?.trim() ||
    (locale === "ar" ? "أهم نقطة ألم من المراجعات" : "top staged review pain point");
  const activeMode = ctx.strategyMode;

  return [
    "",
    "═══════════════════════════════════════════",
    locale === "ar"
      ? "بروتوكول التنسيق (Orchestration Protocol) — إلزامي"
      : "ORCHESTRATION PROTOCOL (MANDATORY — execute phases in order)",
    "═══════════════════════════════════════════",
    locale === "ar"
      ? `الإصدار: ${ORCHESTRATION_PROTOCOL_VERSION}. أرجِع كائن orchestration منفصل بالإضافة إلى الحقول الجذرية.`
      : `Version: ${ORCHESTRATION_PROTOCOL_VERSION}. Return a discrete orchestration object IN ADDITION to legacy root fields.`,
    "",
    locale === "ar" ? "المرحلة 1 — الركيزة (Anchor)" : "PHASE 1 — ANCHOR (immutable keyword anchor)",
    locale === "ar"
      ? `• أنشئ orchestration.modules.anchor: عنوان هجين ≤30 حرفاً يدمج الكلمات المقفلة [${locked}] مع 1–3 مصطلحات مقترحة بالذكاء الاصطناعي.`
      : `• Build orchestration.modules.anchor: hybrid title ≤30 chars weaving LOCKED keywords [${locked}] + 1–3 AI-suggested terms.`,
    locale === "ar"
      ? "• lockedKeywords = الكلمات المقفلة من المستخدم (لا تحذفها). aiSuggestedKeywords = ما أضافه الذكاء الاصطناعي."
      : "• lockedKeywords = user-locked seed terms (never drop). aiSuggestedKeywords = AI-woven additions.",
    locale === "ar"
      ? "• keywordAnchor = عبارة مرجعية ثابتة — المرحلتان 2 و3 يجب أن تستخدماها (لا تغيّرها بعد تعريفها)."
      : "• keywordAnchor = fixed reference phrase — phases 2 & 3 MUST honor it (immutable after definition).",
    "",
    locale === "ar" ? "المرحلة 2 — التحويل (Conversion)" : "PHASE 2 — CONVERSION (three short descriptions)",
    locale === "ar"
      ? `• أنشئ orchestration.modules.conversion.shortVariations — بالضبط 3 عناصر:`
      : `• Build orchestration.modules.conversion.shortVariations — EXACTLY 3 items:`,
    `  1. variationId "defensive" — profileLabel "${labels.defensive}" — ≤80 chars, addresses pain/trust.`,
    `  2. variationId "offensive" — profileLabel "${labels.offensive}" — ≤80 chars, contrast vs rivals.`,
    `  3. variationId "primary" — profileLabel "${labels.primary}" — ≤80 chars, active mode = ${activeMode}.`,
    locale === "ar"
      ? `• كل variation يتضمن rationale يشرح كيف استخدم أهم الرؤى: ${insights}`
      : `• Each variation includes rationale explaining use of top review insights: ${insights}`,
    locale === "ar"
      ? `• selectedVariationId = "primary" عندما activeStrategyProfile = ${activeMode}.`
      : `• selectedVariationId = "primary"; activeStrategyProfile = ${activeMode}.`,
    "",
    locale === "ar" ? "المرحلة 3 — التوسع (Expansion)" : "PHASE 3 — EXPANSION (structured long description)",
    locale === "ar"
      ? `• أنشئ orchestration.modules.expansion.blocks:`
      : `• Build orchestration.modules.expansion.blocks:`,
    locale === "ar"
      ? `  Block A (hook): يعالج نقطة الألم #1 "${pain}" — opening promise.`
      : `  Block A (hook): MUST address #1 pain point "${pain}" — opening promise.`,
    locale === "ar"
      ? "  Block B (features): فئات مع نقاط emoji غنية — كل فئة من إشارات السياق النشط (offensive/defensive/market)."
      : "  Block B (features): categorized emoji-rich bullets — each category from active context clusters.",
    locale === "ar"
      ? "  Block C (trustClosing): خاتمة مهنية موثوقة + cta واضح."
      : "  Block C (trustClosing): professional authoritative close + clear cta.",
    locale === "ar"
      ? "• assembledFullDescription = النص الكامل المُجمَّع من A+B+C (≤4000). keywordAnchor يطابق المرحلة 1."
      : "• assembledFullDescription = full joined copy from A+B+C (≤4000). keywordAnchor MUST match phase 1.",
    "",
    locale === "ar"
      ? "مزامنة الجذر: title = anchor.title؛ shortDescription = variation primary؛ fullDescription = assembledFullDescription."
      : "ROOT SYNC: title = anchor.title; shortDescription = primary variation; fullDescription = assembledFullDescription.",
    locale === "ar"
      ? "كل module يحمل moduleId (anchor | conversion | expansion) للتعديل/إعادة التوليد المستقل في الواجهة."
      : "Each module carries moduleId (anchor | conversion | expansion) for independent UI edit/regenerate.",
  ].join("\n");
}

export type OrchestrationModuleId = "anchor" | "conversion" | "expansion";

/** Short English instruction for scoped module regenerate (client merges preserved modules). */
export function buildRegenerateOrchestrationModuleInstruction(
  moduleId: OrchestrationModuleId,
): string {
  const phase =
    moduleId === "anchor"
      ? "Phase 1 Anchor (hybrid title + keywordAnchor)"
      : moduleId === "conversion"
        ? "Phase 2 Conversion (three short variations)"
        : "Phase 3 Expansion (hook / features / trustClosing blocks)";
  return [
    `Regenerate ONLY orchestration.modules.${moduleId} per Orchestration Protocol ${phase}.`,
    "Return the full Play listing JSON including orchestration.",
    "Other orchestration modules may be omitted — the client preserves them.",
    moduleId === "anchor"
      ? "Ensure root title matches anchor.title."
      : moduleId === "conversion"
        ? "Ensure root shortDescription matches the primary selected variation."
        : "Ensure root fullDescription matches expansion.assembledFullDescription.",
  ].join(" ");
}
