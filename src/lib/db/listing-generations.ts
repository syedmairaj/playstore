import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import {
  INSTANT_DRAFT_PROMPT_VERSION,
  stripPaidListingExtras,
} from "@/lib/listing/listing-export-unlock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const AUTOFILL_INPUTS_PROMPT_VERSION = "optimizer-autofill-inputs-v1";

export type ListingGenerationPersistParams = {
  input: Pick<
    ListingOptimizerInput,
    "appName" | "category" | "targetKeywords" | "appFeatures" | "toneStyle"
  >;
  output: ListingGenerationOutput | null;
  clientIp: string;
  model: string;
  promptVersion: string;
  workspaceId: string;
  userId: string;
  creditsLedgerId?: string | null;
  appId?: string | null;
};

export type ListingGenerationPersistResult =
  | { ok: true; id: string; createdAt: string; updatedAt: string }
  | { ok: false; message: string };

function buildListingGenerationRow(params: ListingGenerationPersistParams) {
  return {
    app_name: params.input.appName,
    category: params.input.category,
    target_keywords: params.input.targetKeywords,
    app_features: params.input.appFeatures,
    tone_style: params.input.toneStyle,
    client_ip: params.clientIp.slice(0, 128),
    model: params.model,
    output_json: params.output,
    prompt_version: params.promptVersion,
    workspace_id: params.workspaceId,
    user_id: params.userId,
    tool_type: "aso_listing",
    credits_ledger_id: params.creditsLedgerId ?? null,
    app_id: params.appId ?? null,
  };
}

async function findListingSessionRow(
  supabase: SupabaseClient,
  params: Pick<ListingGenerationPersistParams, "workspaceId" | "userId" | "appId">,
) {
  let query = supabase
    .from("listing_generations")
    .select("id, created_at, updated_at, output_json")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId);

  if (params.appId) {
    query = query.eq("app_id", params.appId);
  } else {
    query = query.is("app_id", null);
  }

  return query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

/**
 * Upsert the canonical listing_generations session row for a workspace (+ optional app).
 * Uses select-then-update/insert — partial unique indexes do not support PostgREST upsert onConflict.
 */
export async function upsertListingGeneration(
  supabase: SupabaseClient,
  params: ListingGenerationPersistParams,
): Promise<ListingGenerationPersistResult> {
  const row = buildListingGenerationRow(params);
  const existing = await findListingSessionRow(supabase, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    appId: params.appId,
  });

  if (existing.error) {
    return { ok: false, message: existing.error.message };
  }

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("listing_generations")
      .update(row)
      .eq("id", existing.data.id)
      .eq("workspace_id", params.workspaceId)
      .eq("user_id", params.userId)
      .select("id, created_at, updated_at")
      .maybeSingle();

    if (error || !data?.id || !data.created_at || !data.updated_at) {
      return { ok: false, message: error?.message ?? "Update failed" };
    }

    return {
      ok: true,
      id: data.id as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  const { data, error } = await supabase
    .from("listing_generations")
    .insert(row)
    .select("id, created_at, updated_at")
    .maybeSingle();

  if (error?.code === "23505") {
    return upsertListingGeneration(supabase, params);
  }

  if (error || !data?.id || !data.created_at || !data.updated_at) {
    return { ok: false, message: error?.message ?? "Insert failed" };
  }

  return {
    ok: true,
    id: data.id as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

/** @deprecated Prefer `upsertListingGeneration` — kept for call-site compatibility. */
export async function insertListingGeneration(
  supabase: SupabaseClient,
  params: {
    input: ListingOptimizerInput;
    output: ListingGenerationOutput;
    clientIp: string;
    model: string;
    promptVersion: string;
    workspaceId: string;
    userId: string;
    creditsLedgerId?: string | null;
    appId?: string | null;
  },
): Promise<ListingGenerationPersistResult> {
  return upsertListingGeneration(supabase, params);
}

/** Persist AI autofill keywords/features onto the session row without clearing prior output_json. */
export async function upsertOptimizerInputsAfterAutofill(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    appId: string;
    appName: string;
    category: string;
    targetKeywords: string[];
    appFeatures: string;
    toneStyle: ToneStyle;
    clientIp: string;
    model: string;
  },
): Promise<
  | { ok: true; generationId: string; createdAt: string; updatedAt: string }
  | { ok: false; message: string }
> {
  const session = await findListingSessionRow(supabase, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    appId: params.appId,
  });

  if (session.error) {
    return { ok: false, message: session.error.message };
  }

  const inputPatch = {
    app_name: params.appName,
    category: params.category,
    target_keywords: params.targetKeywords,
    app_features: params.appFeatures,
    tone_style: params.toneStyle,
    client_ip: params.clientIp.slice(0, 128),
    model: params.model,
    prompt_version: AUTOFILL_INPUTS_PROMPT_VERSION,
  };

  if (session.data?.id) {
    const { data: updated, error: updErr } = await supabase
      .from("listing_generations")
      .update(inputPatch)
      .eq("id", session.data.id)
      .eq("workspace_id", params.workspaceId)
      .eq("user_id", params.userId)
      .select("id, created_at, updated_at")
      .maybeSingle();

    if (updErr) {
      return { ok: false, message: updErr.message };
    }
    if (updated?.id && updated.created_at && updated.updated_at) {
      return {
        ok: true,
        generationId: updated.id as string,
        createdAt: updated.created_at as string,
        updatedAt: updated.updated_at as string,
      };
    }
  }

  const inserted = await upsertListingGeneration(supabase, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    appId: params.appId,
    clientIp: params.clientIp,
    model: params.model,
    promptVersion: AUTOFILL_INPUTS_PROMPT_VERSION,
    creditsLedgerId: null,
    output: null,
    input: {
      appName: params.appName,
      category: params.category,
      targetKeywords: params.targetKeywords,
      appFeatures: params.appFeatures,
      toneStyle: params.toneStyle,
    },
  });

  if (!inserted.ok) {
    return { ok: false, message: inserted.message };
  }

  return {
    ok: true,
    generationId: inserted.id,
    createdAt: inserted.createdAt,
    updatedAt: inserted.updatedAt,
  };
}

