import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { KeywordTrackerClient } from "@/components/keyword-tracker/KeywordTrackerClient";
import { KeywordTrackerPageActions } from "@/components/keyword-tracker/KeywordTrackerPageActions";
import { loadLatestAiListingKeywordsByApp } from "@/lib/keywords/latest-ai-listing-by-app";
import { loadWorkspaceKeywords } from "@/lib/keywords/load-workspace-keywords";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import { queryWorkspaceAppsList } from "@/lib/workspace/workspace-apps-list";

/** Always load tracked keywords + snapshots from Supabase after save/refresh (no stale RSC cache). */
export const dynamic = "force-dynamic";

export default async function KeywordsPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase);
  if (!isModuleEnabled(flags, "keyword_tracker")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }
  const t = await getTranslations("keywordTracker");

  const [kwLoaded, appsResult] = await Promise.all([
    loadWorkspaceKeywords(supabase, workspaceId),
    queryWorkspaceAppsList(supabase, workspaceId),
  ]);
  // Pass workspace apps so AI Discovery rejects cross-app / wrong-vertical packs.
  const latestAiByApp = await loadLatestAiListingKeywordsByApp(
    supabase,
    workspaceId,
    appsResult.rows.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
    })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{t("title")}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{t("subheadline")}</p>
        </div>
        <KeywordTrackerPageActions workspaceId={workspaceId} apps={appsResult.rows} />
      </header>
      <KeywordTrackerClient
        workspaceId={workspaceId}
        initialKeywords={kwLoaded.ok ? kwLoaded.keywords : []}
        apps={appsResult.rows}
        keywordsLoadError={kwLoaded.ok ? null : kwLoaded.message}
        appsLoadError={appsResult.error?.message ?? null}
        latestAiByApp={latestAiByApp}
      />
    </div>
  );
}
