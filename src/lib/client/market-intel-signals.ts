import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import type { StagingVaultOriginModule } from "@/lib/staging-vault/staging-vault-metadata";

/** Only user-curated Market Intel spotlight keywords belong in Market Intelligence Signals. */
export function isExplicitMarketIntelStagedItem(
  item: Pick<OptimizationQueueItem, "source" | "metadata">,
): boolean {
  const meta = item.metadata ?? {};
  const origin = String(
    meta.origin_module ?? meta.source_origin ?? item.source ?? "",
  ).toLowerCase();

  const isMarketIntel =
    origin === "market_intel" ||
    origin === "market_intelligence" ||
    item.source === "market_intel";

  if (!isMarketIntel) return false;

  // `source === market_intel` is the SSOT — only the Market Intel curation pipeline writes it.
  // Metadata flags may be absent after legacy slimMetadata passes; treat source as explicit.
  return (
    item.source === "market_intel" ||
    meta.user_selected_boolean === true ||
    meta.from_keyword_spotlight === true
  );
}

const SOURCE_LABELS: Record<
  StagingVaultOriginModule | "market_intelligence",
  { en: string; ar: string }
> = {
  market_intel: { en: "Market Intel", ar: "ذكاء السوق" },
  market_intelligence: { en: "Market Intel", ar: "ذكاء السوق" },
  review_analysis: { en: "Reviews", ar: "المراجعات" },
  competitor_spy: { en: "Competitor Spy", ar: "تجسس المنافسين" },
  keyword_tracker: { en: "Keyword Tracker", ar: "متتبع الكلمات" },
  manual: { en: "Manual", ar: "يدوي" },
  api: { en: "API", ar: "واجهة برمجية" },
};

export function resolveOriginModuleLabel(
  metadata: Record<string, unknown> | undefined,
  locale: "en" | "ar",
): string {
  const raw = metadata?.origin_module ?? metadata?.source_origin;
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "market_intel";
  const labels =
    SOURCE_LABELS[key as keyof typeof SOURCE_LABELS] ?? SOURCE_LABELS.market_intel;
  return labels[locale];
}

export function marketIntelSignalsSectionId(): string {
  return "market-intelligence-signals";
}
