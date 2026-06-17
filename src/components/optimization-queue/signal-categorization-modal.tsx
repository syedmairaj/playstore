"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SignalCluster } from "@/lib/optimization-queue/signal-cluster";

export type SignalCategorizationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentPreview: string;
  isRtl?: boolean;
  onConfirm: (cluster: SignalCluster) => void;
};

const CLUSTER_OPTIONS: SignalCluster[] = [
  "OFFENSIVE_GROWTH",
  "DEFENSIVE_PAIN_POINT",
  "MARKET_INTEL",
];

export function SignalCategorizationModal({
  open,
  onOpenChange,
  contentPreview,
  isRtl = false,
  onConfirm,
}: SignalCategorizationModalProps) {
  const t = useTranslations("optimizer.signalCategorization");
  const [selected, setSelected] = useState<SignalCluster>("DEFENSIVE_PAIN_POINT");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-zinc-800 bg-zinc-950" dir={isRtl ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className={isRtl ? "text-end" : ""}>{t("title")}</DialogTitle>
          <DialogDescription className={isRtl ? "text-end" : ""}>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
          {contentPreview}
        </p>

        <div className="space-y-2">
          {CLUSTER_OPTIONS.map((cluster) => (
            <label
              key={cluster}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 px-3 py-2.5 hover:border-violet-500/40"
            >
              <input
                type="radio"
                name="signal-cluster"
                className="mt-1"
                checked={selected === cluster}
                onChange={() => setSelected(cluster)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">
                  {t(`clusters.${cluster}.label`)}
                </span>
                <span className="block text-xs text-white/50">
                  {t(`clusters.${cluster}.hint`)}
                </span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter className={isRtl ? "sm:justify-start" : undefined}>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(selected);
              onOpenChange(false);
            }}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
