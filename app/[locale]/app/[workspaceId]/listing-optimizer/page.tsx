import { redirect } from "next/navigation";
import { ListingOptimizer } from "@/components/ListingOptimizer";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import { canAddNewApp } from "@/lib/utils/app-limits";
import { queryWorkspaceAppsList } from "@/lib/workspace/workspace-apps-list";

export default async function ListingOptimizerPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase);
  if (!isModuleEnabled(flags, "listing_optimizer")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }
  /** Same limits as GET /app-limits + `precheckAddApp` in the client — avoids wrong navigation on first paint. */
  const initialAppLimits = await canAddNewApp(workspaceId);
  const { rows: appsSnapshot, error: appsSnapshotError } =
    await queryWorkspaceAppsList(supabase, workspaceId);
  const { data: wsRow } = await supabase
    .from("workspaces")
    .select("ai_credits_remaining")
    .eq("id", workspaceId)
    .maybeSingle();
  const uiLocale = locale === "ar" ? "ar" : "en";

  return (
    <div className="mx-auto w-full min-h-0 max-w-[1120px]">
      <ListingOptimizer
        workspaceId={workspaceId}
        embedded
        locale={uiLocale}
        initialAppLimits={initialAppLimits}
        initialApps={appsSnapshotError ? undefined : appsSnapshot}
        initialAiCreditsRemaining={
          typeof wsRow?.ai_credits_remaining === "number"
            ? wsRow.ai_credits_remaining
            : undefined
        }
      />
    </div>
  );
}
