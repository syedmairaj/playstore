"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlanId } from "@/lib/plan-limits";
import { PRICING, pricingEquivalentMonthlyFromYearly } from "@/constants/pricing";
import { cn } from "@/lib/utils";

const PLAN_ORDER: PlanId[] = ["free", "pro", "growth"];

const PRICING_MODAL_BILLING_STORAGE_KEY = "playstore:pricingModal:billing" as const;

type BillingCycle = "monthly" | "annual";

function planRank(p: PlanId): number {
  return PLAN_ORDER.indexOf(p);
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export type PricingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Effective workspace plan (`free` | `pro` | `growth`). */
  currentPlan: PlanId;
  /** Reserved for future Stripe checkout session context. */
  workspaceId?: string;
  /** Invoked after checkout completes successfully (closes parent limit modals, refreshes plan data). */
  onSubscriptionSuccess?: () => void;
};

type PlanCardDef = {
  id: PlanId;
  monthlyUsd: number;
  yearlyUsd: number;
  popular?: boolean;
};

const PLAN_CARDS: PlanCardDef[] = [
  { id: "free", monthlyUsd: PRICING.free.monthly, yearlyUsd: PRICING.free.yearly },
  { id: "pro", monthlyUsd: PRICING.pro.monthly, yearlyUsd: PRICING.pro.yearly, popular: true },
  { id: "growth", monthlyUsd: PRICING.growth.monthly, yearlyUsd: PRICING.growth.yearly },
];

