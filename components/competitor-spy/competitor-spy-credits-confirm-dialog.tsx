"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credits: number;
  isRtl: boolean;
  onConfirm: () => void;
  /** Override the rendered title string. When omitted, uses the default creditsConfirm.title key. */
  titleOverride?: string;
  /** Override the rendered body string. When omitted, uses the default creditsConfirm.body key. */
  bodyOverride?: string;
  /** Override the rendered confirm button label. When omitted, uses creditsConfirm.confirmContinue. */
  confirmOverride?: string;
};

export function CompetitorSpyCreditsConfirmDialog({
  open,
  onOpenChange,
  credits,
  isRtl,
  onConfirm,
  titleOverride,
  bodyOverride,
  confirmOverride,
}: Props) {
  const t = useTranslations("competitorSpy.creditsConfirm");

  const title = titleOverride ?? t("title");
  const body = bodyOverride ?? t("body", { credits });
  const confirmLabel = confirmOverride ?? t("confirmContinue");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "border border-zinc-800 bg-[#0B0E14] text-white sm:max-w-md",
          isRtl && "font-arabic",
        )}
        closeButtonClassName="text-white/60 hover:text-white"
        closeButtonSrText={t("cancel")}
      >
        <DialogHeader className={cn(isRtl ? "text-end sm:text-end" : "text-start sm:text-start")}>
          <DialogTitle className="text-lg font-semibold text-white">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-white/60">
            {body}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter
          className={cn(
            "gap-2 sm:gap-2",
            isRtl ? "sm:flex-row-reverse sm:justify-start" : "sm:justify-end",
          )}
        >
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 bg-zinc-900/80 text-white/85 hover:bg-zinc-800"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            className="bg-emerald-500 font-semibold text-white hover:bg-emerald-400"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
