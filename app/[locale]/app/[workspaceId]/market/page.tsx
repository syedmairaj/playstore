import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import { resolveCategoryId } from "@/lib/market/category-labels";
import { MarketIntelligenceClient } from "@/components/market/MarketIntelligenceClient";

export default async function MarketIntelligencePage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();

  // Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Feature flag guard
  const flags = await getFeatureFlags(supabase);
  if (!isModuleEnabled(flags, "market_intelligence")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }

  const t = await getTranslations("market");

  // Auto-detect user's app category from latest listing generation
  const { data: genRow } = await supabase
    .from("listing_generations")
    .select("category, app_name")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Also try apps table for package name (to highlight own app in chart)
  const { data: appRow } = await supabase
    .from("apps")
    .select("package_name, category")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const rawCategory = genRow?.category ?? appRow?.category ?? null;
  const defaultCategory = resolveCategoryId(rawCategory);
  const ownAppId = appRow?.package_name ?? null;

  return (
    <div className="w-full min-h-0 max-w-[1600px] space-y-8">
      <header
        className={locale === "ar" ? "space-y-3 font-arabic" : "space-y-3"}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          {t("subheadline")}
        </p>
        <details className="group max-w-2xl rounded-xl border border-white/[0.08] bg-[#080c12]/80 px-4 py-3 text-start text-sm text-zinc-300 open:border-emerald-500/20 open:bg-[#0a1018]/90">
          <summary className="cursor-pointer select-none font-medium text-zinc-200 group-open:text-emerald-200/95">
            {t("howItWorksSummary")}
          </summary>
          <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-zinc-400 sm:text-sm">
            {t("howItWorksDetail")}
          </p>
        </details>
      </header>

      <MarketIntelligenceClient
        workspaceId={workspaceId}
        ownAppId={ownAppId}
        defaultCategory={defaultCategory}
        isRtl={locale === "ar"}
      />
    </div>
  );
}
