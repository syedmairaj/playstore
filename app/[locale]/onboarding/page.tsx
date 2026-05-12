import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOnboardingPending } from "@/lib/onboarding-state";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { PlayStoreLogo } from "@/components/marketing/PlayStoreLogo";
import { Link } from "@/i18n/navigation";

type PageProps = { params: Promise<{ locale: string }> };

export default async function OnboardingPage({ params }: PageProps) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/onboarding`);
  }

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id,name,onboarding_state,plan")
    .order("created_at", { ascending: false });

  const list = workspaces ?? [];
  const pending = list.find((w) => isOnboardingPending(w.onboarding_state));
  const allComplete =
    list.length > 0 && list.every((w) => !isOnboardingPending(w.onboarding_state));

  if (allComplete) {
    redirect(`/${locale}/app/${list[0].id}`);
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-zinc-100">
      <div className="border-b border-white/[0.08] bg-[#080a10] px-4 py-4 sm:px-6">
        <Link href="/" className="flex justify-center">
          <PlayStoreLogo size="sm" brand="play" />
        </Link>
      </div>
      <OnboardingWizard
        initialWorkspace={
          pending
            ? {
                id: pending.id as string,
                name: pending.name as string,
                onboarding_state: pending.onboarding_state,
              }
            : null
        }
      />
    </div>
  );
}
