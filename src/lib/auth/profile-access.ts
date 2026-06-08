import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileAccountStatus = "active" | "flagged" | "suspended";

export const SUSPENDED_ACCOUNT_MESSAGE =
  "Your account access has been frozen due to safety policy exceptions or credit velocity validation. Contact support.";

const SUSPENSION_BLOCK_STATUSES: ReadonlySet<ProfileAccountStatus> = new Set([
  "suspended",
]);

export function isProfileAccessBlocked(
  status: string | null | undefined,
): boolean {
  return SUSPENSION_BLOCK_STATUSES.has(
    (status ?? "active") as ProfileAccountStatus,
  );
}

export async function fetchProfileAccountStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileAccountStatus> {
  const { data, error } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[profile-access] account_status read failed:", error.message);
    return "active";
  }

  const raw = data?.account_status;
  if (raw === "flagged" || raw === "suspended") return raw;
  return "active";
}

/** JSON body for 403 when account is suspended. */
export function suspendedAccountJsonResponse() {
  return {
    ok: false as const,
    error: {
      code: "account_suspended" as const,
      message: SUSPENDED_ACCOUNT_MESSAGE,
    },
  };
}
