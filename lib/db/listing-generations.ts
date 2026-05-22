import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingOptimizerInput, ToneStyle } from "@/lib/types/listing";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

const AUTOFILL_INPUTS_PROMPT_VERSION = "optimizer-autofill-inputs-v1";

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
): Promise<
  | { ok: true; id: string; createdAt: string }
  | { ok: false; message: string }
> {
  const { data, error } = await supabase
    .from("listing_generations")
    .insert({
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
    })
    .select("id, created_at")
    .single();
  if (error || !data?.id || !data.created_at) {
    return { ok: false, message: error?.message ?? "Insert failed" };
  }
  return {
    ok: true,
    id: data.id as string,
    createdAt: data.created_at as string,
  };
}

/** Persist AI autofill keywords/features onto the latest generation row for this app (same user only per RLS), or insert a new inputs-only row. */
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
  | { ok: true; generationId: string; createdAt: string }
  | { ok: false; message: string }
> {
  const { data: latest, error: selErr } = await supabase
    .from("listing_generations")
    .select("id, user_id")
    .eq("workspace_id", params.workspaceId)
    .eq("app_id", params.appId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    return { ok: false, message: selErr.message };
  }

  const insertInputsOnly = async () => {
    const { data: inserted, error: insErr } = await supabase
      .from("listing_generations")
      .insert({
        workspace_id: params.workspaceId,
        user_id: params.userId,
        app_id: params.appId,
        app_name: params.appName,
        category: params.category,
        target_keywords: params.targetKeywords,
        app_features: params.appFeatures,
        tone_style: params.toneStyle,
        client_ip: params.clientIp.slice(0, 128),
        model: params.model,
        prompt_version: AUTOFILL_INPUTS_PROMPT_VERSION,
        output_json: null,
        tool_type: "aso_listing",
        credits_ledger_id: null,
      })
      .select("id, created_at")
      .single();

    if (insErr || !inserted?.id || !inserted.created_at) {
      return {
        ok: false as const,
        message: insErr?.message ?? "Insert failed",
      };
    }
    return {
      ok: true as const,
      generationId: inserted.id as string,
      createdAt: inserted.created_at as string,
    };
  };

  if (latest?.id && latest.user_id === params.userId) {
    const { data: updated, error: updErr } = await supabase
      .from("listing_generations")
      .update({
        app_name: params.appName,
        category: params.category,
        target_keywords: params.targetKeywords,
        app_features: params.appFeatures,
        tone_style: params.toneStyle,
      })
      .eq("id", latest.id)
      .eq("user_id", params.userId)
      .select("id, created_at")
      .maybeSingle();

    if (updErr) {
      return { ok: false, message: updErr.message };
    }
    if (updated?.id && updated.created_at) {
      return {
        ok: true,
        generationId: updated.id as string,
        createdAt: updated.created_at as string,
      };
    }
  }

  return insertInputsOnly();
}

/**
 * Back-fills `app_features` and `target_keywords` on a listing_generations row
 * with the AI-generated values so that a page refresh hydrates the correct copy
 * instead of the pre-generation user input.
 *
 * Only updates rows owned by `userId` (RLS double-check). Returns silently on
 * any error — this is a best-effort background patch; it must never fail the
 * generation response path.
 */
export async function patchListingGenerationInputs(
  supabase: SupabaseClient,
  params: {
    generationId: string;
    userId: string;
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
      .eq("user_id", params.userId);
  } catch {
    // Best-effort — never throw
  }
}
