"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Attach Supabase access token for API routes when cookie forwarding fails.
 * Safe to merge with existing fetch headers.
 */
export async function getSupabaseAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token?.trim();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Browser client unavailable — cookie auth may still work.
  }
  return {};
}
