import type { SupabaseClient } from "@supabase/supabase-js";

/** User-facing copy for `402` / `insufficient_credits` (matches i18n tone on client). */
export const INSUFFICIENT_AI_CREDITS_MESSAGE =
  "Workspace is out of AI credits. Upgrade or top up to continue.";

export type ReadWorkspaceAiCreditsResult =
  | { ok: true; remaining: number }
  | { ok: false; code: "read_error" | "not_found" };

/**
 * Non-mutating read of `workspaces.ai_credits_remaining` (RLS: workspace members).
 * Call after membership is verified and **before** any external AI call, alongside
 * `consume_workspace_ai_credits` (which remains the authoritative locked debit).
 */
export async function readWorkspaceAiCreditsRemaining(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ReadWorkspaceAiCreditsResult> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("ai_credits_remaining")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    return { ok: false, code: "read_error" };
  }
  if (!data) {
    return { ok: false, code: "not_found" };
  }
  const remaining =
    typeof data.ai_credits_remaining === "number" ? data.ai_credits_remaining : 0;
  return { ok: true, remaining };
}

export function buildInsufficientAiCreditsPayload(required: number, remaining: number) {
  return {
    ok: false as const,
    error: {
      code: "insufficient_credits" as const,
      message: INSUFFICIENT_AI_CREDITS_MESSAGE,
      remaining,
      required,
    },
  };
}
