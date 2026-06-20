import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import {
  assembledLongCharCount,
  assessModularLongLength,
  MODULAR_LONG_MIN_CHARS,
  type ModularLongLengthAssessment,
} from "@/lib/listing/modular-output-validation";

export const HOOK_CLOSING_DISPLAY_MAX = 200;
const TRUNCATE_AT = 197;

/** Pre-defined footer — privacy, security, hardware compatibility (EN). */
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

/** Pre-defined footer — privacy, security, hardware compatibility (AR). */
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

const FOOTER_SECTIONS_EN = ASO_BOILERPLATE_FOOTER_EN.split("\n\n");
const FOOTER_SECTIONS_AR = ASO_BOILERPLATE_FOOTER_AR.split("\n\n");

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

function footerSections(targetArabic: boolean): string[] {
  return targetArabic ? FOOTER_SECTIONS_AR : FOOTER_SECTIONS_EN;
}

function padClosingToMinLength(
  hook: string,
  features: string,
  closing: string,
  targetArabic: boolean,
): string {
  let nextClosing = closing;
  const sections = footerSections(targetArabic);

  for (const section of sections) {
    if (assembledLongCharCount({ hook, features, closing: nextClosing }) >= MODULAR_LONG_MIN_CHARS) {
      break;
    }
    nextClosing = nextClosing ? `${nextClosing}\n\n${section}` : section;
  }

  if (assembledLongCharCount({ hook, features, closing: nextClosing }) < MODULAR_LONG_MIN_CHARS) {
    const fullFooter = targetArabic ? ASO_BOILERPLATE_FOOTER_AR : ASO_BOILERPLATE_FOOTER_EN;
    nextClosing = nextClosing ? `${nextClosing}\n\n${fullFooter}` : fullFooter;
  }

  return nextClosing.slice(0, CLOSING_MAX);
}

/**
 * Safe Assembler — normalizes hook/closing, pads footer to Play floor.
 * Never throws on length; returns best-effort copy + warnings.
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
