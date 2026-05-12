import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { FeaturesRoadmap } from "@/components/marketing/FeaturesRoadmap";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "featuresPage" });
  return {
    title: t("title"),
    description: t("intro"),
  };
}

export default async function FeaturesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("featuresPage");

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#22C55E]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.5rem]">
          {t("title")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/60 sm:text-lg">{t("intro")}</p>
      </header>

      <div className="mx-auto mt-6 max-w-xl text-center">
        <p className="text-sm text-white/50">{t("subIntro")}</p>
      </div>

      <div className="mx-auto mt-16 max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {t("capabilitiesTitle")}
        </h2>
        <p className="mt-3 text-sm text-white/55 sm:text-base">{t("capabilitiesSubtitle")}</p>
      </div>

      <FeatureShowcase />

      <FeaturesRoadmap />
    </div>
  );
}
