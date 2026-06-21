import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import {
  assembledLongCharCount,
  assessModularLongLength,
  MODULAR_LONG_MIN_CHARS,
  type ModularLongLengthAssessment,
} from "@/lib/listing/modular-output-validation";

export const LISTING_TITLE_MAX = 30;

/** High-intent ASO suffix when Play title budget allows (health / glucose apps). */
export const HIGH_INTENT_TITLE_SUFFIX = "Nutrition & Glucose Tracker";

/**
 * Appends a high-intent category suffix when the combined title fits Play's 30-char limit.
 */
export function suggestHighIntentTitle(title: string, maxLen = LISTING_TITLE_MAX): string {
  const base = title.trim();
  if (!base) return base;

  if (base.toLowerCase().includes("nutrition") || base.toLowerCase().includes("glucose")) {
    return base.slice(0, maxLen);
  }

  const separators = [" — ", " | ", ": "];
  for (const sep of separators) {
    const candidate = `${base}${sep}${HIGH_INTENT_TITLE_SUFFIX}`;
    if (candidate.length <= maxLen) return candidate;
  }

  const shortSuffix = " Tracker";
  const shortCandidate = `${base}${shortSuffix}`;
  if (shortCandidate.length <= maxLen) return shortCandidate;

  return base.slice(0, maxLen);
}

export const HOOK_CLOSING_DISPLAY_MAX = 200;
const TRUNCATE_AT = 197;

/** Section headers — appended exactly once at end of long description (EN). */
export const ASO_BOILERPLATE_FOOTER_EN = [
  "Privacy & data",
  "We process only the data required to deliver app features. See the in-app privacy policy for collection, retention, and your rights.",
  "",
  "Security",
  "Industry-standard safeguards protect your information. We do not sell personal data.",
  "",
  "Hardware & compatibility",
  "Designed for modern Android devices. Performance may vary by model, OS version, and available storage. An internet connection may be required for some features.",
  "",
  "Support",
  "Questions? Contact us via the store listing or in-app Help. Enable automatic updates for the latest fixes and improvements.",
].join("\n");

export const ASO_BOILERPLATE_FOOTER_AR = [
  "الخصوصية والبيانات",
  "نعالج فقط البيانات اللازمة لتقديم ميزات التطبيق. راجع سياسة الخصوصية داخل التطبيق للتفاصيل.",
  "",
  "الأمان",
  "ضمانات معيارية تحمي معلوماتك. لا نبيع البيانات الشخصية.",
  "",
  "الأجهزة والتوافق",
  "مصمم لأجهزة Android الحديثة. قد يختلف الأداء حسب الطراز وإصدار النظام والمساحة المتاحة. قد يلزم اتصال بالإنترنت لبعض الميزات.",
  "",
  "الدعم",
  "لديك سؤال؟ تواصل معنا عبر صفحة المتجر أو المساعدة داخل التطبيق. فعّل التحديثات التلقائية لأحدث الإصلاحات.",
].join("\n");

const FOOTER_SECTION_HEADERS_EN = [
  "Privacy & data",
  "Security",
  "Hardware & compatibility",
  "Support",
] as const;

const FOOTER_SECTION_HEADERS_AR = [
  "الخصوصية والبيانات",
  "الأمان",
  "الأجهزة والتوافق",
  "الدعم",
] as const;

const FEATURES_MAX = 3200;
const CLOSING_MAX = 2400;

export type SafeAssembleResult = {
  data: ModularLongStepData;
  lengthAssessment: ModularLongLengthAssessment;
  warnings: string[];
};

