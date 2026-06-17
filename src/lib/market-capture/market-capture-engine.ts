import type {
  MarketCaptureContext,
  MarketCaptureFieldProposal,
  MarketCaptureListingField,
  MarketCaptureReport,
  MarketCaptureStagedChange,
  MarketCaptureVersionProposal,
} from "@/lib/market-capture/market-capture.types";
import type { MarketCaptureModelOutput } from "@/lib/validation/market-capture-output";

const TITLE_MAX = 30;
const SHORT_MAX = 80;

function clampField(
  field: MarketCaptureListingField,
  value: string,
): { value: string; charCount: number } {
  const max =
    field === "title" ? TITLE_MAX : field === "shortDescription" ? SHORT_MAX : 4000;
  const trimmed = value.trim();
  if (trimmed.length <= max) return { value: trimmed, charCount: trimmed.length };
  return { value: `${trimmed.slice(0, max - 1).trimEnd()}…`, charCount: max };
}

function estimateKeywordDensity(text: string, keywords: string[]): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  let hits = 0;
  for (const kw of keywords) {
    const parts = kw.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const phrase = parts.join(" ");
    const occurrences = (text.toLowerCase().match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [])
      .length;
    hits += occurrences * parts.length;
  }
  return Math.round((hits / words.length) * 1000) / 10;
}

function normalizeProposal(
  field: MarketCaptureFieldProposal,
  listingField: MarketCaptureListingField,
  keywords: string[],
): MarketCaptureFieldProposal {
  const { value, charCount } = clampField(listingField, field.value);
  return {
    value,
    rationale: field.rationale.trim(),
    charCount: charCount || value.length,
    keywordDensityPercent:
      listingField === "fullDescription"
        ? field.keywordDensityPercent ??
          estimateKeywordDensity(value, keywords)
        : undefined,
  };
}

function normalizeVersion(
  raw: MarketCaptureModelOutput["versionA"],
  keywords: string[],
): MarketCaptureVersionProposal {
  return {
    strategy: raw.strategy,
    label: raw.label,
    title: normalizeProposal(raw.title, "title", keywords),
    shortDescription: normalizeProposal(raw.shortDescription, "shortDescription", keywords),
    fullDescription: normalizeProposal(raw.fullDescription, "fullDescription", keywords),
    whatsNew: raw.whatsNew
      ? normalizeProposal(raw.whatsNew, "whatsNew", keywords)
      : undefined,
  };
}

function buildStagedChanges(
  ctx: MarketCaptureContext,
  versionA: MarketCaptureVersionProposal,
  versionB: MarketCaptureVersionProposal,
): MarketCaptureStagedChange[] {
  const fields: MarketCaptureListingField[] = [
    "title",
    "shortDescription",
    "fullDescription",
    "whatsNew",
  ];

  const changes: MarketCaptureStagedChange[] = [];

  for (const field of fields) {
    for (const [versionKey, proposal] of [
      ["A", versionA] as const,
      ["B", versionB] as const,
    ]) {
      const fieldProposal =
        field === "whatsNew" ? proposal.whatsNew : proposal[field];
      if (!fieldProposal) continue;

      changes.push({
        id: `${versionKey.toLowerCase()}-${field}`,
        field,
        version: versionKey,
        strategy: proposal.strategy,
        proposedValue: fieldProposal.value,
        currentValue: ctx.currentListing?.[field],
        rationale: fieldProposal.rationale,
        charCount: fieldProposal.charCount,
        keywordDensityPercent: fieldProposal.keywordDensityPercent,
        status: "pending",
      });
    }
  }

  return changes;
}

/** Merge model output + context into a human-reviewable Market Capture report. */
export function assembleMarketCaptureReport(
  ctx: MarketCaptureContext,
  model: MarketCaptureModelOutput,
): MarketCaptureReport {
  const keywords = ctx.growthKeywords;
  const versionA = normalizeVersion(model.versionA, keywords);
  const versionB = normalizeVersion(model.versionB, keywords);

  return {
    locale: ctx.locale,
    competitorName: ctx.competitorName,
    versionA,
    versionB,
    stagedChanges: buildStagedChanges(ctx, versionA, versionB),
    keywordsToCapture: keywords,
    competitorPainPoints: ctx.oppositionalPainPoints,
    generatedAt: new Date().toISOString(),
  };
}

/** Apply user-approved staged changes onto listing draft fields. */
export function applyApprovedStagedChanges(
  changes: MarketCaptureStagedChange[],
  current: Partial<Record<MarketCaptureListingField, string>>,
): Partial<Record<MarketCaptureListingField, string>> {
  const out = { ...current };
  const approved = changes.filter((c) => c.status === "approved");

  // Later approvals for same field win (user may pick B after A).
  for (const change of approved) {
    out[change.field] = change.proposedValue;
  }

  return out;
}

export function updateStagedChangeStatus(
  changes: MarketCaptureStagedChange[],
  changeId: string,
  status: MarketCaptureStagedChange["status"],
): MarketCaptureStagedChange[] {
  return changes.map((c) => (c.id === changeId ? { ...c, status } : c));
}
