"use client";

import { useTranslations } from "next-intl";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";
import { cn } from "@/lib/utils";

export function PricingBottomSection() {
  const t = useTranslations("pricing");

  return (
    <section className="mt-20 rounded-3xl border border-white/[0.1] bg-white/[0.05] px-6 py-12 text-center shadow-lg shadow-black/25 backdrop-blur-[12px] sm:px-10 sm:py-14">
      <h2 className="text-xl font-bold text-white sm:text-2xl">{t("bottomTitle")}</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm text-white/60 sm:text-base">{t("bottomSubtitle")}</p>
      <p className="mx-auto mt-4 max-w-md text-xs text-white/50 sm:text-sm">{t("trustCtaLine")}</p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <AuthModalTrigger
          intent="signup"
          label={t("plans.free.cta")}
          className={cn(
            "inline-flex h-12 min-w-[200px] items-center justify-center rounded-xl border-0 bg-[#22C55E] px-8 text-base font-semibold text-white shadow-lg shadow-[#22C55E]/25 hover:bg-[#16a34a]",
          )}
        />
        <a
          href="mailto:hello@playstore.xyz?subject=PlayStore%20plans"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-8 text-base font-semibold text-white transition duration-200 hover:bg-white/[0.1]"
        >
          {t("contactSales")}
        </a>
      </div>
    </section>
  );
}
