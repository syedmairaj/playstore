import type { ReviewMarketLocale, ReviewRow } from "@/components/reviews/reviews-types";

/**
 * Derives the BCP-47 langCode from a Play-Console locale token.
 * Demo rows don't come from the scraper so they have no explicit lang field;
 * we infer it from the locale they already carry.
 */
function langFromLocale(locale: ReviewMarketLocale): string {
  if (locale === "ae-ar") return "ar";
  if (locale === "in-hi") return "en"; // India single-pass = English
  return "en";
}

/**
 * Stamps `langCode` onto every object in a demo ReviewRow array so the
 * array satisfies the updated ReviewRow type without modifying every literal.
 */
function stampLangCode(
  rows: Omit<ReviewRow, "langCode">[],
): ReviewRow[] {
  return rows.map((r) => ({
    ...r,
    langCode: langFromLocale(r.locale),
  }));
}

/**
 * Generic competitor demo reviews — shown for any competitor tab whose packageId
 * does not have a dedicated entry in COMPETITOR_REVIEWS_BY_PACKAGE below.
 */
const GENERIC_COMPETITOR_REVIEWS_RAW: Omit<ReviewRow, "langCode">[] = [
  {
    id: "gc1",
    userName: "Nathan B.",
    rating: 2,
    appVersion: "4.1.0",
    locale: "us-en",
    text: "Constant upsell popups ruin the experience. Every other tap opens a paywall. I just want to use the core features.",
    dateIso: "2026-05-11",
    classifications: ["pricing"],
  },
  {
    id: "gc2",
    userName: "Leila R.",
    rating: 1,
    appVersion: "4.0.9",
    locale: "us-en",
    text: "App crashes on startup after the latest update. Uninstalled and reinstalled twice — same result. Pixel 7 Pro.",
    dateIso: "2026-05-10",
    classifications: ["bug_crash"],
  },
  {
    id: "gc3",
    userName: "Tariq M.",
    rating: 3,
    appVersion: "4.1.0",
    locale: "ae-ar",
    text: "الواجهة معقدة جداً للمستخدم الجديد. أحتاج 10 دقائق لأجد أبسط خاصية. يحتاج تبسيطاً.",
    dateIso: "2026-05-09",
    classifications: ["feature_request"],
  },
  {
    id: "gc4",
    userName: "Camille D.",
    rating: 2,
    appVersion: "4.0.8",
    locale: "us-en",
    text: "Sync broke after I switched phones. Lost 3 months of data. Support took 6 days to respond — unacceptable.",
    dateIso: "2026-05-08",
    classifications: ["bug_crash"],
  },
  {
    id: "gc5",
    userName: "Arjun P.",
    rating: 4,
    appVersion: "4.1.0",
    locale: "in-hi",
    text: "फीचर्स अच्छे हैं लेकिन बैटरी बहुत ज्यादा खाता है। बैकग्राउंड में चलने से फोन गर्म हो जाता है।",
    dateIso: "2026-05-07",
    classifications: ["bug_crash"],
  },
  {
    id: "gc6",
    userName: "Sophie W.",
    rating: 1,
    appVersion: "4.0.9",
    locale: "us-en",
    text: "Ads are literally every 2 minutes on the free tier. Even mid-session. Completely breaks focus. Not worth tolerating.",
    dateIso: "2026-05-06",
    classifications: ["pricing"],
  },
];

/**
 * Package-specific demo reviews for known competitors.
 * Key = Play Store packageId. Add new competitors here as needed.
 */
