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

/** Latest row for one workspace app (for refresh + client refetch).
 *
 * Two-pass strategy: the most-recent row supplies inputs (app_name, category,
 * target_keywords, app_features, tone_style) so the form fields reflect the
 * latest user edits.  If that row has output_json = null (an inputs-only
 * autofill row), we run a second query to find the latest row that *does*
 * carry output_json and overlay its output onto the payload so the results
 * panel is never blanked by a newer inputs-only write.
 */
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

  const payload = listingGenerationRowToHydrationPayload(
    data as ListingGenerationHydrationRow,
  );

  // If the most-recent row has no output (inputs-only autofill row), fetch the
  // latest row that does carry output_json so the results panel keeps showing.
  if (payload.output === null) {
    const { data: outputData } = await supabase
      .from("listing_generations")
      .select("id, created_at, output_json")
      .eq("workspace_id", workspaceId)
      .eq("app_id", appId)
      .not("output_json", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (outputData?.output_json != null) {
      payload.output = parseOutput(outputData.output_json);
    }
  }

  return payload;
}

/** Latest listing_generations row per workspace app (non-null app_id), plus latest workspace-only row.
 *
 * Two-pass strategy within the fetched rows: the first-seen row per app_id
 * supplies form inputs (most-recent edit).  If that row has null output_json
 * (inputs-only autofill write), we continue scanning later rows for the first
 * one that carries a non-null output_json and overlay it — so the results
 * panel is never blanked by a newer inputs-only row.
 */
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
  // Track which app_ids still need an output resolved from an older row.
  const needsOutput = new Set<string>();
  let noApp: ListingOptimizerHydrationPayload | null = null;
  let noAppNeedsOutput = false;

  for (const row of data) {
    const aid = row.app_id as string | null;
    const payload = listingGenerationRowToHydrationPayload(
      row as ListingGenerationHydrationRow,
    );

    if (aid) {
      if (!byAppId[aid]) {
        // First (most-recent) row for this app_id — use it for inputs.
        byAppId[aid] = payload;
        if (payload.output === null) needsOutput.add(aid);
      } else if (needsOutput.has(aid) && payload.output !== null) {
        // Older row has output — overlay it onto the inputs-only payload.
        byAppId[aid] = { ...byAppId[aid], output: payload.output };
        needsOutput.delete(aid);
      }
    } else {
      if (!noApp) {
        noApp = payload;
        if (payload.output === null) noAppNeedsOutput = true;
      } else if (noAppNeedsOutput && payload.output !== null) {
        // noApp is guaranteed non-null here (set in the `if (!noApp)` branch above),
        // but TypeScript can't narrow a mutable `let` across branches. Assign via
        // Object.assign into a typed local to avoid the spread narrowing bug.
        const withOutput: ListingOptimizerHydrationPayload = Object.assign(
          {},
          noApp as ListingOptimizerHydrationPayload,
          { output: payload.output },
        );
        noApp = withOutput;
        noAppNeedsOutput = false;
      }
    }

    // Early-exit once every app_id has a resolved output.
    if (needsOutput.size === 0 && !noAppNeedsOutput) break;
  }

  return { byAppId, noApp };
}
