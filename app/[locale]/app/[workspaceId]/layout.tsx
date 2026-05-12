import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PlayStoreLogo } from "@/components/marketing/PlayStoreLogo";
import { SignOutButton } from "@/components/app/SignOutButton";
import { WorkspaceAppHeader } from "@/components/dashboard/WorkspaceAppHeader";
import { WorkspaceSidebarNav } from "@/components/dashboard/WorkspaceSidebarNav";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags } from "@/lib/features";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { workspaceId, locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/app/${workspaceId}`);
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id,name,plan,ai_credits_remaining,ai_credits_monthly_allocation")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!workspace) {
    notFound();
  }

  const { data: allWorkspaces } = await supabase
    .from("workspaces")
    .select("id,name")
    .order("created_at", { ascending: true });

  const flags = await getFeatureFlags(supabase);

  const t = await getTranslations("dashboard");
  const creditsRemaining =
    typeof workspace.ai_credits_remaining === "number" ? workspace.ai_credits_remaining : 20;
  const creditsAllocation =
    typeof workspace.ai_credits_monthly_allocation === "number"
      ? workspace.ai_credits_monthly_allocation
      : 20;

  const appBase = `/app/${workspaceId}`;
  const navItemsAll = [
    { href: appBase, label: t("home"), show: true },
    { href: `${appBase}/keywords`, label: t("keywords"), show: flags.keyword_tracker },
    { href: `${appBase}/optimizer`, label: t("listingAi"), show: flags.listing_optimizer },
    { href: `${appBase}/competitors`, label: t("competitorSpy"), show: flags.competitor_spy },
    { href: `${appBase}/reviews`, label: t("reviews"), show: flags.review_insights },
    { href: `${appBase}/alerts`, label: t("alerts"), show: true },
    { href: `${appBase}/settings`, label: t("settings"), show: true },
  ];
  const navItems = navItemsAll.filter((i) => i.show);

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0E14] text-zinc-100 antialiased md:flex-row">
      <aside className="flex w-full flex-col border-b border-white/[0.08] bg-[#080a10] md:w-56 md:border-b-0 md:border-e md:border-white/[0.08]">
        <div className="px-4 py-5">
          <Link
            href="/"
            className="inline-flex rounded-lg outline-none ring-offset-[#080a10] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#22C55E]/60"
          >
            <PlayStoreLogo size="sm" brand="play" />
          </Link>
        </div>
        <WorkspaceSidebarNav items={navItems} navAriaLabel={t("growthHub.navAria")} />
        <div className="mt-auto border-t border-white/[0.08] p-4">
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceAppHeader
          hubLabel={t("growthHub.headerEyebrow")}
          workspaceId={workspaceId}
          workspaceName={workspace.name as string}
          workspaces={(allWorkspaces ?? []) as { id: string; name: string }[]}
          creditsRemaining={creditsRemaining}
          creditsAllocation={creditsAllocation}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
