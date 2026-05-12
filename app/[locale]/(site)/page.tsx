import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnimatedHero } from "@/components/marketing/AnimatedHero";
import { CtaBand } from "@/components/marketing/CtaBand";
import { FeatureShowcase } from "@/components/marketing/FeatureShowcase";
import { TestimonialSection } from "@/components/marketing/TestimonialSection";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("features");

  return (
    <>
      <AnimatedHero />

      <section id="features" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#22C55E]">
            {t("kicker")}
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:mt-5 sm:text-4xl sm:leading-[1.1]">
            {t("title")}
          </h2>
          <p className="mt-5 text-pretty text-base leading-relaxed text-white/55 sm:mt-6 sm:text-lg">
            {t("subtitle")}
          </p>
        </div>
        <FeatureShowcase />
      </section>

      <TestimonialSection />

      <CtaBand />
    </>
  );
}
