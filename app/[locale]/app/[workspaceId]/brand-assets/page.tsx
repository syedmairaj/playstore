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

  // Only fetch what can't be done client-side: credits + billing plan.
  // The apps list is fetched client-side by BrandAssetsClient via React Query
  // (same pattern as ListingOptimizer) so it's always fresh and correct.
  const [wsRow, { normalized: plan }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("ai_credits_remaining")
      .eq("id", workspaceId)
      .maybeSingle(),
    resolveWorkspaceBillingPlan(supabase, workspaceId, user.id),
  ]);

  const creditsRemaining =
    typeof wsRow.data?.ai_credits_remaining === "number"
      ? wsRow.data.ai_credits_remaining
      : 0;

  return (
    <div className="w-full min-h-0 max-w-[1200px]">
      <Suspense fallback={null}>
        <BrandAssetsClient
          workspaceId={workspaceId}
          creditsRemaining={creditsRemaining}
          plan={plan}
        />
      </Suspense>
    </div>
  );
}
