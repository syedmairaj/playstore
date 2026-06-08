"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
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
import { PricingModal } from "@/components/ui/pricing-modal";
import { PRICING } from "@/constants/pricing";
import { canPurchaseCreditTopUps, normalizePlan, type PlanId } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";

type PackBadge = "popular" | "bestValue";

type CreditPack = {
  credits: number;
  priceUsd: number;
  /** USD per credit for display */
  rateUsd: number;
  rateApprox?: boolean;
  badge?: PackBadge;
};

const CREDIT_PACKS: CreditPack[] = [
  {
    credits: PRICING.overagePackCredits,
    priceUsd: PRICING.overagePackUsd,
    rateUsd: PRICING.overagePackUsd / PRICING.overagePackCredits,
  },
  { credits: 250, priceUsd: 24, rateUsd: 24 / 250, badge: "popular" },
  { credits: 500, priceUsd: 45, rateUsd: 45 / 500, badge: "bestValue" },
  { credits: 1000, priceUsd: 75, rateUsd: 75 / 1000, rateApprox: true },
];

function formatUsd(amount: number, maxFrac = 3) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  }).format(amount);
}

function formatRatePerCredit(p: CreditPack) {
  const rounded = p.rateApprox ? Math.round(p.rateUsd * 100) / 100 : p.rateUsd;
  const formatted = formatUsd(rounded, p.rateApprox ? 2 : 2);
  return p.rateApprox ? `≈ ${formatted}` : formatted;
}

function planBadgeKey(plan: PlanId): "planBadgeFree" | "planBadgePro" | "planBadgeGrowth" {
  if (plan === "pro") return "planBadgePro";
  if (plan === "growth") return "planBadgeGrowth";
  return "planBadgeFree";
}

export type AiCreditsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Non-negative workspace balance */
  balance: number;
  /** `empty` when balance is 0; `low` when still positive but under threshold */
  variant: "empty" | "low";
  /** Normalized billing plan (`free` | `pro` | `growth`); raw DB values are normalized via {@link normalizePlan}. */
  workspacePlan: string;
  /** For future Stripe checkout context when opening plan changes from this modal. */
  workspaceId?: string;
};