/**
 * Back-fills `app_features` and `target_keywords` on a listing_generations row
 * with the AI-generated values so that a page refresh hydrates the correct copy
 * instead of the pre-generation user input.
 */
export async function patchListingGenerationInputs(
  supabase: SupabaseClient,
  params: {
    generationId: string;
    userId: string;
    workspaceId: string;
    appFeatures: string;
    targetKeywords: string[];
  },
): Promise<void> {
  try {
    await supabase
      .from("listing_generations")
      .update({
        app_features: params.appFeatures,
        target_keywords: params.targetKeywords,
      })
      .eq("id", params.generationId)
      .eq("user_id", params.userId)
      .eq("workspace_id", params.workspaceId);
  } catch {
    // Best-effort — never throw
  }
}

/** Link a credits_ledger spend row after billing succeeds (post-generation debit). */
export async function patchListingGenerationCreditsLedger(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    appId?: string | null;
    creditsLedgerId: string;
  },
): Promise<void> {
  let query = supabase
    .from("listing_generations")
    .update({ credits_ledger_id: params.creditsLedgerId })
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId);

  if (params.appId) {
    query = query.eq("app_id", params.appId);
  } else {
    query = query.is("app_id", null);
  }

  let { error } = await query;
  if (error) {
    let adminQuery = getSupabaseAdmin()
      .from("listing_generations")
      .update({ credits_ledger_id: params.creditsLedgerId })
      .eq("workspace_id", params.workspaceId)
      .eq("user_id", params.userId);
    if (params.appId) {
      adminQuery = adminQuery.eq("app_id", params.appId);
    } else {
      adminQuery = adminQuery.is("app_id", null);
    }
    const adminPatch = await adminQuery;
    error = adminPatch.error;
  }

  if (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_credits_ledger_patch_failed",
        workspaceId: params.workspaceId,
        message: error.message,
      }),
    );
  }
}

export async function patchListingGenerationPreviewOutput(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    appId: string;
    output: ListingGenerationOutput;
  },
): Promise<void> {
  const { error } = await supabase
    .from("listing_generations")
    .update({
      output_json: stripPaidListingExtras(params.output),
      prompt_version: INSTANT_DRAFT_PROMPT_VERSION,
    })
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("app_id", params.appId);

  if (error) {
    console.warn(
      JSON.stringify({
        event: "listing_generation_preview_output_patch_failed",
        workspaceId: params.workspaceId,
        appId: params.appId,
        message: error.message,
      }),
    );
  }
}

export async function fetchListingPublicationUnlockState(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    appId: string;
  },
): Promise<{ creditsLedgerId: string | null; promptVersion: string | null } | null> {
  const { data, error } = await supabase
    .from("listing_generations")
    .select("credits_ledger_id, prompt_version")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .eq("app_id", params.appId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    creditsLedgerId: (data.credits_ledger_id as string | null) ?? null,
    promptVersion: (data.prompt_version as string | null) ?? null,
  };
}