function truncateWithEllipsis(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, TRUNCATE_AT)}...`;
}

function footerHeaders(targetArabic: boolean): readonly string[] {
  return targetArabic ? FOOTER_SECTION_HEADERS_AR : FOOTER_SECTION_HEADERS_EN;
}

function fullFooter(targetArabic: boolean): string {
  return targetArabic ? ASO_BOILERPLATE_FOOTER_AR : ASO_BOILERPLATE_FOOTER_EN;
}

/**
 * Remove duplicate Privacy / Security / Hardware / Support blocks — keep user copy before first footer header.
 */
export function stripDuplicateFooterSections(closing: string, targetArabic: boolean): string {
  const headers = footerHeaders(targetArabic);
  let cutIndex = -1;

  for (const header of headers) {
    const idx = closing.indexOf(header);
    if (idx >= 0 && (cutIndex < 0 || idx < cutIndex)) {
      cutIndex = idx;
    }
  }

  if (cutIndex > 0) {
    return closing.slice(0, cutIndex).trimEnd();
  }
  return closing.trim();
}

/** Append standard footer exactly once when assembled length is below Play floor. */
function padClosingToMinLength(
  hook: string,
  features: string,
  closing: string,
  targetArabic: boolean,
): string {
  const cleaned = stripDuplicateFooterSections(closing, targetArabic);
  const footer = fullFooter(targetArabic);

  if (assembledLongCharCount({ hook, features, closing: cleaned }) >= MODULAR_LONG_MIN_CHARS) {
    return cleaned.slice(0, CLOSING_MAX);
  }

  const withFooter = cleaned ? `${cleaned}\n\n${footer}` : footer;
  return withFooter.slice(0, CLOSING_MAX);
}

/**
 * Safe Assembler — normalizes hook/closing, pads footer once, never throws on length.
 */
export function safeAssemble(
  input: Partial<ModularLongStepData>,
  options?: { targetArabic?: boolean },
): SafeAssembleResult {
  const targetArabic = options?.targetArabic === true;
  const warnings: string[] = [];

  let hook = truncateWithEllipsis(input.hook ?? "", HOOK_CLOSING_DISPLAY_MAX);
  let closing = truncateWithEllipsis(input.closing ?? "", HOOK_CLOSING_DISPLAY_MAX);
  let features = (input.features ?? "").trim().slice(0, FEATURES_MAX);

  if ((input.hook ?? "").trim().length > HOOK_CLOSING_DISPLAY_MAX) {
    warnings.push("Hook truncated to 200 characters for Play display.");
  }
  if ((input.closing ?? "").trim().length > HOOK_CLOSING_DISPLAY_MAX) {
    warnings.push("Closing truncated to 200 characters before footer assembly.");
  }

  if (!hook.trim()) {
    hook = targetArabic ? "ابدأ رحلتك اليوم." : "Start your journey today.";
    warnings.push("Hook was empty — inserted safe default opener.");
  }
  if (!features.trim()) {
    features = targetArabic
      ? "• ميزات أساسية مصممة لتجربة سلسة من اليوم الأول."
      : "• Core features designed for a smooth day-one experience.";
    warnings.push("Features block was empty — inserted safe default list.");
  }
  if (!closing.trim()) {
    closing = targetArabic ? "حمّل التطبيق الآن." : "Download the app today.";
    warnings.push("Closing was empty — inserted safe default CTA.");
  }

  const beforePad = assembledLongCharCount({ hook, features, closing });
  if (beforePad < MODULAR_LONG_MIN_CHARS) {
    closing = padClosingToMinLength(hook, features, closing, targetArabic);
    warnings.push(
      `Full description padded with ASO boilerplate footer (${beforePad} → ${assembledLongCharCount({ hook, features, closing })} chars).`,
    );
  } else {
    closing = stripDuplicateFooterSections(closing, targetArabic).slice(0, CLOSING_MAX);
  }

  const data: ModularLongStepData = { hook, features, closing };
  const lengthAssessment = assessModularLongLength(data);

  if (lengthAssessment.belowTarget) {
    warnings.push(lengthAssessment.message);
  }

  return { data, lengthAssessment, warnings };
}

export function buildFallbackLongCopy(params: {
  appName: string;
  appFeatures: string;
  shortDescription: string;
  targetArabic?: boolean;
}): ModularLongStepData {
  const targetArabic = params.targetArabic === true;
  const features = params.appFeatures.trim().slice(0, FEATURES_MAX);
  return {
    hook: params.shortDescription.trim() || (targetArabic ? "تجربة مصممة لك." : "An experience built for you."),
    features:
      features ||
      (targetArabic ? "• ميزات موثوقة للاستخدام اليومي." : "• Reliable features for everyday use."),
    closing: targetArabic
      ? `حمّل ${params.appName} واستكشف المزيد.`
      : `Get ${params.appName} and explore more.`,
  };
}
