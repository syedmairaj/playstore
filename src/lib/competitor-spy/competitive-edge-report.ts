import type { StoredCompetitor } from "@/lib/competitors/normalize-stored-competitor";
import type { CompetitorSpyQuickWinPlan } from "@/lib/keywords/build-competitor-spy-from-serper-preview";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import type { PraiseSignal } from "@/lib/competitor-spy/praise-signal-curation";
import {
  migrateLegacyPraiseTerms,
  splitPraiseSignals,
} from "@/lib/competitor-spy/praise-signal-curation";
import type {
  CompetitiveEdgeAssetOpportunity,
  CompetitiveEdgeCounterFeature,
  CompetitiveEdgeKeywordCapture,
  CompetitiveEdgeListingSnapshot,
  CompetitiveEdgeReport,
  CompetitiveEdgeActionItem,
} from "@/lib/competitor-spy/competitive-edge-report.types";

export type BuildCompetitiveEdgeReportInput = {
  competitor: StoredCompetitor;
  locale: "en" | "ar";
  ourAppName?: string;
  listingSnapshot?: CompetitiveEdgeListingSnapshot;
};

const TOP_N = 5;

function takeTop<T>(items: T[], n = TOP_N): T[] {
  return items.slice(0, n);
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Heuristic pain → counter-feature mapping (no rival naming in output copy). */
export function mapPainToCounterFeature(
  painPoint: string,
  locale: "en" | "ar",
): Omit<CompetitiveEdgeCounterFeature, "painPoint"> {
  const p = painPoint.toLowerCase();

  const enRules: Array<{
    match: RegExp;
    counterFeature: string;
    placement: CompetitiveEdgeCounterFeature["listingPlacement"];
    strategy: string;
  }> = [
    {
      match: /paywall|subscription|premium|upsell|price|billing|ads?/,
      counterFeature: "Transparent pricing with core features unlocked",
      placement: "shortDescription",
      strategy:
        "Lead short description with honest value: no aggressive paywalls, no interruptive upsells — contrast their monetization friction.",
    },
    {
      match: /crash|bug|freeze|lag|slow|sync|offline|login/,
      counterFeature: "Stable performance and reliable sync",
      placement: "fullDescription",
      strategy:
        "Open full description with reliability proof points: fast load, offline-ready workflows, seamless device sync.",
    },
    {
      match: /privacy|data|track|permission|security/,
      counterFeature: "Privacy-first data handling",
      placement: "fullDescription",
      strategy:
        "Add a privacy assurance bullet: minimal permissions, clear data controls — neutralize trust gaps.",
    },
    {
      match: /accura|wrong|incorrect|error|missing/,
      counterFeature: "Verified accuracy and audit-friendly logs",
      placement: "whatsNew",
      strategy:
        "Use What's New to highlight precision improvements and validation — position as the dependable alternative.",
    },
    {
      match: /ui|ux|confus|hard to use|design|clutter/,
      counterFeature: "Clean, guided interface",
      placement: "title",
      strategy:
        "Compress title/subtitle around simplicity keywords: easy setup, clear daily workflow, zero learning curve.",
    },
  ];

  const arRules: typeof enRules = [
    {
      match: /paywall|subscription|premium|upsell|price|billing|ads?|اشتراك|سعر|إعلان/,
      counterFeature: "تسعير شفاف مع ميزات أساسية مفتوحة",
      placement: "shortDescription",
      strategy:
        "قدّم الوصف القصير بقيمة صادقة: بدون حواجز دفع عدوانية — قابل احتكاكهم في تحقيق الدخل.",
    },
    {
      match: /crash|bug|freeze|lag|slow|sync|offline|login|تعطل|بطي|مزامن/,
      counterFeature: "أداء مستقر ومزامنة موثوقة",
      placement: "fullDescription",
      strategy:
        "افتح الوصف الطويل بإثبات الاستقرار: تحميل سريع، عمل دون اتصال، مزامنة سلسة بين الأجهزة.",
    },
    {
      match: /privacy|data|track|permission|security|خصوص|بيانات|أمان/,
      counterFeature: "معالجة بيانات تحترم الخصوصية",
      placement: "fullDescription",
      strategy: "أضف نقطة خصوصية: أذونات minimal وضوابط بيانات واضحة.",
    },
    {
      match: /accura|wrong|incorrect|error|missing|دقة|خطأ/,
      counterFeature: "دقة موثوقة وسجلات واضحة",
      placement: "whatsNew",
      strategy: "استخدم «ما الجديد» لإبراز تحسينات الدقة — بديل يمكن الوثوق به.",
    },
    {
      match: /ui|ux|confus|hard to use|design|clutter|واجه|صعب/,
      counterFeature: "واجهة نظيفة وموجهة",
      placement: "title",
      strategy: "ركّز العنوان على البساطة: إعداد سهل، سير عمل يومي واضح.",
    },
  ];

  const rules = locale === "ar" ? arRules : enRules;
  for (const rule of rules) {
    if (rule.match.test(p)) {
      return {
        counterFeature: rule.counterFeature,
        listingPlacement: rule.placement,
        strategy: rule.strategy,
      };
    }
  }

  return locale === "ar"
    ? {
        counterFeature: "تجربة مصممة لحل هذه الشكوى تحديداً",
        listingPlacement: "fullDescription",
        strategy: `حوّل «${painPoint}» إلى وعد إيجابي في الوصف الطويل — بدون ذكر المنافس.`,
      }
    : {
        counterFeature: "Experience engineered to eliminate this frustration",
        listingPlacement: "fullDescription",
        strategy: `Reframe "${painPoint}" as a solved outcome in fullDescription — never name the rival.`,
      };
}

function praiseStrategy(signal: string, locale: "en" | "ar", strategic: boolean): string {
  if (locale === "ar") {
    return strategic
      ? `أضف «${signal}» إلى قسم ميزات التطبيق أو «ما الجديد» — قوة سوقية عالية التأثير على التحويل.`
      : `«${signal}» ميزة أساسية يقدّرها المستخدمون — لا تبالغ في تكرارها في العنوان.`;
  }
  return strategic
    ? `Place "${signal}" in App Features bullets or What's New — high-CVR market-dominating strength.`
    : `"${signal}" is baseline user appreciation — do not over-weight in title.`;
}

function requestStrategy(signal: string, locale: "en" | "ar"): string {
  return locale === "ar"
    ? `إذا كانت «${signal}» ضمن roadmap، اذكرها في «ما الجديد» أو الوصف الطويل قبل المنافس.`
    : `If "${signal}" is on your roadmap, claim it in What's New or fullDescription before they ship it.`;
}

function rankVulnerability(
  ourRank: number | null,
  theirRank: number | null,
): CompetitiveEdgeKeywordCapture["vulnerability"] {
  const our =
    ourRank == null || ourRank >= SERPER_RANK_NOT_IN_FIRST_PAGE ? null : ourRank;
  const their =
    theirRank == null || theirRank >= SERPER_RANK_NOT_IN_FIRST_PAGE ? null : theirRank;
  if (our == null && their != null) return "gap";
  if (our != null && their == null) return "they_trail";
  if (our == null && their == null) return "gap";
  if (our < their) return "they_trail";
  if (our > their) return "we_trail";
  return "tie";
}

function keywordStrategy(
  row: CompetitiveEdgeKeywordCapture,
  locale: "en" | "ar",
): string {
  const { keyword, vulnerability, ourRank, theirRank } = row;
  if (locale === "ar") {
    switch (vulnerability) {
      case "they_trail":
        return `ضاعف «${keyword}» في العنوان — أنت #${ourRank} وهو #${theirRank}: فرصة للاستيلاء على النقرات.`;
      case "we_trail":
        return `عزّز «${keyword}» في الوصف القصير + لقطة شاشة — أنت #${ourRank} مقابل #${theirRank}: أغلق الفجوة فوراً.`;
      case "gap":
        return `أضف «${keyword}» كمصطلح فجوة — المنافس ضعيف أو غائب؛ امتلك SERP.`;
      default:
        return `حافظ على «${keyword}» في كل الحقول — تعادل عند #${ourRank ?? "20+"}.`;
    }
  }
  switch (vulnerability) {
    case "they_trail":
      return `Double-down on "${keyword}" in title — you rank #${ourRank} vs their #${theirRank}: capture their click share.`;
    case "we_trail":
      return `Boost "${keyword}" in short description + screenshot caption — you #${ourRank} vs #${theirRank}: close the gap now.`;
    case "gap":
      return `Stage "${keyword}" as a gap term — rival is weak or absent; own the SERP slot.`;
    default:
      return `Hold "${keyword}" across all fields — tied at #${ourRank ?? "20+"}.`;
  }
}

function buildKeywordCaptures(competitor: StoredCompetitor): CompetitiveEdgeKeywordCapture[] {
  const rows: CompetitiveEdgeKeywordCapture[] = [];

  for (const row of competitor.shared) {
    rows.push({
      keyword: row.keyword,
      ourRank: row.yourRank,
      theirRank: row.theirRank,
      vulnerability: rankVulnerability(row.yourRank, row.theirRank),
      strategy: "",
    });
  }

  for (const gap of competitor.gaps) {
    if (rows.some((r) => r.keyword.toLowerCase() === gap.keyword.toLowerCase())) continue;
    rows.push({
      keyword: gap.keyword,
      ourRank: null,
      theirRank: null,
      vulnerability: "gap",
      strategy: "",
    });
  }

  for (const plan of competitor.quickWinPlans ?? []) {
    const kw = quickWinPlanKeyword(plan);
    if (!kw || rows.some((r) => r.keyword.toLowerCase() === kw.toLowerCase())) continue;
    if (plan.key === "tplTrail" || plan.key === "tplAhead") {
      rows.push({
        keyword: kw,
        ourRank: plan.yourRank,
        theirRank: plan.theirRank,
        vulnerability: rankVulnerability(plan.yourRank, plan.theirRank),
        strategy: "",
      });
    } else if (plan.key === "tplAbsent" || plan.key === "tplGap") {
      rows.push({
        keyword: kw,
        ourRank: null,
        theirRank: null,
        vulnerability: "gap",
        strategy: "",
      });
    }
  }

  return takeTop(
    rows.sort((a, b) => {
      const score = (v: CompetitiveEdgeKeywordCapture["vulnerability"]) =>
        v === "they_trail" ? 0 : v === "gap" ? 1 : v === "we_trail" ? 2 : 3;
      return score(a.vulnerability) - score(b.vulnerability);
    }),
  );
}

function quickWinPlanKeyword(plan: CompetitorSpyQuickWinPlan): string | null {
  if (plan.key === "tplGap") return plan.term;
  return plan.keyword;
}

function buildAssetOpportunities(
  competitor: StoredCompetitor,
  locale: "en" | "ar",
): CompetitiveEdgeAssetOpportunity[] {
  const audit = competitor.asoAudit;
  if (!audit) return [];

  const out: CompetitiveEdgeAssetOpportunity[] = [];

  if (!audit.hasVideoTrailer) {
    out.push(
      locale === "ar"
        ? {
            gap: "لا يوجد فيديو ترويجي على Google Play",
            ourAction:
              "انشر مقطعاً قصيراً (15–30 ثانية) يُظهر حلاً لمشكلة مراجعاتهم — ارفع معدل التحويل.",
            priority: "high",
          }
        : {
            gap: "No Play Store promo video",
            ourAction:
              "Ship a 15–30s trailer showing your counter-feature to their top complaint — lift conversion.",
            priority: "high",
          },
    );
  }

  if (audit.domainAuthority < 40) {
    out.push(
      locale === "ar"
        ? {
            gap: `سلطة نطاق منخفضة (${audit.domainAuthority})`,
            ourAction: "عزّز backlinks وصفحات هبوط ASO — تفوق خارج المتجر.",
            priority: "medium",
          }
        : {
            gap: `Low domain authority (${audit.domainAuthority})`,
            ourAction: "Invest in ASO landing pages and backlinks — win off-store discovery.",
            priority: "medium",
          },
    );
  }

  if (audit.localizedMarketsCount < 3) {
    out.push(
      locale === "ar"
        ? {
            gap: `توطين محدود (${audit.localizedMarketsCount} أسواق)`,
            ourAction: "أطلق قائمة EN/AR كاملة قبلهم في MENA — امتلك البحث المحلي.",
            priority: "medium",
          }
        : {
            gap: `Limited localization (${audit.localizedMarketsCount} markets)`,
            ourAction: "Ship full EN/AR listing before they expand — own local SERP.",
            priority: "medium",
          },
    );
  }

  return takeTop(out, TOP_N);
}

function formatOptimizerBrief(report: Omit<CompetitiveEdgeReport, "optimizerBrief">): string {
  const lines: string[] = [];
  const isAr = report.locale === "ar";

  lines.push(
    isAr
      ? `تقرير Competitive Edge — ${report.competitorName} (مدخل لمحسّن القائمة)`
      : `Competitive Edge Report — ${report.competitorName} (Listing Optimizer input)`,
  );
  lines.push("");

  if (report.listingSnapshot?.title) {
    lines.push(
      isAr
        ? `لقطة قائمة المنافس: «${report.listingSnapshot.title}»`
        : `Rival listing snapshot: "${report.listingSnapshot.title}"`,
    );
  }

  lines.push(isAr ? "## كلمات للاستيلاء" : "## Keywords to Capture");
  for (const k of report.keywordsToCapture) {
    lines.push(`- ${k.keyword}: ${k.strategy}`);
  }

  lines.push(isAr ? "## نقاط ضعف للاستغلال" : "## Competitor Weaknesses to Exploit");
  for (const w of report.competitorWeaknessesToExploit) {
    lines.push(`- ${w.painPoint} → ${w.counterFeature} (${w.listingPlacement}): ${w.strategy}`);
  }

  lines.push(isAr ? "## فرص الأصول" : "## Asset Opportunities");
  for (const a of report.assetOpportunities) {
    lines.push(`- [${a.priority}] ${a.gap}: ${a.ourAction}`);
  }

  lines.push("");
  lines.push(
    isAr
      ? "تعليمات: لا تذكر اسم المنافس. حوّل كل نقطة ضعف إلى وعد إيجابي في metadata."
      : "Directive: Never name the competitor. Convert every weakness into a positive promise in metadata.",
  );

  return lines.join("\n");
}

/**
 * Synthesize a structured Competitor Spy Report from persisted analysis data.
 * Locale drives strategy prose (EN/AR); layout tokens remain locale-agnostic.
 */
export function buildCompetitiveEdgeReport(
  input: BuildCompetitiveEdgeReportInput,
): CompetitiveEdgeReport {
  const { competitor, locale, listingSnapshot } = input;
  const sentiment = competitor.sentiment;

  const praiseRaw = uniqueStrings(
    sentiment?.topPraiseKeywords?.length
      ? sentiment.topPraiseKeywords
      : competitor.topKeywords,
  );
  const praiseSignals: PraiseSignal[] = Array.isArray(
    (sentiment as { praiseSignals?: PraiseSignal[] } | undefined)?.praiseSignals,
  )
    ? ((sentiment as { praiseSignals: PraiseSignal[] }).praiseSignals ?? [])
    : migrateLegacyPraiseTerms(praiseRaw);
  const { userAppreciated, marketDominatingCandidates } = splitPraiseSignals(praiseSignals);

  const praiseBaseline: CompetitiveEdgeActionItem[] = userAppreciated.map((signal) => ({
    signal: signal.term,
    strategy: praiseStrategy(signal.term, locale, false),
  }));

  const praiseStrategic: CompetitiveEdgeActionItem[] = marketDominatingCandidates.map((signal) => ({
    signal: signal.term,
    strategy: praiseStrategy(signal.term, locale, true),
  }));

  const bugsRaw = uniqueStrings(
    sentiment?.reportedBugsKeywords?.length
      ? sentiment.reportedBugsKeywords
      : competitor.gaps.filter((g) => g.opportunity === "high").map((g) => g.keyword),
  );
  const requestsRaw = uniqueStrings(
    sentiment?.featureRequestsKeywords?.length
      ? sentiment.featureRequestsKeywords
      : competitor.quickWinTerms.filter(Boolean),
  );

  const praise = takeTop(praiseStrategic);
  const praiseBaselineReport = takeTop(praiseBaseline);

  const bugs: CompetitiveEdgeCounterFeature[] = takeTop(bugsRaw).map((painPoint) => ({
    painPoint,
    ...mapPainToCounterFeature(painPoint, locale),
  }));

  const featureRequests: CompetitiveEdgeActionItem[] = takeTop(requestsRaw).map((signal) => ({
    signal,
    strategy: requestStrategy(signal, locale),
  }));

  const keywordsToCapture = buildKeywordCaptures(competitor).map((row) => ({
    ...row,
    strategy: keywordStrategy(row, locale),
  }));

  const competitorWeaknessesToExploit = bugs.map((b) => ({
    ...b,
    strategy:
      locale === "ar"
        ? `${b.strategy} (استغل في ${b.listingPlacement})`
        : `${b.strategy} (exploit in ${b.listingPlacement})`,
  }));

  const assetOpportunities = buildAssetOpportunities(competitor, locale);

  const base = {
    locale,
    competitorName: competitor.displayName,
    competitorPackageId: competitor.packageId,
    listingSnapshot,
    reviewIntelligence: {
      praise,
      praiseBaseline: praiseBaselineReport,
      bugs,
      featureRequests,
    },
    keywordsToCapture,
    competitorWeaknessesToExploit,
    assetOpportunities,
  };

  return {
    ...base,
    optimizerBrief: formatOptimizerBrief(base),
  };
}

/** Single string for Listing Optimizer `userInstruction` / queue synthesis. */
export function competitiveEdgeReportToUserInstruction(report: CompetitiveEdgeReport): string {
  const weaknesses = report.competitorWeaknessesToExploit
    .map((w) => w.painPoint)
    .join("; ");

  const prefix =
    report.locale === "ar"
      ? "تحليل منافس نشط surfaced نقاط الألم التالية"
      : "Tracked competitor analysis has surfaced the following active user pain-points across rival apps";

  const inversion =
    report.locale === "ar"
      ? "لا تذكر هذه المشاكل حرفياً. Instead position our app as the definitive solution."
      : "DO NOT mention these issues literally in the listing. Instead, aggressively position our app as the definitive solution";

  const body = weaknesses
    ? `${prefix}: ${weaknesses}. ${inversion} — ${report.competitorWeaknessesToExploit
        .map((w) => w.counterFeature)
        .join("; ")}.`
    : report.optimizerBrief;

  return body.slice(0, 2000);
}

export type { CompetitiveEdgeReport } from "@/lib/competitor-spy/competitive-edge-report.types";
