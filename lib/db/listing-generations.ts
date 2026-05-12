import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ListingOptimizerInput } from "@/lib/types/listing";

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
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("listing_generations").insert({
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
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
