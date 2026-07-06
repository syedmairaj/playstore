import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ListingOptimizer } from "@/components/ListingOptimizer";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import { loadLatestListingHydrationMaps } from "@/lib/listing/latest-listing-hydration";
import { canAddNewApp } from "@/lib/utils/app-limits";
import { queryWorkspaceAppsList } from "@/lib/workspace/workspace-apps-list";

export default async function ListingOptimizerPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const flags = await getFeatureFlags(supabase);
  if (!isModuleEnabled(flags, "listing_optimizer")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }
  /** Same limits as GET /app-limits + `precheckAddApp` in the client — avoids wrong navigation on first paint. */
  const initialAppLimits = await canAddNewApp(workspaceId);
  const [{ rows: appsSnapshot, error: appsSnapshotError }, listingHydration] =
    await Promise.all([
      queryWorkspaceAppsList(supabase, workspaceId),
      loadLatestListingHydrationMaps(
        supabase,
        workspaceId,
        user?.id,
      ),
    ]);
  const { data: wsRow } = await supabase
    .from("workspaces")
    .select("ai_credits_remaining, trial_regenerations_used")
    .eq("id", workspaceId)
    .maybeSingle();
  const uiLocale = locale === "ar" ? "ar" : "en";

  return (
    <div className="w-full min-h-0 max-w-[1600px]">
      <Suspense fallback={null}>
        <ListingOptimizer
          workspaceId={workspaceId}
          embedded
          locale={uiLocale}
          initialAppLimits={initialAppLimits}
          initialApps={appsSnapshotError ? undefined : appsSnapshot}
          initialHydrationByApp={listingHydration.byAppId}
          initialHydrationNoApp={listingHydration.noApp}
          initialAiCreditsRemaining={
            typeof wsRow?.ai_credits_remaining === "number"
              ? wsRow.ai_credits_remaining
              : undefined
          }
          initialTrialRegenerationsUsed={
            typeof wsRow?.trial_regenerations_used === "number"
              ? wsRow.trial_regenerations_used
              : undefined
          }
        />
      </Suspense>
    </div>
  );
}
