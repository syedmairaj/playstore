import { userHasAdminAccess } from "@/lib/admin/gate";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Admin routes: session is refreshed in middleware (`getSession`); this layout re-verifies
 * the same rules as middleware (`ADMIN_EMAILS` and/or `profiles.role` / `profiles.is_admin`)
 * with the user-scoped client (DB read each request, not JWT custom claims).
 */
export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/admin/accounts`);
  }

  const allowed = await userHasAdminAccess(supabase, user);
  if (!allowed) {
    redirect(`/${locale}`);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {children}
    </div>
  );
}
