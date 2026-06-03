import { getTranslations } from "next-intl/server";

type PricingFaqProps = { locale: string };

const FAQ_ITEM_KEYS = [
  { q: "faq1q", a: "faq1a" },
  { q: "faq2q", a: "faq2a" },
  { q: "faq3q", a: "faq3a" },
  { q: "faq4q", a: "faq4a" },
  { q: "faq5q", a: "faq5a" },
  { q: "faq6q", a: "faq6a" },
] as const;

export async function PricingFaq({ locale }: PricingFaqProps) {
  const t = await getTranslations({ locale, namespace: "pricing" });
  const isRtl = locale === "ar";

  return (
    <section className="mt-24" dir={isRtl ? "rtl" : "ltr"}>
      <h2 className="text-center text-xl font-bold text-white">{t("faq")}</h2>
      <ul
        className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-4 min-[1025px]:grid-cols-2 min-[1025px]:gap-5"
        role="list"
      >
        {FAQ_ITEM_KEYS.map((keys) => (
          <li
            key={keys.q}
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/15 backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-black/25 sm:p-6"
          >
            <p className="text-start text-sm font-semibold leading-snug tracking-tight text-white sm:text-base">
              {t(keys.q)}
            </p>
            <p className="mt-3 text-start text-sm leading-relaxed text-white/60 sm:text-[0.9375rem]">
              {t(keys.a)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
