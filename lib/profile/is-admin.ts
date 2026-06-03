/**
 * Profile shape understood by the admin gate. Fields are optional so callers
 * can pass partial rows from either the legacy `profiles.is_admin` boolean
 * column (current DB truth — see `supabase/migrations/2026051312…sql`) or a
 * future `profiles.role` text column without breaking the contract.
 */
export type ProfileLike = {
  is_admin?: boolean | null;
  role?: string | null;
};

/**
 * Site-admin predicate. Returns true when either:
 *  - `role === 'admin'` (forward-compatible: not yet present in this DB), or
 *  - `is_admin === true` (current DB truth).
 *
 * Membership/workspace roles (`owner`, `admin`, `member` on
 * `workspace_members`) are NOT site admins and must not be confused with this
 * gate — that table's `role` is workspace-scoped, this helper checks
 * site-wide profile admin.
 */
export function isAdmin(profile: ProfileLike | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  if (profile.is_admin === true) return true;
  return false;
}
