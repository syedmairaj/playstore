"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PRICING } from "@/lib/pricing-plans";
import { useAuthModal } from "@/components/auth/auth-modal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "yearly";

const PRO_INCLUDE_KEYS = [
  "optimizer",
  "asoHealth",
  "competitor",
  "keywords",
  "reviews",
  "exports",
  "alerts",
  "support",
] as const;

function savingsPercent(monthly: number, yearly: number): number {
  const full = monthly * 12;
  if (full <= 0) return 0;
  return Math.max(0, Math.round((1 - yearly / full) * 100));
}

function eqMonthly(yearly: number): string {
  return (yearly / 12).toFixed(2);
}

export function PricingPlans() {
  const t = useTranslations("pricing");
  const { openAuth } = useAuthModal();
  const [cycle, setCycle] = useState<Cycle>("monthly");

  const plans = useMemo(
    () =>
      [
        {
          id: "free" as const,
          monthly: PRICING.free.monthly,
          yearly: PRICING.free.yearly,
          highlight: false,
          features: [t("features.apps1"), t("features.kwLimited"), t("features.credits20")],
        },
        {
          id: "pro" as const,
          monthly: PRICING.pro.monthly,
          yearly: PRICING.pro.yearly,
          highlight: true,
          features: PRO_INCLUDE_KEYS.map((key) => t(`proIncludes.${key}`)),
        },
        {
          id: "growth" as const,
          monthly: PRICING.growth.monthly,
          yearly: PRICING.growth.yearly,
          highlight: false,
          features: [
            t("features.appsUnlimited"),
            t("features.kwFull"),
            t("features.credits800"),
            t("features.team"),
            t("features.priority"),
            t("features.alerts"),
            t("features.exports"),
          ],
        },
      ] as const,
    [t],
  );

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <p className="text-sm font-medium text-white/55">{t("billingLabel")}</p>
        <div
          className="inline-flex rounded-full border border-white/15 bg-white/[0.06] p-1 shadow-inner"
          role="tablist"
          aria-label={t("billingLabel")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200",
              cycle === "monthly"
                ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                : "text-white/50 hover:text-white",
            )}
          >
            {t("billingMonthly")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "yearly"}
            onClick={() => setCycle("yearly")}
            className={cn(
              "relative rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200",
              cycle === "yearly"
                ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                : "text-white/50 hover:text-white",
            )}
          >
            {t("billingYearly")}
            <Badge
              variant="secondary"
              className="ms-2 hidden border-[#22C55E]/30 bg-[#22C55E]/15 text-[10px] font-bold uppercase tracking-wide text-[#22C55E] sm:inline-flex"
            >
              {t("saveBadge", { percent: 20 })}
            </Badge>
          </button>
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-lg text-center text-xs text-white/50 sm:text-sm">
        {t("yearlyNote")}
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-3 lg:items-stretch">
        {plans.map((p) => {
          const isFree = p.id === "free";
          const isPro = p.id === "pro";
          const pct = !isFree ? savingsPercent(p.monthly, p.yearly) : 0;
          const showYearly = cycle === "yearly" && !isFree;

          return (
            <div key={p.id} className="flex min-w-0 flex-col">
              {isPro ? (
                <p
                  className="mb-3 text-center text-sm font-medium leading-snug text-[#86efac] sm:text-[0.9375rem] lg:mx-auto lg:flex lg:min-h-[4.25rem] lg:max-w-[20rem] lg:items-end lg:justify-center lg:text-balance"
                >
                  {t("proPositioning")}
                </p>
              ) : (
                <div className="mb-3 hidden lg:block lg:min-h-[4.25rem]" aria-hidden />
              )}

              <Card
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-hidden border-white/10 bg-white/[0.05] backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-0.5",
                  p.highlight
                    ? "border-[#22C55E]/50 shadow-xl shadow-[#22C55E]/15 ring-2 ring-[#22C55E]/30 lg:relative lg:z-10 lg:scale-[1.02]"
                    : "hover:border-white/20",
                )}
              >
                <CardHeader className="space-y-2 pb-2">
                  {p.highlight ? (
                    <Badge className="w-fit border-[#22C55E]/40 bg-[#22C55E]/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#4ade80]">
                      {t("mostPopular")}
                    </Badge>
                  ) : (
                    <span className="text-[11px] font-medium text-transparent">.</span>
                  )}
                  <h2 className="text-xl font-bold tracking-tight text-white">{t(`plans.${p.id}.name`)}</h2>
                  <p className="text-sm leading-snug text-white/55">{t(`plans.${p.id}.desc`)}</p>
                  <div className="pt-3">
                    {isPro ? (
                      <p className="text-sm font-semibold tracking-tight text-[#4ade80]">
                        {t("plans.pro.priceBlurb")}
                      </p>
                    ) : null}
                    {isFree ? (
                      <p className="flex flex-wrap items-baseline gap-2">
                        <span className="text-4xl font-bold tracking-tight text-white">$0</span>
                        <span className="text-sm text-white/50">{t("forever")}</span>
                      </p>
                    ) : showYearly ? (
                      <div className={cn("space-y-1", isPro && "mt-3")}>
                        <p className="flex flex-wrap items-baseline gap-2">
                          <span className="text-4xl font-bold tracking-tight text-white">${p.yearly}</span>
                          <span className="text-sm font-medium text-white/50">{t("perYrShort")}</span>
                        </p>
                        <p className="text-sm text-white/50">
                          {t("eqPerMonth", { amount: eqMonthly(p.yearly) })}
                        </p>
                        {pct > 0 ? (
                          <Badge
                            variant="outline"
                            className="mt-2 w-fit border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]"
                          >
                            {t("saveVsMonthly", { percent: pct })}
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <p className={cn("flex flex-wrap items-baseline gap-2", isPro && "mt-3")}>
                        <span className="text-4xl font-bold tracking-tight text-white">${p.monthly}</span>
                        <span className="text-sm font-medium text-white/50">{t("perMo")}</span>
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pt-2">
                  <ul className="space-y-2.5 text-sm text-white/60">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <span className="mt-0.5 shrink-0 text-[#22C55E]">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex flex-col gap-2 pt-2">
                  <Button
                    type="button"
                    size="lg"
                    variant={p.highlight ? "default" : "secondary"}
                    className={cn(
                      "h-12 w-full text-base font-semibold transition duration-200 active:scale-[0.99]",
                      p.highlight &&
                        "border-0 bg-[#22C55E] text-white shadow-lg shadow-[#22C55E]/30 hover:bg-[#16a34a]",
                      !p.highlight &&
                        "border border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.12]",
                    )}
                    onClick={() => openAuth("signup")}
                  >
                    {t(`plans.${p.id}.cta`)}
                  </Button>
                  {!isFree ? (
                    <p className="text-center text-[11px] leading-relaxed text-white/45">{t("creditsHint")}</p>
                  ) : null}
                </CardFooter>
              </Card>
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-white/55 sm:text-base">
        {t("overage")}
      </p>
    </div>
  );
}