export function PricingModal({
  open,
  onOpenChange,
  currentPlan,
  workspaceId,
  onSubscriptionSuccess,
}: PricingModalProps) {
  void workspaceId;
  void onSubscriptionSuccess;
  const t = useTranslations("pricingModal");
  const locale = useLocale();
  const isRtl = locale === "ar";

  const [billing, setBilling] = useState<BillingCycle>("monthly");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRICING_MODAL_BILLING_STORAGE_KEY);
      if (raw === "annual" || raw === "monthly") setBilling(raw);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PRICING_MODAL_BILLING_STORAGE_KEY, billing);
    } catch {
      /* ignore */
    }
  }, [billing]);

  function onPlanAction(target: PlanId) {
    const cur = currentPlan;
    if (target === cur) return;
    toast.message(t("checkoutSoonTitle"), {
      description: t("checkoutSoonDescription"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        lang={locale === "ar" ? "ar" : "en"}
        closeButtonSrText={t("close")}
        className={cn(
          "max-h-[min(92vh,880px)] max-w-[min(100vw-1.5rem,72rem)] gap-0 overflow-hidden border border-white/10 bg-[#0c1018] p-0 text-white shadow-2xl sm:rounded-2xl",
          isRtl && "font-arabic",
        )}
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-white/60 hover:bg-white/10 hover:text-white"
      >
        <div className="max-h-[min(92vh,880px)] overflow-y-auto overscroll-contain">
          <div className="border-b border-white/[0.07] bg-gradient-to-br from-emerald-500/15 via-transparent to-transparent px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            <DialogHeader className="space-y-2 text-start">
              <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {t("title")}
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed text-white/60 sm:text-base">
                {t("subtitle")}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-white/55">{t("billing.label")}</p>
              <div
                dir="ltr"
                className="inline-flex w-full max-w-md rounded-full border border-white/[0.12] bg-black/30 p-1 shadow-inner shadow-black/40 transition-colors duration-300 ease-out sm:ms-auto sm:w-auto"
                role="tablist"
                aria-label={t("billing.label")}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={billing === "monthly"}
                  onClick={() => setBilling("monthly")}
                  className={cn(
                    "flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-300 ease-out sm:flex-none sm:px-6",
                    billing === "monthly"
                      ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
                      : "text-white/50 hover:text-white/80",
                  )}
                >
                  {t("billing.monthly")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={billing === "annual"}
                  onClick={() => setBilling("annual")}
                  className={cn(
                    "relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-300 ease-out sm:flex-none sm:px-6",
                    billing === "annual"
                      ? "bg-emerald-500/25 text-emerald-50 shadow-md shadow-emerald-900/30 ring-1 ring-emerald-400/50"
                      : "text-white/50 hover:text-white/80",
                  )}
                >
                  <span>{t("billing.annual")}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "inline-flex border-[#22C55E]/35 px-2 py-0 text-[10px] font-bold uppercase tracking-wide",
                      billing === "annual"
                        ? "bg-[#22C55E]/25 text-[#86efac]"
                        : "border-white/15 bg-white/[0.08] text-white/55",
                    )}
                  >
                    {t("billing.save20")}
                  </Badge>
                </button>
              </div>
            </div>
            {billing === "annual" ? (
              <p className="mt-3 text-xs text-emerald-200/80 sm:text-sm">{t("billing.yearlyNote")}</p>
            ) : null}
          </div>

          <div className="space-y-6 bg-[#0a0d14] px-6 py-6 sm:px-8 sm:py-7">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-stretch lg:gap-6">
              {PLAN_CARDS.map((card) => {
                const isCurrent = currentPlan === card.id;
                const rankDiff = planRank(card.id) - planRank(currentPlan);
                const isPaid = card.monthlyUsd > 0;
                const showAnnual = billing === "annual" && isPaid;
                const planName = t(`plans.${card.id}.name`);

                let ctaLabel: string;
                if (rankDiff === 0) {
                  ctaLabel = t("ctaCurrent");
                } else if (card.id === "free") {
                  ctaLabel = rankDiff < 0 ? t("ctaDowngrade") : t("ctaUpgrade");
                } else if (rankDiff > 0) {
                  if (card.id === "pro") {
                    ctaLabel = t("ctaUpgradePro");
                  } else if (card.id === "growth") {
                    ctaLabel = t("ctaUpgradeGrowth");
                  } else {
                    ctaLabel = t("ctaUpgrade");
                  }
                } else {
                  ctaLabel =
                    billing === "annual"
                      ? t("ctaDowngradeYearly", { plan: planName })
                      : t("ctaDowngradeMonthly", { plan: planName });
                }

                return (
                  <div
                    key={card.id}
                    className={cn(
                      "relative flex min-h-[26rem] flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-lg shadow-black/25 sm:min-h-[28rem]",
                      card.popular &&
                        "border-emerald-400/50 shadow-2xl shadow-emerald-950/30 ring-2 ring-emerald-400/45 ring-offset-2 ring-offset-[#0a0d14] lg:scale-[1.02]",
                    )}
                  >
                    {card.popular ? (
                      <div className="mb-3 flex min-h-[1.75rem] justify-center">
                        <Badge
                          className="border-emerald-500/50 bg-emerald-500/25 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-100 shadow-md shadow-emerald-900/25"
                          variant="outline"
                        >
                          {t("mostPopular")}
                        </Badge>
                      </div>
                    ) : (
                      <div className="mb-3 min-h-[1.75rem]" aria-hidden />
                    )}

                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-white">{planName}</h3>
                      {isCurrent ? (
                        <span className="rounded-full border border-white/[0.14] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                          {t("currentBadge")}
                        </span>
                      ) : null}
                    </div>

                    <div
                      key={`${card.id}-${billing}`}
                      className="mb-3 animate-in fade-in zoom-in-95 duration-300 ease-out motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:transform-none"
                      dir="ltr"
                    >
                      {card.monthlyUsd === 0 ? (
                        <p className="flex flex-wrap items-baseline gap-2">
                          <span className="text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                            {formatUsd(0)}
                          </span>
                          <span className="text-sm text-white/50">{t("perMo")}</span>
                        </p>
                      ) : showAnnual ? (
                        <div className="space-y-1.5">
                          <p className="flex flex-wrap items-baseline gap-2">
                            <span className="text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                              {formatUsd(card.yearlyUsd)}
                            </span>
                            <span className="text-sm font-medium text-white/50">{t("perYrShort")}</span>
                            <Badge
                              variant="outline"
                              className="ms-1 border-[#22C55E]/45 bg-[#22C55E]/12 text-[11px] font-semibold text-[#86efac]"
                            >
                              {t("billing.save20")}
                            </Badge>
                          </p>
                          <p className="text-sm text-white/50">
                            {t("billing.eqPerMonth", {
                              amount: pricingEquivalentMonthlyFromYearly(card.yearlyUsd),
                            })}
                          </p>
                        </div>
                      ) : (
                        <p className="flex flex-wrap items-baseline gap-2">
                          <span className="text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                            {formatUsd(card.monthlyUsd)}
                          </span>
                          <span className="text-sm text-white/50">{t("perMo")}</span>
                        </p>
                      )}
                    </div>

                    <p className="mb-4 text-sm font-medium text-emerald-200/90">{t(`plans.${card.id}.creditsLine`)}</p>

                    <ul className="mb-6 flex flex-1 flex-col gap-2.5 text-sm leading-snug text-white/65">
                      {(["b1", "b2", "b3", "b4"] as const).map((bk) => (
                        <li key={bk} className="flex gap-2.5 text-start">
                          <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>
                            ✓
                          </span>
                          <span>{t(`plans.${card.id}.bullets.${bk}`)}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto">
                      <Button
                        type="button"
                        disabled={isCurrent}
                        className={cn(
                          "h-11 w-full rounded-xl text-sm font-semibold",
                          isCurrent &&
                            "cursor-not-allowed border border-white/10 bg-white/[0.06] text-white/45 hover:bg-white/[0.06]",
                          !isCurrent &&
                            card.popular &&
                            "bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600",
                          !isCurrent &&
                            !card.popular &&
                            "border border-white/12 bg-white/[0.08] text-white hover:bg-white/[0.12]",
                        )}
                        onClick={() => onPlanAction(card.id)}
                      >
                        {ctaLabel}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-white/45">
              <Link
                href="/pricing"
                className="underline decoration-white/25 underline-offset-4 transition-colors hover:text-white/80 hover:decoration-white/40"
              >
                {t("fullPricingLink")}
              </Link>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
