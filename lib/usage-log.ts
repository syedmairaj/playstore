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
  const { error } = await supabase.from("usage_logs").insert({
    route: entry.route,
    client_ip: entry.clientIp.slice(0, 128),
    success: entry.success,
    duration_ms: entry.durationMs,
    error_message: entry.errorMessage ?? null,
    meta: entry.meta ?? null,
  });
  if (error) {
    console.error("usage_logs insert failed", error.message);
  }
}
