import type { SupabaseClient } from "@supabase/supabase-js";

export async function logUsage(
  supabase: SupabaseClient,
  entry: {
    route: string;
    clientIp: string;
    success: boolean;
    durationMs: number;
    errorMessage?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("usage_logs").insert({
      route: entry.route,
      client_ip: entry.clientIp.slice(0, 128),
      success: entry.success,
      duration_ms: entry.durationMs,
      error_message: entry.errorMessage ?? null,
      meta: entry.meta ?? null,
    });
    if (error) {
      // Non-fatal: log row failed (e.g. table missing, RLS, network blip).
      console.warn("usage_logs insert error:", error.message);
    }
  } catch (e) {
    // Non-fatal: swallow network errors (fetch failed, DNS timeout, etc.)
    // so usage logging never propagates to callers or crashes routes.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("usage_logs insert failed (network):", msg);
  }
}
