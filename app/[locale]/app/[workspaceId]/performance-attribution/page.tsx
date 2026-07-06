import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PerformanceAttributionTable } from "@/components/listing/performance-attribution-table";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, isModuleEnabled } from "@/lib/features";

/**
 * Force-dynamic so the page always reflects the latest listing versions and
 * Play Store metrics — never serves a stale RSC cache.
 */
export const dynamic = "force-dynamic";

export default async function PerformanceAttributionPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { locale, workspaceId } = await params;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase);

  // Guard: redirect users whose workspace does not have the listing optimizer
  // enabled — performance attribution is only meaningful once listing versions
  // exist (requires the optimizer pipeline).
  if (!isModuleEnabled(flags, "listing_optimizer")) {
    redirect(`/${locale}/app/${workspaceId}`);
  }

  const t = await getTranslations("optimizer.performanceAttribution");
  const isRtl = locale === "ar";
  const vaultLocale: "en" | "ar" = isRtl ? "ar" : "en";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Page header — matches the padding/styling of the keywords and reviews pages */}
      <header className="border-b border-white/[0.06] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {t("panelTitle")}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
          {t("panelSubtitle")}
        </p>
      </header>

      {/* Attribution table — client component; handles its own data fetching */}
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-zinc-500 py-8">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
            {t("loading")}
          </div>
        }
      >
        <PerformanceAttributionTable
          workspaceId={workspaceId}
          vaultLocale={vaultLocale}
          isRtl={isRtl}
        />
      </Suspense>
    </div>
  );
}
