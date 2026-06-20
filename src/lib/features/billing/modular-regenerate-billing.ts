import type { SupabaseClient } from "@supabase/supabase-js";

export const MODULAR_TRIAL_REGENERATIONS_LIMIT = 3;

export type ConsumeModularRegenerateResult =
  | {
      ok: true;
      trialSlot: boolean;
      trialRegenerationsUsed: number;
      trialRegenerationsRemaining: number;
      creditsCharged: number;
      balanceAfter: number;
      ledgerId: string | null;
    }
  | {
      ok: false;
      code: string;
      remaining?: number;
      required?: number;
      trialRegenerationsUsed?: number;
    };

export function isModularRegenerateStep(
  step: string,
  isRegenerate: boolean,
): boolean {
  if (!isRegenerate) return false;
  return (
    step === "title" ||
    step === "short" ||
    step === "long" ||
    step === "hook" ||
    step === "features" ||
    step === "closing"
  );
}

/** Usage-gated billing for modular pipeline phases (every call, not only isRegenerate). */
export function isModularPhaseBilledStep(step: string): boolean {
  return step === "title" || step === "short" || step === "long";
}

/** True when post-success `consume_modular_listing_regenerate` should run. */
export function billsModularListingPhase(step: string, isRegenerate: boolean): boolean {
  if (isModularPhaseBilledStep(step)) return true;
  return isModularRegenerateStep(step, isRegenerate);
}

export async function consumeModularListingRegenerate(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    generationStep: string;
    meta?: Record<string, unknown>;
  },
): Promise<ConsumeModularRegenerateResult> {
  const { data, error } = await supabase.rpc("consume_modular_listing_regenerate", {
    p_workspace_id: params.workspaceId,
    p_user_id: params.userId,
    p_generation_step: params.generationStep,
    p_meta: params.meta ?? null,
  });

  if (error) {
    return { ok: false, code: "rpc_error" };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "invalid_response" };
  }

  const o = data as Record<string, unknown>;
  if (o.ok !== true) {
    return {
      ok: false,
      code: typeof o.code === "string" ? o.code : "unknown",
      remaining: typeof o.remaining === "number" ? o.remaining : undefined,
      required: typeof o.required === "number" ? o.required : undefined,
      trialRegenerationsUsed:
        typeof o.trial_regenerations_used === "number"
          ? o.trial_regenerations_used
          : undefined,
    };
  }

  return {
    ok: true,
    trialSlot: o.trial_slot === true,
    trialRegenerationsUsed:
      typeof o.trial_regenerations_used === "number" ? o.trial_regenerations_used : 0,
    trialRegenerationsRemaining:
      typeof o.trial_regenerations_remaining === "number"
        ? o.trial_regenerations_remaining
        : 0,
    creditsCharged: typeof o.credits_charged === "number" ? o.credits_charged : 0,
    balanceAfter: typeof o.balance_after === "number" ? o.balance_after : 0,
    ledgerId: typeof o.ledger_id === "string" ? o.ledger_id : null,
  };
}
