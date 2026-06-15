"use client";

import { useQuery } from "@tanstack/react-query";
import { isAdmin as isAdminPredicate } from "@/lib/profile/is-admin";
import type { ProfileResponse } from "@/app/api/profile/route";
import { queryDefaultsFor } from "@/lib/client/query-cache-policy";

export const profileQueryKey = ["profile"] as const;

export type UseProfileUser = ProfileResponse["user"];
export type UseProfileProfile = ProfileResponse["profile"];

export type UseProfileData = {
  user: UseProfileUser;
  profile: UseProfileProfile;
  isAdmin: boolean;
};

type ApiErr = { ok: false; error: { code?: string; message: string } };

/**
 * Fetch the signed-in user (id + email) and their `profiles` row in a single
 * round trip. Returns `null` when unauthenticated. The DB shape is the truth:
 * - `email` comes from `auth.users` (no `profiles.email` column).
 * - `is_admin` is the canonical admin boolean on `profiles`.
 * - `role` is reserved for forward-compatibility (always `null` today;
 *   `workspace_members.role` is workspace-scoped and is NOT this field).
 *
 * Consumers should use the exported `isAdmin` flag (or import `isAdmin`
 * from `lib/profile/is-admin`) rather than reading `is_admin`/`role`
 * directly so future schema changes stay backwards compatible.
 */
export function useProfile() {
  return useQuery<UseProfileData | null>({
    queryKey: profileQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (res.status === 401) return null;
      const json = (await res.json()) as ProfileResponse | ApiErr;
      if (!res.ok || json.ok === false) {
        const msg = json.ok === false ? json.error.message : `Profile fetch failed (${res.status})`;
        throw new Error(msg);
      }
      return {
        user: json.user,
        profile: json.profile,
        isAdmin: isAdminPredicate(json.profile),
      };
    },
    ...queryDefaultsFor("userProfile"),
  });
}
