import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CompetitorSpyClient } from "@/components/competitor-spy/CompetitorSpyClient";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import { queryWorkspaceAppsList } from "@/lib/workspace/workspace-apps-list";

export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase);
  if (!isModuleEnabled(flags, "competitor_spy")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }
  const t = await getTranslations("competitorSpy");
  const appsResult = await queryWorkspaceAppsList(supabase, workspaceId);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{t("subheadline")}</p>
      </header>
      <CompetitorSpyClient
        workspaceId={workspaceId}
        apps={appsResult.rows}
        appsLoadError={appsResult.error?.message ?? null}
        keywordTrackerEnabled={isModuleEnabled(flags, "keyword_tracker")}
      />
    </div>
  );
}
