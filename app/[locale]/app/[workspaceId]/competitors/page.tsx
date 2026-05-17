import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CompetitorSpyClient } from "@/components/competitor-spy/CompetitorSpyClient";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";

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

  return (
    <div className="w-full min-h-0 max-w-[1600px] space-y-8">
      <header
        className={locale === "ar" ? "space-y-3 font-arabic" : "space-y-3"}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-white">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{t("subheadline")}</p>
        <details className="group max-w-2xl rounded-xl border border-white/[0.08] bg-[#080c12]/80 px-4 py-3 text-start text-sm text-zinc-300 open:border-emerald-500/20 open:bg-[#0a1018]/90">
          <summary className="cursor-pointer select-none font-medium text-zinc-200 group-open:text-emerald-200/95">
            {t("howItWorksSummary")}
          </summary>
          <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-zinc-400 sm:text-sm">
            {t("howItWorksDetail")}
          </p>
        </details>
      </header>
      <CompetitorSpyClient
        workspaceId={workspaceId}
        keywordTrackerEnabled={isModuleEnabled(flags, "keyword_tracker")}
      />
    </div>
  );
}
