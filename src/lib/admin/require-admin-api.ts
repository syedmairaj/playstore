import "server-only";

import { userHasAdminAccess } from "@/lib/admin/gate";
import { createClient } from "@/lib/supabase/server";

export type AdminApiAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

/** Admin-only API gate (DB `is_admin` / `role` or `ADMIN_EMAILS`). */
export async function requireAdminApiAuth(): Promise<AdminApiAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401 };
  }

  const allowed = await userHasAdminAccess(supabase, user);
  if (!allowed) {
    return { ok: false, status: 403 };
  }

  return { ok: true, userId: user.id };
}
