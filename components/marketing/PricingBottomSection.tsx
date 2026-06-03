"use client";

import { useTranslations } from "next-intl";
import { PRICING } from "@/constants/pricing";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";
import { cn } from "@/lib/utils";

function formatUsdWhole(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PricingBottomSection() {
  const t = useTranslations("pricing");
  const price = `\u200E${formatUsdWhole(PRICING.overagePackUsd)}`;
  const credits = `\u200E${PRICING.overagePackCredits}`;

  return (
    <section className="mt-20 rounded-3xl border border-white/[0.1] bg-white/[0.05] px-6 py-12 text-center shadow-lg shadow-black/25 backdrop-blur-[12px] sm:px-10 sm:py-14">
      <h2 className="text-xl font-bold text-white sm:text-2xl">{t("bottomTitle")}</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm text-white/60 sm:text-base">{t("bottomSubtitle")}</p>
      <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base" dir="auto">
        {t("topUpFooter", { price, credits })}
      </p>
      <p className="mx-auto mt-4 max-w-md text-xs text-white/50 sm:text-sm">{t("trustCtaLine")}</p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <AuthModalTrigger
          intent="signup"
          label={t("plans.free.cta")}
          className={cn(
            "inline-flex h-12 min-w-[200px] items-center justify-center rounded-xl border-0 bg-emerald-500 px-8 text-base font-semibold text-white shadow-xl shadow-emerald-500/35 ring-2 ring-emerald-400/30 hover:bg-emerald-600",
          )}
        />
        <a
          href="mailto:hello@playstore.xyz?subject=PlayStore%20plans"
          className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-xl border border-white/20 bg-white/[0.04] px-8 text-base font-semibold text-white/90 transition duration-200 hover:bg-white/[0.08]"
        >
          {t("contactSales")}
        </a>
      </div>
    </section>
  );
}
