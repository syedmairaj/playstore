/** Competitor praise signal taxonomy — ROI-first curation SSOT. */

export const PRAISE_SIGNAL_CLASSES = [
  "user_appreciated",
  "market_dominating",
] as const;

export type PraiseSignalClass = (typeof PRAISE_SIGNAL_CLASSES)[number];

/** Minimum conversion-impact score to enter the Competitor Strengths audit queue. */
export const MARKET_DOMINATING_IMPACT_THRESHOLD = 65;

export type PraiseSignal = {
  term: string;
  conversionImpactScore: number;
  classification: PraiseSignalClass;
};

export type SentimentPraisePayload = {
  /** Structured praise with ROI scores (preferred). */
  praiseSignals?: PraiseSignal[];
  /** Legacy flat list — migrated via heuristics. */
  topPraiseKeywords?: string[];
};

export type StrengthAuditStatus = "pending" | "approved" | "dismissed";

export type CompetitorStrengthAuditItem = {
  id: string;
  term: string;
  conversionImpactScore: number;
  competitorId: string;
  competitorName: string;
  status: StrengthAuditStatus;
  coreDifferentiator: boolean;
  capturedAt: string;
};

function clampImpact(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normTerm(term: string): string {
  return term.trim().toLowerCase();
}

/** Heuristic: features that correlate with install intent / SERP differentiation. */
const HIGH_CVR_PRAISE_PATTERNS: RegExp[] = [
  /\bai\b/i,
  /\btrack/i,
  /\bdatabase\b/i,
  /\bscanner\b/i,
  /\baccura/i,
  /\boffline\b/i,
  /\bsync/i,
  /\bpersonal/i,
  /\bcustom/i,
  /\bfast\b/i,
  /\bpro\b/i,
  /\bpremium\b/i,
  /\bunlimited\b/i,
  /\bno ads\b/i,
];

function estimateConversionImpact(term: string, rankIndex: number): number {
  const haystack = term.toLowerCase();
  let score = 72 - rankIndex * 4;
  for (const pattern of HIGH_CVR_PRAISE_PATTERNS) {
    if (pattern.test(haystack)) {
      score += 12;
      break;
    }
  }
  if (haystack.split(/\s+/).length >= 3) score -= 4;
  return clampImpact(score, 55);
}

function inferClassification(
  term: string,
  conversionImpactScore: number,
): PraiseSignalClass {
  return conversionImpactScore >= MARKET_DOMINATING_IMPACT_THRESHOLD
    ? "market_dominating"
    : "user_appreciated";
}

export function migrateLegacyPraiseTerms(terms: string[]): PraiseSignal[] {
  const seen = new Set<string>();
  const out: PraiseSignal[] = [];

  for (const [index, raw] of terms.entries()) {
    const term = raw.trim();
    if (!term) continue;
    const key = normTerm(term);
    if (seen.has(key)) continue;
    seen.add(key);

    const conversionImpactScore = estimateConversionImpact(term, index);
    out.push({
      term,
      conversionImpactScore,
      classification: inferClassification(term, conversionImpactScore),
    });
  }

  return out;
}

export function normalizePraiseSignals(payload: SentimentPraisePayload): PraiseSignal[] {
  if (Array.isArray(payload.praiseSignals) && payload.praiseSignals.length > 0) {
    const seen = new Set<string>();
    return payload.praiseSignals
      .map((row) => {
        const term = typeof row.term === "string" ? row.term.trim() : "";
        if (!term) return null;
        const key = normTerm(term);
        if (seen.has(key)) return null;
        seen.add(key);
        const conversionImpactScore = clampImpact(
          row.conversionImpactScore,
          estimateConversionImpact(term, seen.size - 1),
        );
        const classification =
          row.classification === "market_dominating" ||
          row.classification === "user_appreciated"
            ? row.classification
            : inferClassification(term, conversionImpactScore);
        return { term, conversionImpactScore, classification };
      })
      .filter((row): row is PraiseSignal => row !== null);
  }

  return migrateLegacyPraiseTerms(payload.topPraiseKeywords ?? []);
}

export function splitPraiseSignals(signals: PraiseSignal[]): {
  userAppreciated: PraiseSignal[];
  marketDominatingCandidates: PraiseSignal[];
} {
  const userAppreciated: PraiseSignal[] = [];
  const marketDominatingCandidates: PraiseSignal[] = [];

  for (const signal of signals) {
    if (
      signal.classification === "market_dominating" &&
      signal.conversionImpactScore >= MARKET_DOMINATING_IMPACT_THRESHOLD
    ) {
      marketDominatingCandidates.push(signal);
    } else {
      userAppreciated.push(signal);
    }
  }

  marketDominatingCandidates.sort(
    (a, b) => b.conversionImpactScore - a.conversionImpactScore,
  );
  userAppreciated.sort((a, b) => b.conversionImpactScore - a.conversionImpactScore);

  return { userAppreciated, marketDominatingCandidates };
}

export function praiseTermsFromSignals(signals: PraiseSignal[]): string[] {
  return signals.map((s) => s.term);
}

export function auditItemId(competitorId: string, term: string): string {
  const slug = normTerm(term).replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return `audit:${competitorId}:${slug || "term"}`;
}

export function buildAuditQueueFromCandidates(
  candidates: PraiseSignal[],
  competitorId: string,
  competitorName: string,
  existing: CompetitorStrengthAuditItem[],
): CompetitorStrengthAuditItem[] {
  const capturedAt = new Date().toISOString();
  const byId = new Map(existing.map((item) => [item.id, item]));
  const next: CompetitorStrengthAuditItem[] = [...existing];

  for (const signal of candidates) {
    const id = auditItemId(competitorId, signal.term);
    const prior = byId.get(id);
    if (prior) {
      if (prior.status === "dismissed") continue;
      continue;
    }
    next.push({
      id,
      term: signal.term,
      conversionImpactScore: signal.conversionImpactScore,
      competitorId,
      competitorName,
      status: "pending",
      coreDifferentiator: false,
      capturedAt,
    });
  }

  return next.filter((item) => item.competitorId === competitorId);
}
