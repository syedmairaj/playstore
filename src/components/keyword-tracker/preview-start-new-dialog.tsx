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

export type PreviewStartNewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
};

export function PreviewStartNewDialog({
  open,
  onOpenChange,
  onConfirm,
  pending = false,
}: PreviewStartNewDialogProps) {
  const t = useTranslations("keywordTracker.previewStartNew");
  const locale = useLocale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md border-white/[0.08] bg-[#0a0e14] text-zinc-100 sm:rounded-2xl",
        )}
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-zinc-500 hover:text-white"
        closeButtonSrText={t("cancel")}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-2 text-start">
          <DialogTitle className="text-xl font-semibold text-white">{t("title")}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-zinc-400">
            {t("description")}
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
            className="bg-emerald-600 text-white hover:bg-emerald-500"
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
