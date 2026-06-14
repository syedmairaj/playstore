import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import { keywordTrackingMatchKeys } from "@/lib/keywords/keyword-tracking-match";
import { parseStagingVaultContent } from "@/lib/staging-vault/staging-vault-content";
import { dispatchStagingVaultChanged } from "@/lib/client/staging-vault-sync";

export type StagedDiscoveryKeyword = {
  keyword: string;
  targetAsset: ListingAssetTarget;
};

type VaultKeywordRow = {
  content?: string;
  metadata?: Record<string, unknown> | null;
};

export async function stageDiscoveryKeywordToAsset(args: {
  workspaceId: string;
  appId: string;
  keyword: string;
  targetAsset: ListingAssetTarget;
  market: string;
  language: string;
  generationId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const trimmed = args.keyword.trim();
  if (trimmed.length < 2) return { ok: false, error: "keyword_too_short" };

  const res = await fetch(`/api/workspaces/${args.workspaceId}/staging/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      signalType: "keyword",
      content: trimmed,
      source: "keyword_tracker",
      sourceAppId: args.appId,
      sourceContext: "keyword_tracker_alert",
      sourceContextId: `discovery_${args.generationId ?? "na"}_${trimmed.toLowerCase()}`,
      language: args.language.startsWith("ar") ? "ar" : "en",
      metadata: {
        targetAsset: args.targetAsset,
        discoverySource: "ai_suggested",
        listingGenerationId: args.generationId,
        countryCode: args.market.toUpperCase(),
      },
    }),
  });

  const json = (await res.json()) as { ok?: boolean; error?: { message?: string } };
  if (!res.ok || json.ok === false) {
    return { ok: false, error: json.error?.message ?? "stage_failed" };
  }

  dispatchStagingVaultChanged({
    workspaceId: args.workspaceId,
    appId: args.appId,
    locale: args.language.startsWith("ar") ? "ar" : "en",
    keyword: trimmed,
  });

  return { ok: true };
}

export function indexStagedDiscoveryKeywords(
  rows: VaultKeywordRow[],
): Map<string, ListingAssetTarget> {
  const map = new Map<string, ListingAssetTarget>();
  for (const row of rows) {
    const rawContent = String(row.content ?? "").trim();
    if (!rawContent) continue;
    const parsed = parseStagingVaultContent(rawContent);
    const content = parsed?.keyword ?? rawContent;
    const meta = row.metadata ?? {};
    const asset =
      meta.targetAsset ??
      parsed?.targetAsset;
    if (typeof asset !== "string") continue;
    if (!["title", "short_description", "full_description", "keywords"].includes(asset)) {
      continue;
    }
    const target = asset as ListingAssetTarget;
    for (const key of keywordTrackingMatchKeys(content)) {
      if (!map.has(key)) map.set(key, target);
    }
  }
  return map;
}

export async function fetchStagedDiscoveryKeywords(
  workspaceId: string,
  appId: string,
): Promise<Map<string, ListingAssetTarget>> {
  try {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/staging/list?appId=${appId}&signalType=keyword`,
      { credentials: "include", cache: "no-store" },
    );
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { keywords?: VaultKeywordRow[] };
    };
    if (!res.ok || json.ok === false) return new Map();
    const keywords = json.data?.keywords ?? [];
    return indexStagedDiscoveryKeywords(keywords);
  } catch {
    return new Map();
  }
}

export function resolveStagedAssetForKeyword(
  keyword: string,
  stagedIndex: Map<string, ListingAssetTarget>,
  localStaged: Map<string, ListingAssetTarget>,
): ListingAssetTarget | null {
  for (const key of keywordTrackingMatchKeys(keyword)) {
    if (localStaged.has(key)) return localStaged.get(key)!;
    if (stagedIndex.has(key)) return stagedIndex.get(key)!;
  }
  return null;
}
