import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";

/** Structured payload stored in `content` (JSON text) and mirrored in metadata. */
export type StagingVaultContentPayload = {
  version: 1;
  keyword: string;
  targetAsset?: ListingAssetTarget;
  descriptionDraft?: string;
  locale: "en" | "ar";
  discoverySource?: "ai_suggested" | "keyword_tracker" | "manual";
  listingGenerationId?: string;
  market?: string;
  stagedAt: string;
};

export function buildStagingVaultContentPayload(args: {
  keyword: string;
  language: string;
  metadata?: Record<string, unknown>;
}): StagingVaultContentPayload {
  const meta = args.metadata ?? {};
  const locale: "en" | "ar" = String(args.language).startsWith("ar") ? "ar" : "en";
  const keyword = args.keyword.trim();
  const targetAsset = meta.targetAsset as ListingAssetTarget | undefined;
  const descriptionDraft =
    typeof meta.descriptionDraft === "string"
      ? meta.descriptionDraft
      : typeof meta.description_draft === "string"
        ? meta.description_draft
        : undefined;

  return {
    version: 1,
    keyword,
    ...(targetAsset ? { targetAsset } : {}),
    ...(descriptionDraft ? { descriptionDraft } : {}),
    locale,
    discoverySource:
      meta.discoverySource === "ai_suggested" ||
      meta.discovery_source === "ai_suggested"
        ? "ai_suggested"
        : meta.discoverySource === "keyword_tracker"
          ? "keyword_tracker"
          : undefined,
    listingGenerationId:
      typeof meta.listingGenerationId === "string"
        ? meta.listingGenerationId
        : typeof meta.listing_generation_id === "string"
          ? meta.listing_generation_id
          : undefined,
    market:
      typeof meta.countryCode === "string"
        ? meta.countryCode.toLowerCase()
        : typeof meta.market === "string"
          ? meta.market.toLowerCase()
          : undefined,
    stagedAt: new Date().toISOString(),
  };
}

/** Serialise for TEXT `content` column — valid JSON, UTF-8 safe for EN/AR. */
export function serialiseStagingVaultContent(payload: StagingVaultContentPayload): string {
  return JSON.stringify(payload);
}

export function parseStagingVaultContent(raw: string): StagingVaultContentPayload | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as StagingVaultContentPayload;
    if (parsed?.version !== 1 || typeof parsed.keyword !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
