import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOnboardingPending } from "@/lib/onboarding-state";

export default async function AppHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/app`);
  }

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id,onboarding_state")
    .order("created_at", { ascending: true });

  const list = workspaces ?? [];

  if (list.length === 0) {
    redirect(`/${locale}/onboarding`);
  }

  const pending = list.find((w) => isOnboardingPending(w.onboarding_state));
  if (pending) {
    redirect(`/${locale}/onboarding`);
  }

  redirect(`/${locale}/app/${list[0].id}`);
}
