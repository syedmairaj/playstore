import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasLegacySignalColumns,
  hasUniversalVaultColumns,
} from "@/lib/staging-vault/staging-vault-schema";

export type CompetitorKeywordsVaultResult = {
  keywords: {
    high_volume: string[];
    intent_based: string[];
    competitor_gap: string[];
  };
  vulnerabilities: string[];
  competitor_id: string;
  competitor_name: string;
  language: "en" | "ar";
  retrieved_at: string;
};

const EMPTY_RESULT = (
  competitorId: string,
  language: "en" | "ar",
): CompetitorKeywordsVaultResult => ({
  keywords: { high_volume: [], intent_based: [], competitor_gap: [] },
  vulnerabilities: [],
  competitor_id: competitorId,
  competitor_name: "Unknown",
  language,
  retrieved_at: new Date().toISOString(),
});

function normalizeKeywordsByStrategy(
  raw: unknown,
): CompetitorKeywordsVaultResult["keywords"] {
  const empty = { high_volume: [], intent_based: [], competitor_gap: [] };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const pick = (key: string) =>
    Array.isArray(o[key])
      ? (o[key] as unknown[]).filter((k): k is string => typeof k === "string")
      : [];
  return {
    high_volume: pick("high_volume"),
    intent_based: pick("intent_based"),
    competitor_gap: pick("competitor_gap"),
  };
}

function matchFromCompetitorEntry(
  entry: Record<string, unknown>,
  competitorId: string,
): CompetitorKeywordsVaultResult | null {
  const id = String(
    entry.competitor_id ?? entry.competitorId ?? entry.id ?? "",
  ).trim();
  if (id !== competitorId) return null;

  const meta = entry as Record<string, unknown>;
  const keywordsByStrategy =
    meta.keywords_by_strategy ?? meta.keywordsByStrategy;

  return {
    keywords: normalizeKeywordsByStrategy(keywordsByStrategy),
    vulnerabilities: Array.isArray(meta.vulnerabilities)
      ? (meta.vulnerabilities as string[])
      : Array.isArray(meta.weaknesses)
        ? (meta.weaknesses as string[])
        : [],
    competitor_id: id,
    competitor_name: String(meta.competitor_name ?? meta.app_name ?? meta.name ?? "Unknown"),
    language: "en",
    retrieved_at: new Date().toISOString(),
  };
}

async function readLegacyCompetitorKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
  competitorId: string,
  language: "en" | "ar",
): Promise<CompetitorKeywordsVaultResult> {
  const { data: allData, error } = await supabase
    .from("workspace_staging_vault")
    .select("metadata, content, created_at")
    .eq("workspace_id", workspaceId)
    .eq("signal_type", "competitor_weakness")
    .eq("language", language)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[readCompetitorKeywords] legacy query failed:", error.message);
    return EMPTY_RESULT(competitorId, language);
  }

  const match = (allData ?? []).find((record) => {
    const meta = record.metadata as Record<string, unknown> | null;
    return meta?.competitor_id === competitorId;
  });

  if (!match) return EMPTY_RESULT(competitorId, language);

  const metadata = (match.metadata ?? {}) as Record<string, unknown>;
  return {
    keywords: normalizeKeywordsByStrategy(metadata.keywords_by_strategy),
    vulnerabilities: Array.isArray(metadata.vulnerabilities)
      ? (metadata.vulnerabilities as string[])
      : [],
    competitor_id: competitorId,
    competitor_name: String(metadata.competitor_name ?? "Unknown"),
    language,
    retrieved_at: new Date().toISOString(),
  };
}

async function readUniversalCompetitorKeywords(
  supabase: SupabaseClient,
  workspaceId: string,
  competitorId: string,
  language: "en" | "ar",
): Promise<CompetitorKeywordsVaultResult> {
  const stateKey = language === "ar" ? "state_ar" : "state_en";

  const { data: rows, error } = await supabase
    .from("workspace_staging_vault")
    .select(`id, ${stateKey}, is_deleted, deleted_at`)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.warn("[readCompetitorKeywords] universal query failed:", error.message);
    return EMPTY_RESULT(competitorId, language);
  }

  for (const row of rows ?? []) {
    if (row.is_deleted || row.deleted_at) continue;

    const state = row[stateKey as keyof typeof row] as Record<string, unknown> | null;
    if (!state || typeof state !== "object") continue;

    const features = (state.features ?? {}) as Record<string, unknown>;
    const competitorSpy = features.competitor_spy as Record<string, unknown> | undefined;
    const competitors = (competitorSpy?.competitors ?? []) as Array<Record<string, unknown>>;

    for (const comp of competitors) {
      const hit = matchFromCompetitorEntry(comp, competitorId);
      if (hit) return { ...hit, language };
    }

    const embedded = features.staged_signals as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(embedded)) {
      for (const sig of embedded) {
        if (String(sig.signal_type ?? "") !== "competitor_weakness") continue;
        const meta = (sig.metadata ?? {}) as Record<string, unknown>;
        if (String(meta.competitor_id ?? "") !== competitorId) continue;
        return {
          keywords: normalizeKeywordsByStrategy(meta.keywords_by_strategy),
          vulnerabilities: Array.isArray(meta.vulnerabilities)
            ? (meta.vulnerabilities as string[])
            : [],
          competitor_id: competitorId,
          competitor_name: String(meta.competitor_name ?? "Unknown"),
          language,
          retrieved_at: String(sig.created_at ?? new Date().toISOString()),
        };
      }
    }
  }

  return EMPTY_RESULT(competitorId, language);
}

export async function readCompetitorKeywordsFromVault(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    competitorId: string;
    language: "en" | "ar";
  },
): Promise<CompetitorKeywordsVaultResult> {
  const legacyAvailable = await hasLegacySignalColumns(supabase);
  if (legacyAvailable) {
    return readLegacyCompetitorKeywords(
      supabase,
      args.workspaceId,
      args.competitorId,
      args.language,
    );
  }

  const universalAvailable = await hasUniversalVaultColumns(supabase);
  if (universalAvailable) {
    return readUniversalCompetitorKeywords(
      supabase,
      args.workspaceId,
      args.competitorId,
      args.language,
    );
  }

  return EMPTY_RESULT(args.competitorId, args.language);
}
