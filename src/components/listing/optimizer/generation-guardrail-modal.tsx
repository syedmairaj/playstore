"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRtl?: boolean;
  autoStageBusy?: boolean;
  onAutoStage: () => void;
  onContinueGeneric: () => void;
};

export function GenerationGuardrailModal({
  open,
  onOpenChange,
  isRtl = false,
  autoStageBusy = false,
  onAutoStage,
  onContinueGeneric,
}: Props) {
  const t = useTranslations("optimizer.form.generationGuardrail");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "max-w-lg border-amber-500/20 bg-[#0c1018] text-zinc-100",
          isRtl && "font-arabic",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-amber-100">
            <span className="flex size-8 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/25">
              <AlertTriangle className="size-4 text-amber-300" aria-hidden />
            </span>
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-zinc-300">{t("body")}</p>

        <DialogFooter
          className={cn(
            "flex-col gap-2 sm:flex-col sm:space-x-0",
            isRtl && "sm:items-stretch",
          )}
        >
          <Button
            type="button"
            disabled={autoStageBusy}
            className="w-full border-amber-400/30 bg-amber-500/85 text-white hover:bg-amber-400"
            onClick={onAutoStage}
          >
            {autoStageBusy ? (
              <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="me-2 size-4" aria-hidden />
            )}
            {t("autoStage")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={autoStageBusy}
            className="w-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
            onClick={onContinueGeneric}
          >
            {t("continueGeneric")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
