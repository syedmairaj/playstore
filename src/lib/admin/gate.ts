import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdmin, type ProfileLike } from "@/lib/profile/is-admin";

/** Lowercased, trimmed emails from `ADMIN_EMAILS` (comma-separated). Empty if unset or blank. */
export function parseAdminEmailAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((e) => e.split("#")[0]?.trim().toLowerCase() ?? "")
    .filter((e) => e.length > 0);
}

export function userEmailOnAdminAllowlist(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export type AdminAccessDiagnostics = {
  adminEmailsConfigured: boolean;
  /** Number of entries after parse (for debugging scale without printing emails). */
  adminAllowlistSize: number;
  emailMatch: boolean;
  /** Raw `profiles.is_admin === true` (distinct from combined `isAdmin()` predicate). */
  isAdminFlag: boolean;
  roleValue: string | null;
  dbRowPresent: boolean;
};

export type AdminAccessResolution = {
  allowed: boolean;
  /** Sign-in email (never tokens); for logging only. */
  email: string | undefined;
  /**
   * Human-readable admin source for dev logs: DB `role` text, literal `is_admin`,
   * or `none` when no row / not admin. Allowlist-only access still uses DB row when present.
   */
  roleDisplay: string;
  /**
   * Safe diagnostics for middleware logs — booleans and counts only (never the allowlist body).
   */
  diagnostics: AdminAccessDiagnostics;
};

/** One-line dev log; omits allowlist contents. */
export function formatAdminGateDebugLine(resolution: AdminAccessResolution): string {
  const { email, allowed, diagnostics: d } = resolution;
  return (
    `[admin-gate] allowed=${allowed} email=${email ?? "(none)"} ` +
    `adminEmailsConfigured=${d.adminEmailsConfigured} allowlistSize=${d.adminAllowlistSize} ` +
    `emailMatch=${d.emailMatch} isAdminFlag=${d.isAdminFlag} roleValue=${d.roleValue ?? "null"} ` +
    `dbRowPresent=${d.dbRowPresent} roleDisplay=${resolution.roleDisplay}`
  );
}

/**
 * Resolves `/admin` access: `ADMIN_EMAILS` match (when list non-empty) **or**
 * `profiles.role === 'admin'` **or** `profiles.is_admin === true`.
 *
 * Admin flags are read from the database each request (not JWT custom claims).
 * `profiles.role` is selected when the column exists (migration adds it if missing).
 */
export async function resolveAdminAccess(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<AdminAccessResolution> {
  const allowlist = parseAdminEmailAllowlist();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const roleDisplay =
    profile?.role ??
    (profile?.is_admin === true ? "is_admin" : "none");

  const emailMatch = userEmailOnAdminAllowlist(user.email, allowlist);
  const diagnostics: AdminAccessDiagnostics = {
    adminEmailsConfigured: allowlist.length > 0,
    adminAllowlistSize: allowlist.length,
    emailMatch,
    isAdminFlag: profile?.is_admin === true,
    roleValue: profile?.role ?? null,
    dbRowPresent: profile != null,
  };

  if (allowlist.length > 0 && emailMatch) {
    return {
      allowed: true,
      email: user.email ?? undefined,
      roleDisplay,
      diagnostics,
    };
  }

  return {
    allowed: isAdmin(profile as ProfileLike | null),
    email: user.email ?? undefined,
    roleDisplay,
    diagnostics,
  };
}

/** Same rules as `resolveAdminAccess`; use that when middleware needs `roleDisplay` for logs. */
export async function userHasAdminAccess(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<boolean> {
  const { allowed } = await resolveAdminAccess(supabase, user);
  return allowed;
}
