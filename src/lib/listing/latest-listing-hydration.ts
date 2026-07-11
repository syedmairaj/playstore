import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToneStyle } from "@/lib/types/listing";
import {
  parsePersistedListingOutput,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";
import { assembleModularFullDescription } from "@/lib/listing/assemble-modular-listing";
import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import {
  isListingPublicationUnlocked,
  listingOutputForPublicationState,
} from "@/lib/listing/listing-export-unlock";
import { hasConfiguredDiscoveryInputs } from "@/lib/client/app-discovery-context";

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
  /** True when credits were spent for publication-ready copy (not free instant draft). */
  publicationUnlocked: boolean;
  /** Distinguishes auto instant-draft preview rows from user-configured discovery. */
  promptVersion?: string | null;
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
  updated_at?: string;
  app_name?: unknown;
  category?: unknown;
  target_keywords?: unknown;
  app_features?: unknown;
  tone_style?: unknown;
  output_json?: unknown;
  credits_ledger_id?: string | null;
  prompt_version?: string | null;
};

function publicationUnlockedFromRow(row: {
  credits_ledger_id?: string | null;
  prompt_version?: string | null;
}): boolean {
  return isListingPublicationUnlocked({
    creditsLedgerId: row.credits_ledger_id ?? null,
    promptVersion: row.prompt_version ?? null,
  });
}

export function listingGenerationRowToHydrationPayload(
  row: ListingGenerationHydrationRow,
): ListingOptimizerHydrationPayload {
  const publicationUnlocked = publicationUnlockedFromRow(row);
  const rawOutput = parseOutput(row.output_json);
  return {
    generationId: row.id as string,
    createdAt: genUpdatedAt(row),
    appName: typeof row.app_name === "string" ? row.app_name : "",
    category: typeof row.category === "string" ? row.category : "",
    keywordsText: keywordsToDisplay(row.target_keywords),
    appFeatures: typeof row.app_features === "string" ? row.app_features : "",
    toneStyle: parseToneStyle(row.tone_style),
    output: rawOutput
      ? listingOutputForPublicationState(rawOutput, publicationUnlocked)
      : null,
    publicationUnlocked,
    promptVersion:
      typeof row.prompt_version === "string" ? row.prompt_version : null,
  };
}

/** Convert a `workspace_listing_drafts` modular_listing to a flat ListingGenerationOutput. */
function draftModularToOutput(
  modular: ModularListingState,
): ListingGenerationOutput | null {
  const title = modular.title?.value?.trim() ?? "";
  const variations = modular.shortDescription?.variations ?? [];
  const selectedIdx = modular.shortDescription?.selectedIndex ?? 0;
  const shortText =
    variations[selectedIdx]?.text?.trim() ??
    variations[0]?.text?.trim() ??
    "";
  const fullDescription = assembleModularFullDescription(
    modular.longDescription ?? { hook: "", features: "", closing: "" },
  ).trim();

  if (!title && !shortText && !fullDescription) return null;

  return {
    title,
    shortDescription: shortText,
    fullDescription,
    keywordSuggestions: [],
    ctaSuggestions: [],
  };
}

type DraftRowMinimal = {
  id: string;
  updated_at: string;
  app_id?: string | null;
  app_name?: unknown;
  modular_listing?: ModularListingState | null;
};

function genUpdatedAt(row: ListingGenerationHydrationRow): string {
  return typeof row.updated_at === "string" && row.updated_at.trim()
    ? row.updated_at.trim()
    : (row.created_at as string);
}

export function applyDraftOverlayIfPreferred(
  payload: ListingOptimizerHydrationPayload,
  genRow: ListingGenerationHydrationRow,
  draftRow: DraftRowMinimal | null,
): void {
  if (!draftRow?.modular_listing) return;

  // Full unlock persists paid copy to listing_generations and then updates the
  // modular draft row (title/short/full). The draft row is often newer than the
  // generation row — never replace a paid unlock with preview-only draft output.
  if (publicationUnlockedFromRow(genRow)) return;

  const draftOutput = draftModularToOutput(draftRow.modular_listing);
  if (!draftOutput) return;

  const genTs = genUpdatedAt(genRow);
  const draftIsNewerOrEqual = draftRow.updated_at >= genTs;

  const preferDraft =
    draftIsNewerOrEqual ||
    Boolean(
      draftOutput.title.trim() ||
        draftOutput.shortDescription.trim() ||
        draftOutput.fullDescription.trim(),
    );

  if (!preferDraft) return;

  payload.output = draftOutput;
  payload.publicationUnlocked = false;
  payload.createdAt = draftRow.updated_at;
  payload.generationId = draftRow.id;
  if (typeof draftRow.app_name === "string" && draftRow.app_name.trim()) {
    payload.appName = draftRow.app_name.trim();
  }
}