const COMPETITOR_REVIEWS_BY_PACKAGE_RAW: Record<string, Omit<ReviewRow, "langCode">[]> = {
  "com.myfitnesspal.app": [
    {
      id: "mfp1",
      userName: "Jessica H.",
      rating: 2,
      appVersion: "23.14.0",
      locale: "us-en",
      text: "Calorie logging is painfully slow. Every time I scan a barcode it takes 8–10 seconds to load. My old phone was faster. Please optimise.",
      dateIso: "2026-05-12",
      classifications: ["bug_crash"],
    },
    {
      id: "mfp2",
      userName: "Derek O.",
      rating: 1,
      appVersion: "23.13.5",
      locale: "us-en",
      text: "Premium went up AGAIN. $20/month for a calorie counter? Half the database entries are user-submitted garbage with wrong macros. Not worth it.",
      dateIso: "2026-05-11",
      classifications: ["pricing"],
    },
    {
      id: "mfp3",
      userName: "Aisha N.",
      rating: 3,
      appVersion: "23.14.0",
      locale: "ae-ar",
      text: "قاعدة بيانات الطعام للمنطقة العربية ضعيفة جداً. نصف المنتجات المحلية غير موجودة. أضطر لإدخال كل شيء يدوياً.",
      dateIso: "2026-05-10",
      classifications: ["feature_request"],
    },
    {
      id: "mfp4",
      userName: "Tom K.",
      rating: 2,
      appVersion: "23.13.5",
      locale: "us-en",
      text: "The new UI redesign is a disaster. They moved everything around for no reason. Took me 20 minutes to find the water tracker I used daily.",
      dateIso: "2026-05-09",
      classifications: ["feature_request"],
    },
    {
      id: "mfp5",
      userName: "Riya S.",
      rating: 1,
      appVersion: "23.14.0",
      locale: "in-hi",
      text: "ऐप बहुत slow है। लॉग इन करने के बाद 30 सेकंड तक loading screen दिखती है। पुराना version बेहतर था।",
      dateIso: "2026-05-08",
      classifications: ["bug_crash"],
    },
    {
      id: "mfp6",
      userName: "Carlos M.",
      rating: 2,
      appVersion: "23.13.0",
      locale: "us-en",
      text: "Ads appear in the middle of logging a meal — interrupts the whole flow. Even after paying for premium once, ads came back after renewal.",
      dateIso: "2026-05-07",
      classifications: ["pricing"],
    },
    {
      id: "mfp7",
      userName: "Hannah L.",
      rating: 3,
      appVersion: "23.14.0",
      locale: "us-en",
      text: "Barcode scanner misidentifies products at least once per session. I've been accidentally logging the wrong calories for weeks before I noticed.",
      dateIso: "2026-05-06",
      classifications: ["bug_crash"],
    },
    {
      id: "mfp8",
      userName: "Yusuf A.",
      rating: 4,
      appVersion: "23.14.0",
      locale: "ae-ar",
      text: "التطبيق مفيد لكن التزامن مع ساعة Galaxy يتوقف بعد كل تحديث. أتمنى استقراراً أكثر.",
      dateIso: "2026-05-05",
      classifications: ["bug_crash", "feature_request"],
    },
  ],
  "com.lose_it.android.apps.lose_it": [
    {
      id: "li1",
      userName: "Marcus T.",
      rating: 2,
      appVersion: "15.3.0",
      locale: "us-en",
      text: "Lose It locked basic meal plans behind premium. Used to be free. Now it's $40/year just to see your weekly history beyond 7 days.",
      dateIso: "2026-05-11",
      classifications: ["pricing"],
    },
    {
      id: "li2",
      userName: "Brianna S.",
      rating: 1,
      appVersion: "15.2.9",
      locale: "us-en",
      text: "Crashes every single time I try to log breakfast. Galaxy S24. Reported it 3 weeks ago — still no fix.",
      dateIso: "2026-05-10",
      classifications: ["bug_crash"],
    },
    {
      id: "li3",
      userName: "Omar F.",
      rating: 3,
      appVersion: "15.3.0",
      locale: "ae-ar",
      text: "لا يدعم المنتجات الخليجية إطلاقاً. حاولت إضافة أكلات محلية فلم أجد أي نتائج.",
      dateIso: "2026-05-09",
      classifications: ["feature_request"],
    },
    {
      id: "li4",
      userName: "Nia W.",
      rating: 2,
      appVersion: "15.3.0",
      locale: "us-en",
      text: "Push notifications refuse to turn off even after disabling them in settings. Woke me up at 3am twice this week.",
      dateIso: "2026-05-08",
      classifications: ["bug_crash"],
    },
    {
      id: "li5",
      userName: "Vikram N.",
      rating: 3,
      appVersion: "15.2.8",
      locale: "in-hi",
      text: "Indian food database बहुत limited है। Dal, roti, sabzi — कुछ भी सही नहीं मिलता। manually add करना पड़ता है।",
      dateIso: "2026-05-07",
      classifications: ["feature_request"],
    },
  ],
};

