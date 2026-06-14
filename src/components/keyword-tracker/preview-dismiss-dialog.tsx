"use client";

import { useLocale, useTranslations } from "next-intl";
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

export type PreviewDismissDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  creditsUsed?: number;
  marketCount?: number;
};

export function PreviewDismissDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
  creditsUsed = 0,
  marketCount = 0,
}: PreviewDismissDialogProps) {
  const t = useTranslations("keywordTracker.previewDismiss");
  const locale = useLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md border-white/[0.08] bg-[#0a0e14] text-zinc-100 shadow-[0_0_0_1px_rgba(245,158,11,0.15)] sm:rounded-2xl",
        )}
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-zinc-500 hover:text-white"
        closeButtonSrText={t("cancel")}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-2 text-start">
          <DialogTitle className="text-xl font-semibold text-white">{t("title")}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm leading-relaxed text-zinc-400">
              <p>{t("creditsAlreadyUsed", { credits: creditsUsed })}</p>
              <p>{t("description")}</p>
              {marketCount > 0 ? (
                <p className="text-xs text-zinc-500">
                  {t("marketsNote", { count: marketCount })}
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/[0.06]"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
            disabled={pending}
            onClick={() => {
              onConfirm();
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
