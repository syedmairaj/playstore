/**
 * Keyword Tracker Producer
 *
 * Owns: state_{locale}.features.keyword_tracker.*
 * Stages discovery / tracker keywords into the universal vault for ASO sandbox sync.
 */
import {
  buildStagingVaultContentPayload,
  serialiseStagingVaultContent,
} from "@/lib/staging-vault/staging-vault-content";
import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import { StagedStateProducer, WorkspaceStagingVault } from "@/lib/staging/vault.types";

export type KeywordTrackerStagePayload = {
  keyword: string;
  targetAsset?: ListingAssetTarget;
  descriptionDraft?: string;
  market?: string;
  discoverySource?: string;
  listingGenerationId?: string;
};

function keywordKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, "_");
}

export class KeywordTrackerProducer implements StagedStateProducer {
  readonly featureKey = "keyword_tracker";
  readonly locales: ("en" | "ar")[] = ["en", "ar"];
  readonly schema = {};

  async produce(
    vault: WorkspaceStagingVault,
    input: KeywordTrackerStagePayload,
    locale: "en" | "ar",
    userId: string,
  ): Promise<WorkspaceStagingVault> {
    const state = locale === "en" ? vault.state_en : vault.state_ar;
    const features = { ...state.features };
    const now = new Date().toISOString();

    const contentPayload = buildStagingVaultContentPayload({
      keyword: input.keyword,
      language: locale,
      metadata: {
        targetAsset: input.targetAsset,
        descriptionDraft: input.descriptionDraft,
        discoverySource: input.discoverySource,
        listingGenerationId: input.listingGenerationId,
        market: input.market,
      },
    });

    const key = keywordKey(contentPayload.keyword);
    const kt = { ...((features.keyword_tracker ?? {}) as Record<string, unknown>) };
    const signals = { ...((kt.signals ?? {}) as Record<string, unknown>) };
    signals[key] = {
      keyword: contentPayload.keyword,
      target_asset: contentPayload.targetAsset ?? null,
      description_draft: contentPayload.descriptionDraft ?? null,
      staged_at: contentPayload.stagedAt,
      discovery_source: contentPayload.discoverySource ?? "keyword_tracker",
      listing_generation_id: contentPayload.listingGenerationId ?? null,
      market: contentPayload.market ?? null,
      locale,
      confidence: 70,
      difficulty: 5,
      search_volume: 0,
      recommendation: "MEDIUM_OPPORTUNITY",
    };
    kt.signals = signals;
    features.keyword_tracker = kt;

    const embedded = Array.isArray(features.staged_signals)
      ? [...(features.staged_signals as Record<string, unknown>[])]
      : [];
    embedded.unshift({
      id: `kt-${key}-${Date.now()}`,
      signal_type: "keyword",
      content: serialiseStagingVaultContent(contentPayload),
      source: "keyword_tracker",
      source_context: "keyword_tracker_alert",
      source_context_id: key,
      created_at: now,
      metadata: { content_payload: contentPayload, targetAsset: contentPayload.targetAsset },
    });
    features.staged_signals = embedded.slice(0, 50);

    const nextState = {
      ...state,
      features,
      metadata: {
        ...state.metadata,
        last_producer: this.featureKey,
        last_producer_timestamp: now,
      },
    };

    const activeFeatures = new Set(vault.active_features);
    activeFeatures.add(this.featureKey);

    return {
      ...vault,
      state_en: locale === "en" ? nextState : vault.state_en,
      state_ar: locale === "ar" ? nextState : vault.state_ar,
      active_features: [...activeFeatures],
      last_modified_by: userId,
      change_count: vault.change_count + 1,
      updated_at: new Date(),
    };
  }

  async validate(input: KeywordTrackerStagePayload): Promise<boolean> {
    return typeof input?.keyword === "string" && input.keyword.trim().length >= 2;
  }
}
