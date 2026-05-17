import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/app/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags } from "@/lib/features";
import { resolveWorkspaceBillingPlan } from "@/lib/utils/app-limits";

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
  const { normalized: workspacePlan } = await resolveWorkspaceBillingPlan(supabase, workspaceId, user.id);

  const t = await getTranslations("dashboard");
  const creditsRemaining =
    typeof workspace.ai_credits_remaining === "number" ? workspace.ai_credits_remaining : 20;
  /** DB column name is historical; Free uses a one-time pool; paid tiers use monthly allocation per product spec. */
  const creditsAllocation =
    typeof workspace.ai_credits_monthly_allocation === "number"
      ? workspace.ai_credits_monthly_allocation
      : 20;

  const appBase = `/app/${workspaceId}`;
  const navItemsAll = [
    { href: appBase, label: t("home"), show: true },
    { href: `${appBase}/keywords`, label: t("keywords"), show: flags.keyword_tracker },
    { href: `${appBase}/listing-optimizer`, label: t("listingAi"), show: flags.listing_optimizer },
    { href: `${appBase}/competitors`, label: t("competitorSpy"), show: flags.competitor_spy },
    { href: `${appBase}/reviews`, label: t("reviews"), show: flags.review_insights },
    { href: `${appBase}/alerts`, label: t("alerts"), show: true },
    { href: `${appBase}/settings`, label: t("settings"), show: true },
  ];
  const navItems = navItemsAll.filter((i) => i.show);

  const userEmail = typeof user.email === "string" && user.email.trim() ? user.email.trim() : null;

  return (
    <DashboardShell
      workspaceId={workspaceId}
      workspaceName={workspace.name as string}
      workspacePlan={workspacePlan}
      workspaces={(allWorkspaces ?? []) as { id: string; name: string }[]}
      creditsRemaining={creditsRemaining}
      creditsAllocation={creditsAllocation}
      hubLabel={t("growthHub.headerEyebrow")}
      navItems={navItems}
      navAriaLabel={t("growthHub.navAria")}
      userEmail={userEmail}
    >
      {children}
    </DashboardShell>
  );
}
