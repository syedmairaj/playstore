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
  /** When true, renders a pro-tip block steering the user toward Competitor Spy first. */
  showSpyTip?: boolean;
  /** Which autofill field triggered the dialog — selects field-specific body copy when showSpyTip is true. */
  autofillField?: "keywords" | "features";
  /** href for the "Go to Competitor Spy" link (e.g. `/app/{workspaceId}/competitors`). */
  spyHref?: string;
  /** Called when the user clicks the spy link so the parent can close/reset pending state. */
  onGoToSpy?: () => void;
};

export function OptimizerCreditsConfirmDialog({
  open,
  onOpenChange,
  credits,
  isRtl,
  onConfirm,
  showSpyTip,
  autofillField,
  spyHref,
  onGoToSpy,
}: Props) {
  const t = useTranslations("optimizer");

  function resolveBodyText(): string {
    if (showSpyTip) {
      if (autofillField === "keywords") return t("form.confirmCreditsBodyKeywords");
      if (autofillField === "features") return t("form.confirmCreditsBodyFeatures");
      return t("form.confirmCreditsBodyWithTip", { credits });
    }
    return t("form.confirmCreditsBody", { credits });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "border border-zinc-800 bg-[#0B0E14] text-white sm:max-w-md",
          isRtl && "font-arabic",
        )}
        closeButtonClassName="text-white/60 hover:text-white"
        closeButtonSrText={t("form.confirmCreditsCancel")}
      >
        <DialogHeader className={cn(isRtl ? "text-end sm:text-end" : "text-start sm:text-start")}>
          <DialogTitle className="text-lg font-semibold text-white">
            {t("form.confirmCreditsTitle")}
          </DialogTitle>
          <DialogDescription
            className="whitespace-pre-line text-sm leading-relaxed text-white/60"
          >
            {resolveBodyText()}
          </DialogDescription>
        </DialogHeader>

        {showSpyTip && spyHref ? (
          <div className={cn(isRtl ? "text-end" : "text-start")}>
            <a
              href={spyHref}
              onClick={() => {
                onGoToSpy?.();
                onOpenChange(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
            >
              {t("form.confirmCreditsSpyLink")}
            </a>
          </div>
        ) : null}

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
            {t("form.confirmCreditsCancel")}
          </Button>
          <Button
            type="button"
            className="bg-emerald-500 font-semibold text-white hover:bg-emerald-400"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t("form.confirmCreditsYes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
