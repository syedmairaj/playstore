"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { PricingModal } from "@/components/ui/pricing-modal";
import { appLimitsQueryKey } from "@/hooks/use-app-limits";
import { normalizePlan, type PlanId, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Normalized plan slug from limits API. */
  plan: string;
  currentCount: number;
  appLimit: number;
  workspaceId?: string;
  /** Called after a successful subscription (when checkout is wired). */
  onSubscriptionSuccess?: () => void;
};

function formatLimit(limit: number): string {
  if (limit === UNLIMITED_APP_SLOTS) return "∞";
  return String(limit);
}

function nextTier(current: PlanId): "pro" | "growth" | null {
  if (current === "free") return "pro";
  if (current === "pro") return "growth";
  return null;
}

export function UpgradeModal({
  open,
  onOpenChange,
  plan,
  currentCount,
  appLimit,
  workspaceId,
  onSubscriptionSuccess,
}: UpgradeModalProps) {
  const t = useTranslations("upgradeModal");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const queryClient = useQueryClient();
  const [pricingOpen, setPricingOpen] = useState(false);

  const pid = normalizePlan(plan) as PlanId;
  const target = nextTier(pid);

  function openPricingOverlay() {
    onOpenChange(false);
    setPricingOpen(true);
  }

  function handleSubscriptionSuccess() {
    setPricingOpen(false);
    onOpenChange(false);
    if (workspaceId) {
      void queryClient.invalidateQueries({ queryKey: appLimitsQueryKey(workspaceId) });
    }
    onSubscriptionSuccess?.();
  }

  const primaryCta =
    pid === "growth" ? t("ctaViewPlans") : target === "pro" ? t("ctaPro") : t("ctaGrowth");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          dir={isRtl ? "rtl" : "ltr"}
          lang={locale === "ar" ? "ar" : "en"}
          className={cn(
            "max-w-md border border-white/10 bg-[#0f1319] p-0 text-white shadow-2xl sm:rounded-2xl",
            isRtl && "font-arabic",
          )}
          overlayClassName="bg-black/75 backdrop-blur-md"
          closeButtonClassName="text-white/60 hover:bg-white/10 hover:text-white"
        >
          <div className="border-b border-white/[0.07] bg-gradient-to-br from-[#22C55E]/12 to-transparent px-6 pb-5 pt-6">
            <DialogHeader className="space-y-2 text-start">
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                {pid === "growth" ? t("titleAtGrowthCap") : t("title")}
              </DialogTitle>
              <div className="space-y-2 text-sm leading-relaxed text-white/60">
                {pid === "growth" ? (
                  <p>
                    {t("bodyGrowthCap", {
                      count: currentCount,
                      limit: formatLimit(appLimit),
                    })}
                  </p>
                ) : pid === "free" ? (
                  <>
                    <p>{t("bodyFreeLimit")}</p>
                    <p>{t("bodyUpgradePitchPro")}</p>
                  </>
                ) : (
                  <>
                    <p>{t("bodyProLimit")}</p>
                    <p>{t("bodyUpgradePitchGrowth")}</p>
                  </>
                )}
              </div>
            </DialogHeader>
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t border-white/[0.06] bg-[#0b0e14] px-6 py-5 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              className="h-11 w-full rounded-xl bg-[#22C55E] text-base font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a]"
              onClick={openPricingOverlay}
            >
              {primaryCta}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full rounded-xl text-white/70 hover:bg-white/[0.06] hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              {t("maybeLater")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PricingModal
        open={pricingOpen}
        onOpenChange={setPricingOpen}
        currentPlan={pid}
        workspaceId={workspaceId}
        onSubscriptionSuccess={handleSubscriptionSuccess}
      />
    </>
  );
}
