import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandAssetsClient } from "@/components/brand-assets/BrandAssetsClient";
import { resolveWorkspaceBillingPlan } from "@/lib/utils/app-limits";

export default async function BrandAssetsPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=/${locale}/app/${workspaceId}/brand-assets`);
  }

  // Fetch workspace credits + plan + first app (with category/short_description)
  const [wsRow, appsRow, { normalized: plan }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("ai_credits_remaining")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("apps")
      .select("id, name, category, short_description")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    resolveWorkspaceBillingPlan(supabase, workspaceId, user.id),
  ]);

  const firstApp = appsRow.data;
  const creditsRemaining =
    typeof wsRow.data?.ai_credits_remaining === "number"
      ? wsRow.data.ai_credits_remaining
      : 0;

  return (
    <div className="w-full min-h-0 max-w-[1200px]">
      <Suspense fallback={null}>
        <BrandAssetsClient
          workspaceId={workspaceId}
          appId={firstApp?.id ?? ""}
          appName={firstApp?.name ?? ""}
          category={firstApp?.category ?? ""}
          shortDescription={firstApp?.short_description ?? ""}
          creditsRemaining={creditsRemaining}
          plan={plan}
        />
      </Suspense>
    </div>
  );
}
