import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import {
  assembledLongCharCount,
  MODULAR_LONG_MIN_CHARS,
} from "@/lib/listing/modular-output-validation";

/** Aggressive system boilerplate — feature highlights + security/privacy (EN). */
export const LONG_DESCRIPTION_BOILERPLATE_EN = [
  "🔒 Security & privacy",
  "We protect your data with industry-standard safeguards. The app collects only what is needed to run core features. Review permissions in Google Play and read the in-app privacy policy for retention, deletion, and regional rights.",
  "",
  "✨ Key capabilities",
  "• Personalized dashboards that adapt to your goals and usage patterns",
  "• Reliable sync across sessions with clear status indicators",
  "• Thoughtful defaults so new users see value on day one",
  "• Regular quality updates focused on stability and performance",
  "",
  "🛡️ Safety & compliance",
  "Built for trustworthy everyday use. Report issues from in-app Help so our team can investigate. We do not sell personal data; processing follows applicable store and privacy regulations.",
  "",
  "💬 Support & updates",
  "Questions or feedback? Reach support from the store listing or in-app Help. Enable automatic updates to receive improvements, bug fixes, and new capabilities as they ship.",
].join("\n");

/** Aggressive system boilerplate — feature highlights + security/privacy (AR). */
export const LONG_DESCRIPTION_BOILERPLATE_AR = [
  "🔒 الأمان والخصوصية",
  "نحمي بياناتك بضمانات معيارية. يجمع التطبيق فقط ما يلزم لتشغيل الميزات الأساسية. راجع الأذونات في Google Play واقرأ سياسة الخصوصية داخل التطبيق للتفاصيل حول الاحتفاظ والحذف والحقوق الإقليمية.",
  "",
  "✨ القدرات الرئيسية",
  "• لوحات مخصصة تتكيف مع أهدافك ونمط استخدامك",
  "• مزامنة موثوقة بين الجلسات مع مؤشرات حالة واضحة",
  "• إعدادات افتراضية مدروسة لقيمة فورية من اليوم الأول",
  "• تحديثات جودة منتظمة تركز على الاستقرار والأداء",
  "",
  "🛡️ السلامة والامتثال",
  "صُمم للاستخدام اليومي الموثوق. أبلغ عن المشكلات من قسم المساعدة داخل التطبيق. لا نبيع البيانات الشخصية؛ تتم المعالجة وفق لوائح المتجر والخصوصية المعمول بها.",
  "",
  "💬 الدعم والتحديثات",
  "لديك سؤال أو ملاحظة؟ تواصل مع الدعم عبر صفحة المتجر أو المساعدة داخل التطبيق. فعّل التحديثات التلقائية لتلقي التحسينات وإصلاحات الأخطاء والميزات الجديدة.",
].join("\n");

const EXPANSION_BLOCKS_EN = [
  [
    "Privacy & data",
    "We respect your privacy. This app processes only the data needed to deliver core features. See our in-app privacy policy for details on collection, retention, and your rights.",
  ].join("\n"),
  [
    "Safety & reliability",
    "Built with stability and user safety in mind. Report issues from Settings so our team can investigate and ship fixes quickly.",
  ].join("\n"),
  [
    "Support",
    "Questions or feedback? Contact support through the app listing or in-app Help. We read every message and use your input to improve releases.",
  ].join("\n"),
  [
    "Updates",
    "We regularly release improvements, performance tuning, and new capabilities. Enable automatic updates to stay on the latest version.",
  ].join("\n"),
];

const EXPANSION_BLOCKS_AR = [
  [
    "الخصوصية والبيانات",
    "نحترم خصوصيتك. يعالج التطبيق البيانات اللازمة فقط لتقديم الميزات الأساسية. راجع سياسة الخصوصية داخل التطبيق للتفاصيل حول الجمع والاحتفاظ وحقوقك.",
  ].join("\n"),
  [
    "الأمان والموثوقية",
    "صُمم مع التركيز على الاستقرار وسلامة المستخدم. أبلغ عن المشكلات من الإعدادات ليقوم فريقنا بالتحقيق وإصلاحها بسرعة.",
  ].join("\n"),
  [
    "الدعم",
    "لديك سؤال أو ملاحظة؟ تواصل مع الدعم عبر صفحة التطبيق أو قسم المساعدة داخل التطبيق. نقرأ كل رسالة ونستخدم ملاحظاتك لتحسين الإصدارات.",
  ].join("\n"),
  [
    "التحديثات",
    "نصدر بانتظام تحسينات وضبط أداء وميزات جديدة. فعّل التحديثات التلقائية للبقاء على أحدث إصدار.",
  ].join("\n"),
];

const ASSEMBLER_CLOSING_MAX = 1600;
const ASSEMBLER_FEATURES_MAX = 3200;

function boilerplateForLocale(targetArabic: boolean): string {
  return targetArabic ? LONG_DESCRIPTION_BOILERPLATE_AR : LONG_DESCRIPTION_BOILERPLATE_EN;
}

function expansionBlocks(targetArabic: boolean): string[] {
  return targetArabic ? EXPANSION_BLOCKS_AR : EXPANSION_BLOCKS_EN;
}

/**
 * Aggressive assembler expansion — injects full boilerplate (features + disclaimers)
 * when assembled copy is below 2,000 characters, then pads with footer blocks.
 */
export function expandDescription(
  data: ModularLongStepData,
  options?: { targetArabic?: boolean },
): ModularLongStepData {
  let hook = data.hook.trim().slice(0, 200);
  let features = data.features.trim().slice(0, ASSEMBLER_FEATURES_MAX);
  let closing = data.closing.trim().slice(0, ASSEMBLER_CLOSING_MAX);

  if (!hook && !features && !closing) {
    return { hook, features, closing };
  }

  const targetArabic = options?.targetArabic === true;
  let assembled = assembledLongCharCount({ hook, features, closing });

  if (assembled < MODULAR_LONG_MIN_CHARS) {
    const boilerplate = boilerplateForLocale(targetArabic);
    features = features ? `${features}\n\n${boilerplate}` : boilerplate;
    features = features.slice(0, ASSEMBLER_FEATURES_MAX);
    assembled = assembledLongCharCount({ hook, features, closing });
  }

  const blocks = expansionBlocks(targetArabic);
  for (const block of blocks) {
    if (assembled >= MODULAR_LONG_MIN_CHARS) break;

    const closingCandidate = closing ? `${closing}\n\n${block}` : block;
    if (closingCandidate.length <= ASSEMBLER_CLOSING_MAX) {
      closing = closingCandidate;
    } else {
      const featuresCandidate = features ? `${features}\n\n${block}` : block;
      features = featuresCandidate.slice(0, ASSEMBLER_FEATURES_MAX);
    }
    assembled = assembledLongCharCount({ hook, features, closing });
  }

  return { hook, features, closing };
}

/** @deprecated Use expandDescription */
export const expandModularLongOutput = expandDescription;