function sanitizeHydrationPayload(
  payload: ListingOptimizerHydrationPayload,
): void {
  if (payload.output && !payload.publicationUnlocked) {
    payload.output = listingOutputForPublicationState(
      payload.output,
      false,
    );
  }
  if (
    !payload.publicationUnlocked &&
    !hasConfiguredDiscoveryInputs(payload.keywordsText, payload.appFeatures)
  ) {
    payload.output = null;
  }
}

async function fetchLatestDraftRowForApp(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
): Promise<DraftRowMinimal | null> {
  const { data } = await supabase
    .from("workspace_listing_drafts")
    .select("id, updated_at, app_id, app_name, modular_listing")
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .not("modular_listing", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as DraftRowMinimal | null) ?? null;
}

async function fetchLatestDraftRowsByApp(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{
  byAppId: Record<string, DraftRowMinimal>;
  workspaceWideDraft: DraftRowMinimal | null;
}> {
  const { data } = await supabase
    .from("workspace_listing_drafts")
    .select("id, updated_at, app_id, app_name, modular_listing")
    .eq("workspace_id", workspaceId)
    .not("modular_listing", "is", null)
    .order("updated_at", { ascending: false })
    .limit(800);

  const byAppId: Record<string, DraftRowMinimal> = {};
  let workspaceWideDraft: DraftRowMinimal | null = null;
  for (const row of data ?? []) {
    const aid = row.app_id as string | null;
    if (aid) {
      if (!byAppId[aid]) {
        byAppId[aid] = row as DraftRowMinimal;
      }
    } else if (!workspaceWideDraft) {
      workspaceWideDraft = row as DraftRowMinimal;
    }
  }
  return { byAppId, workspaceWideDraft };
}

/** Latest row for one workspace app (for refresh + client refetch). */
export async function loadLatestListingHydrationForApp(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  userId?: string,
): Promise<ListingOptimizerHydrationPayload | null> {
  let genQuery = supabase
    .from("listing_generations")
    .select(
      "id, created_at, updated_at, app_name, category, target_keywords, app_features, tone_style, output_json, credits_ledger_id, prompt_version",
    )
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId);

  if (userId?.trim()) {
    genQuery = genQuery.eq("user_id", userId.trim());
  }

  const [genResult, draftResult] = await Promise.all([
    genQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    fetchLatestDraftRowForApp(supabase, workspaceId, appId),
  ]);

  const { data, error } = genResult;
  const draftRow = draftResult;

  if (error || !data?.id) {
    if (!draftRow?.modular_listing) return null;
    const draftOutput = draftModularToOutput(draftRow.modular_listing);
    if (!draftOutput) return null;
    return {
      generationId: draftRow.id,
      createdAt: draftRow.updated_at,
      appName: typeof draftRow.app_name === "string" ? draftRow.app_name : "",
      category: "",
      keywordsText: "",
      appFeatures: "",
      toneStyle: "professional",
      output: null,
      publicationUnlocked: false,
    };
  }

  const genRow = data as ListingGenerationHydrationRow;
  const payload = listingGenerationRowToHydrationPayload(genRow);

  if (payload.output === null) {
    if (draftRow?.modular_listing) {
      const draftOutput = draftModularToOutput(draftRow.modular_listing);
      if (draftOutput) {
        payload.output = draftOutput;
        payload.publicationUnlocked = false;
        payload.createdAt = draftRow.updated_at;
        payload.generationId = draftRow.id;
      }
    } else {
      let outputQuery = supabase
        .from("listing_generations")
        .select(
          "id, created_at, updated_at, output_json, credits_ledger_id, prompt_version",
        )
        .eq("workspace_id", workspaceId)
        .eq("app_id", appId)
        .not("output_json", "is", null);
      if (userId?.trim()) {
        outputQuery = outputQuery.eq("user_id", userId.trim());
      }
      const { data: outputData } = await outputQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (outputData?.output_json != null) {
        const fallbackUnlocked = publicationUnlockedFromRow(outputData);
        const parsed = parseOutput(outputData.output_json);
        payload.output = parsed
          ? listingOutputForPublicationState(parsed, fallbackUnlocked)
          : null;
        payload.publicationUnlocked = fallbackUnlocked;
      }
    }
  }

  applyDraftOverlayIfPreferred(payload, genRow, draftRow);
  sanitizeHydrationPayload(payload);
  return payload;
}

