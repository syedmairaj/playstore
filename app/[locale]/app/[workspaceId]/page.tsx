import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GrowthHubClient } from "@/components/dashboard/GrowthHubClient";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";
import {
  listingGenerationOutputSchema,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";
import { cn } from "@/lib/utils";

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase);
  const t = await getTranslations("dashboard.growthHub");
  const tNav = await getTranslations("dashboard");

  const { data: appRow } = await supabase
    .from("apps")
    .select("name")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: genRow } = await supabase
    .from("listing_generations")
    .select("output_json, app_name, category, target_keywords")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let previewResult: ListingGenerationOutput | null = null;
  if (genRow?.output_json) {
    const parsed = listingGenerationOutputSchema.safeParse(genRow.output_json);
    if (parsed.success) {
      previewResult = parsed.data;
    }
  }

  const appName =
    (typeof genRow?.app_name === "string" && genRow.app_name) ||
    (typeof appRow?.name === "string" && appRow.name) ||
    "Your app";
  const category =
    (typeof genRow?.category === "string" && genRow.category) || "Productivity";
  const kw = genRow?.target_keywords;
  const keywords =
    Array.isArray(kw) && kw.length > 0 ? kw.join(", ") : "google play, aso, keywords";

  const appBase = `/app/${workspaceId}`;
  const linkClass =
    "inline-flex items-center rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/85 transition hover:border-[#22C55E]/35 hover:bg-[#22C55E]/10 hover:text-white";

  return (
    <div className="mx-auto max-w-6xl space-y-12 pb-8">
      <GrowthHubClient
        workspaceId={workspaceId}
        appName={appName}
        category={category}
        keywords={keywords}
        previewResult={previewResult}
        listingOptimizerEnabled={isModuleEnabled(flags, "listing_optimizer")}
      />

      <section className="border-t border-white/[0.08] pt-10">
        <h2 className="text-sm font-semibold tracking-wide text-white">{t("continueTitle")}</h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {isModuleEnabled(flags, "listing_optimizer") ? (
            <li>
              <Link href={`${appBase}/listing-optimizer`} className={cn(linkClass)}>
                {t("linkOptimizer")}
              </Link>
            </li>
          ) : null}
          {isModuleEnabled(flags, "keyword_tracker") ? (
            <li>
              <Link href={`${appBase}/keywords`} className={cn(linkClass)}>
                {t("linkKeywords")}
              </Link>
            </li>
          ) : null}
          <li>
            <Link href={`${appBase}/alerts`} className={cn(linkClass)}>
              {t("linkAlerts")}
            </Link>
          </li>
          <li>
            <Link href={`${appBase}/settings`} className={cn(linkClass)}>
              {tNav("settings")}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
