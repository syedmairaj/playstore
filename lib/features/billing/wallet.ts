import type { SupabaseClient } from "@supabase/supabase-js";

export type ConsumeWalletResult =
  | { ok: true; ledgerId: string; balanceAfter: number }
  | {
      ok: false;
      code: string;
      remaining?: number;
      required?: number;
    };

export type RefundWalletResult =
  | { ok: true; refundLedgerId: string; balanceAfter: number }
  | { ok: false; code: string };

function parseConsumePayload(raw: unknown): ConsumeWalletResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_response" };
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return {
      ok: false,
      code: typeof o.code === "string" ? o.code : "unknown",
      remaining: typeof o.remaining === "number" ? o.remaining : undefined,
      required: typeof o.required === "number" ? o.required : undefined,
    };
  }
  const ledgerId = o.ledger_id;
  const balanceAfter = o.balance_after;
  if (typeof ledgerId !== "string" || typeof balanceAfter !== "number") {
    return { ok: false, code: "invalid_response" };
  }
  return { ok: true, ledgerId, balanceAfter };
}

function parseRefundPayload(raw: unknown): RefundWalletResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_response" };
  }
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, code: typeof o.code === "string" ? o.code : "unknown" };
  }
  const id = o.refund_ledger_id;
  const balanceAfter = o.balance_after;
  if (typeof id !== "string" || typeof balanceAfter !== "number") {
    return { ok: false, code: "invalid_response" };
  }
  return { ok: true, refundLedgerId: id, balanceAfter };
}

/**
 * Debit workspace credits and append an immutable ledger row (must run before calling external AI).
 */
export async function consumeWorkspaceAiCredits(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    amount: number;
    description: string;
    sourceType: "generation" | "purchase" | "refund" | "adjustment";
    meta?: Record<string, unknown>;
  },
): Promise<ConsumeWalletResult> {
  const { data, error } = await supabase.rpc("consume_workspace_ai_credits", {
    p_workspace_id: params.workspaceId,
    p_user_id: params.userId,
    p_amount: params.amount,
    p_description: params.description,
    p_source_type: params.sourceType,
    p_meta: params.meta ?? null,
  });
  if (error) {
    return { ok: false, code: "rpc_error", remaining: undefined, required: undefined };
  }
  return parseConsumePayload(data);
}

/**
 * Reverse a prior spend ledger row (e.g. Gemini failure after debit).
 */
export async function refundWorkspaceAiCredits(
  supabase: SupabaseClient,
  params: { ledgerId: string; userId: string; reason?: string | null },
): Promise<RefundWalletResult> {
  const { data, error } = await supabase.rpc("refund_workspace_ai_credits", {
    p_ledger_id: params.ledgerId,
    p_user_id: params.userId,
    p_reason: params.reason ?? null,
  });
  if (error) {
    return { ok: false, code: "rpc_error" };
  }
  return parseRefundPayload(data);
}