/** Latest listing_generations row per workspace app (non-null app_id), plus latest workspace-only row. */
export async function loadLatestListingHydrationMaps(
  supabase: SupabaseClient,
  workspaceId: string,
  userId?: string,
): Promise<{
  byAppId: Record<string, ListingOptimizerHydrationPayload>;
  noApp: ListingOptimizerHydrationPayload | null;
}> {
  let genListQuery = supabase
    .from("listing_generations")
    .select(
      "id, created_at, updated_at, app_id, app_name, category, target_keywords, app_features, tone_style, output_json, credits_ledger_id, prompt_version",
    )
    .eq("workspace_id", workspaceId);

  if (userId?.trim()) {
    genListQuery = genListQuery.eq("user_id", userId.trim());
  }

  const [genResult, draftLookup] = await Promise.all([
    genListQuery.order("updated_at", { ascending: false }).limit(800),
    fetchLatestDraftRowsByApp(supabase, workspaceId),
  ]);

  const { data, error } = genResult;
  const { byAppId: draftByAppId, workspaceWideDraft } = draftLookup;

  if (error || !data?.length) {
    return { byAppId: {}, noApp: null };
  }

  const byAppId: Record<string, ListingOptimizerHydrationPayload> = {};
  const genRowByAppId: Record<string, ListingGenerationHydrationRow> = {};
  const needsOutput = new Set<string>();
  let noApp: ListingOptimizerHydrationPayload | null = null;
  let noAppNeedsOutput = false;
  let noAppGenRow: ListingGenerationHydrationRow | null = null;

  for (const row of data) {
    const aid = row.app_id as string | null;
    const genRow = row as ListingGenerationHydrationRow;
    const payload = listingGenerationRowToHydrationPayload(genRow);

    if (aid) {
      if (!byAppId[aid]) {
        byAppId[aid] = payload;
        genRowByAppId[aid] = genRow;
        if (payload.output === null) needsOutput.add(aid);
      } else if (needsOutput.has(aid) && payload.output !== null) {
        const fallbackUnlocked = publicationUnlockedFromRow(genRow);
        byAppId[aid] = {
          ...byAppId[aid],
          output: listingOutputForPublicationState(
            payload.output,
            fallbackUnlocked,
          ),
          publicationUnlocked: fallbackUnlocked,
        };
        needsOutput.delete(aid);
      }
    } else {
      if (!noApp) {
        noApp = payload;
        noAppGenRow = genRow;
        if (payload.output === null) noAppNeedsOutput = true;
      } else if (noAppNeedsOutput && payload.output !== null) {
        const fallbackUnlocked = publicationUnlockedFromRow(genRow);
        const withOutput: ListingOptimizerHydrationPayload = Object.assign(
          {},
          noApp as ListingOptimizerHydrationPayload,
          {
            output: listingOutputForPublicationState(
              payload.output,
              fallbackUnlocked,
            ),
            publicationUnlocked: fallbackUnlocked,
          },
        );
        noApp = withOutput;
        noAppNeedsOutput = false;
      }
    }

    if (needsOutput.size === 0 && !noAppNeedsOutput) break;
  }

  for (const [aid, payload] of Object.entries(byAppId)) {
    const draftRow = draftByAppId[aid] ?? null;
    const genRow = genRowByAppId[aid];
    if (genRow) {
      applyDraftOverlayIfPreferred(payload, genRow, draftRow);
      sanitizeHydrationPayload(payload);
    }
  }

  if (noApp && noAppGenRow && workspaceWideDraft) {
    applyDraftOverlayIfPreferred(noApp, noAppGenRow, workspaceWideDraft);
    sanitizeHydrationPayload(noApp);
  }

  return { byAppId, noApp };
}
