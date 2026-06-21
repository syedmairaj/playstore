"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
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
  const [proratedBusy, setProratedBusy] = useState(false);
  const [proratedUsd, setProratedUsd] = useState<number | null>(null);
  const [proratedLoading, setProratedLoading] = useState(false);

  const pid = normalizePlan(plan) as PlanId;
  const target = nextTier(pid);

  useEffect(() => {
    if (!open || pid !== "pro" || !workspaceId) {
      setProratedUsd(null);
      return;
    }
    let cancelled = false;
    setProratedLoading(true);
    void fetch(`/api/workspaces/${workspaceId}/billing/prorated-upgrade`, {
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; eligible?: boolean; proratedUsd?: number } | null) => {
        if (cancelled || !json?.ok || !json.eligible) return;
        if (typeof json.proratedUsd === "number") setProratedUsd(json.proratedUsd);
      })
      .finally(() => {
        if (!cancelled) setProratedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pid, workspaceId]);

  async function startProratedUpgrade() {
    if (!workspaceId) {
      openPricingOverlay();
      return;
    }
    setProratedBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/billing/prorated-upgrade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ locale }),
        },
      );
      const json = (await res.json()) as
        | { ok: true; checkoutUrl?: string }
        | { ok: false; error?: { message?: string } };
      if (json.ok && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      openPricingOverlay();
    } finally {
      setProratedBusy(false);
    }
  }

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
            {pid === "pro" && workspaceId ? (
              <button
                type="button"
                disabled={proratedBusy || proratedLoading}
                onClick={() => void startProratedUpgrade()}
                className="text-sm font-semibold text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 hover:text-emerald-200 disabled:opacity-50"
              >
                {proratedLoading
                  ? t("proratedUpgradeLoading")
                  : proratedUsd != null
                    ? t("proratedUpgradeCta", {
                        amount: new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(proratedUsd),
                      })
                    : t("proratedUpgradeCtaFallback")}
              </button>
            ) : null}
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
