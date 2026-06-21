"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRO_POWER_PACK } from "@/lib/features/billing/credit-packs";
import { cn } from "@/lib/utils";

export type CreditTopUpModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Shown for context — does not gate checkout (server validates plan). */
  workspacePlan?: string;
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CreditTopUpModal({
  open,
  onOpenChange,
  workspaceId,
}: CreditTopUpModalProps) {
  const t = useTranslations("creditTopUpModal");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const [busy, setBusy] = useState(false);

  async function startCheckout() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/billing/credit-topup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            packId: PRO_POWER_PACK.id,
            locale,
          }),
        },
      );
      const json = (await res.json()) as
        | { ok: true; checkoutUrl: string }
        | { ok: false; error?: { message?: string; code?: string } };

      if (!json.ok || !("checkoutUrl" in json) || !json.checkoutUrl) {
        toast.error(
          json.ok === false
            ? json.error?.message ?? t("checkoutError")
            : t("checkoutError"),
        );
        return;
      }

      window.location.assign(json.checkoutUrl);
    } catch {
      toast.error(t("checkoutError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        lang={locale === "ar" ? "ar" : "en"}
        closeButtonSrText={t("close")}
        className={cn(
          "max-w-md gap-0 overflow-hidden border border-white/10 bg-[#0c1018] p-0 text-white shadow-2xl sm:rounded-2xl",
          isRtl && "font-arabic",
        )}
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-white/60 hover:bg-white/10 hover:text-white"
      >
        <div className="border-b border-white/[0.07] bg-gradient-to-br from-amber-500/15 via-transparent to-transparent px-6 pb-5 pt-6">
          <DialogHeader className="space-y-2 text-start">
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-amber-300" aria-hidden />
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                {t("title")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[15px] leading-relaxed text-white/60">
              {t("subtitle")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center ring-1 ring-emerald-400/20">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/80">
              {t("packName")}
            </p>
            <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-white" dir="ltr">
              {PRO_POWER_PACK.credits}
            </p>
            <p className="text-sm text-white/55">{t("creditsWord")}</p>
            <p className="mt-3 font-mono text-2xl font-semibold text-white" dir="ltr">
              {formatUsd(PRO_POWER_PACK.priceUsd)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/45">{t("oneTimeNote")}</p>
          </div>

          <Button
            type="button"
            disabled={busy}
            className="h-11 w-full rounded-xl bg-emerald-500 text-base font-semibold text-white hover:bg-emerald-600"
            onClick={() => void startCheckout()}
          >
            {busy ? t("checkoutBusy") : t("checkoutCta", { price: formatUsd(PRO_POWER_PACK.priceUsd) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
