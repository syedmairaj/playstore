import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function GrowthAdsTeaserPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const t = await getTranslations("dashboard.growthTeasers");
  const hub = `/app/${workspaceId}`;
  const optimizer = `${hub}/listing-optimizer`;

  return (
    <div className="mx-auto max-w-lg space-y-8 pb-8">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-lg shadow-black/20">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#22C55E]/90">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{t("ads.title")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/55">{t("ads.body")}</p>
        <ul className="mt-6 space-y-2 text-sm text-white/45">
          <li className="flex gap-2">
            <span className="text-[#22C55E]/80">✓</span>
            {t("ads.bullet1")}
          </li>
          <li className="flex gap-2">
            <span className="text-white/25">○</span>
            {t("ads.bullet2")}
          </li>
        </ul>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href={optimizer}
            className="inline-flex items-center justify-center rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-[#0B0E14] transition hover:bg-[#34d399]"
          >
            {t("ads.ctaOptimizer")}
          </Link>
          <Link
            href={hub}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
