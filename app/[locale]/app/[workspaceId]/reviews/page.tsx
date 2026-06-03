import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ReviewsClient } from "@/components/reviews/ReviewsClient";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import { queryWorkspaceAppsList } from "@/lib/workspace/workspace-apps-list";

export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase);
  if (!isModuleEnabled(flags, "review_insights")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }
  const t = await getTranslations("reviews");
  const appsResult = await queryWorkspaceAppsList(supabase, workspaceId);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{t("subheadline")}</p>
      </header>
      <ReviewsClient
        workspaceId={workspaceId}
        apps={appsResult.rows}
        appsLoadError={appsResult.error?.message ?? null}
      />
    </div>
  );
}