/**
 * Returns the demo review set for a given competitor packageId.
 * Falls back to generic competitor reviews if no specific set exists.
 */
/** Stamped (with langCode) export map — built once from the raw literals. */
export const COMPETITOR_REVIEWS_BY_PACKAGE: Record<string, ReviewRow[]> = Object.fromEntries(
  Object.entries(COMPETITOR_REVIEWS_BY_PACKAGE_RAW).map(([pkg, rows]) => [
    pkg,
    stampLangCode(rows),
  ]),
);

/** Stamped generic reviews — used when no package-specific set exists. */
const GENERIC_COMPETITOR_REVIEWS: ReviewRow[] = stampLangCode(GENERIC_COMPETITOR_REVIEWS_RAW);

export function getCompetitorDemoReviews(packageId: string): ReviewRow[] {
  return COMPETITOR_REVIEWS_BY_PACKAGE[packageId] ?? GENERIC_COMPETITOR_REVIEWS;
}

const DEMO_REVIEWS_RAW: Omit<ReviewRow, "langCode">[] = [
  {
    id: "r1",
    userName: "Jordan M.",
    rating: 5,
    appVersion: "3.2.1",
    locale: "us-en",
    text: "Finally a calm meditation app without noisy ads every two minutes. The sleep sounds library is huge and the timer UX is thoughtful.",
    dateIso: "2026-05-10",
    classifications: ["praise"],
  },
  {
    id: "r2",
    userName: "Alex P.",
    rating: 2,
    appVersion: "3.2.0",
    locale: "us-en",
    text: "Crashes when I switch to offline mode on Pixel. Lost my streak twice. Please fix — I pay for premium and expect stability.",
    dateIso: "2026-05-09",
    classifications: ["bug_crash"],
  },
  {
    id: "r3",
    userName: "Samira K.",
    rating: 4,
    appVersion: "3.1.9",
    locale: "ae-ar",
    text: "التطبيق ممتاز بشكل عام لكن السعر مرتفع مقارنة بتطبيقات مشابهة. أتمنى خطة عائلية أوضح.",
    dateIso: "2026-05-08",
    classifications: ["pricing"],
  },
  {
    id: "r4",
    userName: "Priya S.",
    rating: 5,
    appVersion: "3.2.1",
    locale: "in-hi",
    text: "साँस लेने के व्यायाम बहुत अच्छे हैं। विजेट में अगला सत्र दिखे तो परफेक्ट हो जाएगा।",
    dateIso: "2026-05-07",
    classifications: ["feature_request", "praise"],
  },
  {
    id: "r5",
    userName: "Chris L.",
    rating: 1,
    appVersion: "3.2.0",
    locale: "us-en",
    text: "Battery drain is insane after the last update. Phone gets warm within 20 minutes.",
    dateIso: "2026-05-06",
    classifications: ["bug_crash"],
  },
  {
    id: "r6",
    userName: "Morgan T.",
    rating: 4,
    appVersion: "3.1.8",
    locale: "us-en",
    text: "Solid habit tracker. Notifications could be gentler — sometimes they feel pushy late at night.",
    dateIso: "2026-05-04",
    classifications: ["feature_request"],
  },
  {
    id: "r7",
    userName: "Fatima A.",
    rating: 5,
    appVersion: "3.2.1",
    locale: "ae-ar",
    text: "أفضل تطبيق للتأمل استخدمته. واجهة هادئة وبدون إعلانات مزعجة.",
    dateIso: "2026-05-03",
    classifications: ["praise"],
  },
  {
    id: "r8",
    userName: "Rahul V.",
    rating: 3,
    appVersion: "3.2.0",
    locale: "in-hi",
    text: "ऐप अच्छा है लेकिन लॉगिन कभी-कभी फेल हो जाता है। कृपया ठीक करें।",
    dateIso: "2026-05-02",
    classifications: ["bug_crash"],
  },
];

export const DEMO_REVIEWS: ReviewRow[] = stampLangCode(DEMO_REVIEWS_RAW);
