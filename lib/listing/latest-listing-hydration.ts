import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToneStyle } from "@/lib/types/listing";
import {
  parsePersistedListingOutput,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";

const TONE_STYLES = new Set<ToneStyle>([
  "professional",
  "friendly",
  "bold",
  "minimal",
]);

export type ListingOptimizerHydrationPayload = {
  generationId: string;
  createdAt: string;
  appName: string;
  category: string;
  keywordsText: string;
  appFeatures: string;
  toneStyle: ToneStyle;
  output: ListingGenerationOutput | null;
};

function parseToneStyle(raw: unknown): ToneStyle {
  if (typeof raw === "string" && TONE_STYLES.has(raw as ToneStyle)) {
    return raw as ToneStyle;
  }
  return "professional";
}

function keywordsToDisplay(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const parts = raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.join(", ");
}

function parseOutput(raw: unknown): ListingGenerationOutput | null {
  if (raw == null) return null;
  return parsePersistedListingOutput(raw);
}

type ListingGenerationHydrationRow = {
  id: string;
  created_at: string;
  app_name?: unknown;
  category?: unknown;
  target_keywords?: unknown;
  app_features?: unknown;
  tone_style?: unknown;
  output_json?: unknown;
};

export function listingGenerationRowToHydrationPayload(
  row: ListingGenerationHydrationRow,
): ListingOptimizerHydrationPayload {
  return {
    generationId: row.id as string,
    createdAt: row.created_at as string,
    appName: typeof row.app_name === "string" ? row.app_name : "",
    category: typeof row.category === "string" ? row.category : "",
    keywordsText: keywordsToDisplay(row.target_keywords),
    appFeatures: typeof row.app_features === "string" ? row.app_features : "",
    toneStyle: parseToneStyle(row.tone_style),
    output: parseOutput(row.output_json),
  };
}

/** Latest row for one workspace app (for refresh + client refetch). */
export async function loadLatestListingHydrationForApp(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
): Promise<ListingOptimizerHydrationPayload | null> {
  const { data, error } = await supabase
    .from("listing_generations")
    .select(
      "id, created_at, app_name, category, target_keywords, app_features, tone_style, output_json",
    )
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }
  return listingGenerationRowToHydrationPayload(
    data as ListingGenerationHydrationRow,
  );
}

/** Latest listing_generations row per workspace app (non-null app_id), plus latest workspace-only row. */
export async function loadLatestListingHydrationMaps(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{
  byAppId: Record<string, ListingOptimizerHydrationPayload>;
  noApp: ListingOptimizerHydrationPayload | null;
}> {
  const { data, error } = await supabase
    .from("listing_generations")
    .select(
      "id, created_at, app_id, app_name, category, target_keywords, app_features, tone_style, output_json",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(800);

  if (error || !data?.length) {
    return { byAppId: {}, noApp: null };
  }

  const byAppId: Record<string, ListingOptimizerHydrationPayload> = {};
  let noApp: ListingOptimizerHydrationPayload | null = null;

  for (const row of data) {
    const aid = row.app_id as string | null;
    const payload = listingGenerationRowToHydrationPayload(
      row as ListingGenerationHydrationRow,
    );

    if (aid) {
      if (!byAppId[aid]) {
        byAppId[aid] = payload;
      }
    } else if (!noApp) {
      noApp = payload;
    }
  }

  return { byAppId, noApp };
}
