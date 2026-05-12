import { getTranslations, setRequestLocale } from "next-intl/server";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { PricingBottomSection } from "@/components/marketing/PricingBottomSection";

type Props = { params: Promise<{ locale: string }> };

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");

  const compareRows = [
    { label: t("compareRows.apps"), free: "1", pro: "5", growth: "∞" },
    {
      label: t("compareRows.keywords"),
      free: t("features.kwLimited"),
      pro: t("features.kwFull"),
      growth: t("features.kwFull"),
    },
    { label: t("compareRows.credits"), free: "20", pro: "200", growth: "800" },
    { label: t("compareRows.team"), free: "—", pro: "—", growth: "✓" },
    { label: t("compareRows.support"), free: "—", pro: "—", growth: "✓" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 text-white/60 sm:text-lg">{t("subtitle")}</p>
      </header>

      <div className="mt-14">
        <PricingPlans />
      </div>

      <section className="mt-24 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20 backdrop-blur-sm">
        <h2 className="border-b border-white/10 px-4 py-4 text-sm font-semibold text-white sm:px-6">
          {t("compare")}
        </h2>
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] text-xs font-semibold uppercase tracking-wide text-white/50">
              <th className="px-4 py-3 sm:px-6">Feature</th>
              <th className="px-3 py-3">{t("plans.free.name")}</th>
              <th className="bg-[#22C55E]/10 px-3 py-3 text-white">{t("plans.pro.name")}</th>
              <th className="px-3 py-3">{t("plans.growth.name")}</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.label} className="border-b border-white/10 last:border-0">
                <td className="px-4 py-3 font-medium text-white sm:px-6">{row.label}</td>
                <td className="px-3 py-3 text-white/55">{row.free}</td>
                <td className="bg-[#22C55E]/10 px-3 py-3 font-medium text-white">{row.pro}</td>
                <td className="px-3 py-3 text-white/55">{row.growth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-24">
        <h2 className="text-center text-xl font-bold text-white">{t("faq")}</h2>
        <ul className="mx-auto mt-10 max-w-3xl space-y-4">
          {[
            { q: t("faq1q"), a: t("faq1a") },
            { q: t("faq2q"), a: t("faq2a") },
            { q: t("faq3q"), a: t("faq3a") },
            { q: t("faq4q"), a: t("faq4a") },
            { q: t("faq5q"), a: t("faq5a") },
          ].map((item) => (
            <li
              key={item.q}
              className="rounded-3xl border border-white/[0.08] bg-white/[0.05] p-6 shadow-md backdrop-blur-sm"
            >
              <p className="text-sm font-semibold text-white">{item.q}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{item.a}</p>
            </li>
          ))}
        </ul>
      </section>

      <PricingBottomSection />
    </div>
  );
}
