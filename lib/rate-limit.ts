import type { SupabaseClient } from "@supabase/supabase-js";

type RpcResult = { allowed: boolean; count: number };

function parseRpcPayload(data: unknown): RpcResult {
  if (data && typeof data === "object" && "allowed" in data) {
    const o = data as Record<string, unknown>;
    return {
      allowed: o.allowed === true,
      count: typeof o.count === "number" ? o.count : 0,
    };
  }
  return { allowed: false, count: 0 };
}

export async function consumeRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxPerWindow: number,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key.slice(0, 256),
    p_max: maxPerWindow,
  });
  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }
  return parseRpcPayload(data);
}