export function AiCreditsModal({
  open,
  onOpenChange,
  balance,
  variant,
  workspacePlan,
  workspaceId,
}: AiCreditsModalProps) {
  const t = useTranslations("creditsModal");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const b = Math.max(0, balance);
  const normalizedPlan = normalizePlan(workspacePlan);
  const showPacks = canPurchaseCreditTopUps(workspacePlan);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);

  function onPurchasePack(credits: number, priceUsd: number) {
    toast.message(t("purchaseSoonTitle"), {
      description: t("purchaseSoonDescription", { credits, price: formatUsd(priceUsd) }),
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          dir={isRtl ? "rtl" : "ltr"}
          lang={locale === "ar" ? "ar" : "en"}
          closeButtonSrText={t("close")}
          className={cn(
            "max-h-[min(90vh,860px)] max-w-[min(100vw-1.5rem,56rem)] gap-0 overflow-hidden border border-white/10 bg-[#0c1018] p-0 text-white shadow-2xl sm:rounded-2xl",
            isRtl && "font-arabic",
          )}
          overlayClassName="bg-black/75 backdrop-blur-md"
          closeButtonClassName="text-white/60 hover:bg-white/10 hover:text-white"
        >
          <div className="max-h-[min(90vh,860px)] overflow-y-auto overscroll-contain">
            <div className="border-b border-white/[0.07] bg-gradient-to-br from-emerald-500/15 via-transparent to-transparent ps-6 pe-6 pb-5 pt-6 sm:ps-8 sm:pe-8 sm:pb-6 sm:pt-7">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end justify-between gap-3 gap-y-2">
                  <div className="min-w-0 flex flex-col gap-1.5 text-start">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                      {t("balanceLabel")}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.75rem]",
                        b === 0 ? "text-red-300" : "text-emerald-300",
                      )}
                      dir="ltr"
                    >
                      {t("balanceValue", { count: b })}
                    </span>
                  </div>
                  <span className="inline-flex max-w-full shrink-0 items-center rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-[11px] font-medium leading-tight text-white/55">
                    {t(planBadgeKey(normalizedPlan))}
                  </span>
                </div>

                <DialogHeader className="space-y-2 text-start">
                  <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {variant === "empty"
                      ? normalizedPlan === "free"
                        ? t("outOfTitleFree")
                        : t("outOfTitle")
                      : t("lowTitle")}
                  </DialogTitle>
                  <DialogDescription className="text-[15px] leading-relaxed text-white/60 sm:text-base">
                    {variant === "empty" ? (
                      normalizedPlan === "free" ? (
                        <>
                          <span className="block font-medium text-white/75">{t("outOfFreeOneTimeCredits")}</span>
                          <span className="mt-2 block">{t("outOfSubtitleFreeUpsell")}</span>
                        </>
                      ) : (
                        t("outOfSubtitle")
                      )
                    ) : (
                      t("lowSubtitle")
                    )}
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <div className="space-y-4 bg-[#0a0d14] ps-6 pe-6 py-6 sm:ps-8 sm:pe-8 sm:py-7">
              {showPacks ? (
                <>
                  <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-white/40">
                    {t("packsEyebrow")}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {CREDIT_PACKS.map((pack) => (
                      <div
                        key={pack.credits}
                        className={cn(
                          "flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 pt-3 shadow-lg shadow-black/20",
                          pack.badge === "popular" &&
                            "border-emerald-400/35 ring-1 ring-emerald-400/20 lg:scale-[1.02]",
                        )}
                      >
                        <div className="mb-2 flex min-h-[1.375rem] justify-center">
                          {pack.badge ? (
                            <Badge
                              className={cn(
                                "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                pack.badge === "popular"
                                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                                  : "border-amber-500/40 bg-amber-500/15 text-amber-100",
                              )}
                              variant="outline"
                            >
                              {pack.badge === "popular" ? t("badgePopular") : t("badgeBestValue")}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mb-3 text-center">
                          <p
                            className="font-mono text-3xl font-bold tabular-nums tracking-tight text-white sm:text-[2rem]"
                            dir="ltr"
                          >
                            {pack.credits}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-white/45">{t("creditsWord")}</p>
                        </div>
                        <div className="mb-1 text-center">
                          <p className="font-mono text-xl font-semibold text-white" dir="ltr">
                            {formatUsd(pack.priceUsd)}
                          </p>
                          <p className="mt-1.5 text-[11px] leading-snug text-white/50" dir="ltr">
                            {formatRatePerCredit(pack)}
                            <span className="text-white/40">{t("perCreditSuffix")}</span>
                          </p>
                        </div>
                        <div className="mt-auto pt-4">
                          <Button
                            type="button"
                            className="h-10 w-full rounded-xl bg-emerald-500 text-sm font-semibold text-white shadow-md shadow-emerald-500/15 hover:bg-emerald-600"
                            onClick={() => onPurchasePack(pack.credits, pack.priceUsd)}
                          >
                            {t("purchase")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setPricingModalOpen(true)}
                      className="text-sm font-medium text-emerald-300/95 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:text-emerald-200 hover:decoration-emerald-400/60"
                    >
                      {t("viewAllPlans")}
                    </button>
                    <p className="text-[11px] leading-relaxed text-white/40">
                      <Link
                        href="/pricing"
                        className="underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-white/60 hover:decoration-white/35"
                      >
                        {t("fullPricingFooter")}
                      </Link>
                    </p>
                  </div>
                </>
              ) : (
                <div className="mx-auto flex w-full max-w-lg flex-col gap-5 text-center">
                  <p className="text-[15px] leading-relaxed text-white/65 sm:text-base">{t("topUpsPlanGate")}</p>
                  <div className="flex flex-col gap-3">
                    <Button
                      type="button"
                      className="h-11 w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 sm:h-12 sm:text-[15px]"
                      onClick={() => setPricingModalOpen(true)}
                    >
                      {t("upgradeToProCta")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setPricingModalOpen(true)}
                      className="text-sm font-medium text-emerald-300/85 underline decoration-emerald-500/35 underline-offset-[5px] transition-colors hover:text-emerald-200 hover:decoration-emerald-400/55"
                    >
                      {t("viewAllPlans")}
                    </button>
                    <p className="text-[11px] leading-relaxed text-white/40">
                      <Link
                        href="/pricing"
                        className="underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-white/60 hover:decoration-white/35"
                      >
                        {t("fullPricingFooter")}
                      </Link>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PricingModal
        open={pricingModalOpen}
        onOpenChange={setPricingModalOpen}
        currentPlan={normalizedPlan}
        workspaceId={workspaceId}
      />
    </>
  );
}
