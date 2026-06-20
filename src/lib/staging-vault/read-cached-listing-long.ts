import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import { loadLatestListingHydrationForApp } from "@/lib/listing/latest-listing-hydration";

function hasSubstantiveLong(partial?: Partial<ModularLongStepData>): boolean {
  if (!partial) return false;
  return Boolean(
    partial.hook?.trim() || partial.features?.trim() || partial.closing?.trim(),
  );
}

/** Split persisted full description into modular blocks (best-effort). */
export function splitFullDescriptionToModularLong(
  fullDescription: string,
): ModularLongStepData {
  const parts = fullDescription
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { hook: "", features: "", closing: "" };
  }
  if (parts.length === 1) {
    return { hook: "", features: parts[0], closing: "" };
  }
  if (parts.length === 2) {
    return { hook: parts[0], features: "", closing: parts[1] };
  }

  return {
    hook: parts[0],
    features: parts.slice(1, -1).join("\n\n"),
    closing: parts[parts.length - 1],
  };
}

function normalizePartialLong(partial: Partial<ModularLongStepData>): ModularLongStepData {
  return {
    hook: partial.hook?.trim() ?? "",
    features: partial.features?.trim() ?? "",
    closing: partial.closing?.trim() ?? "",
  };
}

function readDescriptionDraftFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const direct =
    (typeof metadata.descriptionDraft === "string" && metadata.descriptionDraft.trim()) ||
    (typeof metadata.description_draft === "string" && metadata.description_draft.trim()) ||
    "";
  if (direct) return direct;

  const payload = metadata.content_payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.descriptionDraft === "string" && p.descriptionDraft.trim()) {
      return p.descriptionDraft.trim();
    }
  }
  return null;
}

async function readStagingVaultDescriptionDraft(
  supabase: SupabaseClient,
  workspaceId: string,
  appId?: string,
): Promise<string | null> {
  let query = supabase
    .from("workspace_staging_vault")
    .select("content, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (appId) {
    query = query.eq("app_id", appId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return null;

  for (const row of data) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const draft = readDescriptionDraftFromMetadata(meta);
    if (draft && draft.length >= 120) return draft;

    const content = typeof row.content === "string" ? row.content.trim() : "";
    if (content.length >= 400 && !content.startsWith("{")) {
      return content;
    }
  }

  return null;
}

/**
 * Best-available cached long copy (VaultCore-backed staging vault + listing_generations).
 */
export async function readVaultCachedModularLong(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    appId?: string;
    inlineFallback?: Partial<ModularLongStepData>;
  },
): Promise<ModularLongStepData | null> {
  if (hasSubstantiveLong(params.inlineFallback)) {
    return normalizePartialLong(params.inlineFallback!);
  }

  if (params.appId) {
    const hydration = await loadLatestListingHydrationForApp(
      supabase,
      params.workspaceId,
      params.appId,
    );
    const full = hydration?.output?.fullDescription?.trim();
    if (full && full.length >= 120) {
      return splitFullDescriptionToModularLong(full);
    }
  }

  const vaultDraft = await readStagingVaultDescriptionDraft(
    supabase,
    params.workspaceId,
    params.appId,
  );
  if (vaultDraft) {
    return splitFullDescriptionToModularLong(vaultDraft);
  }

  return null;
}
