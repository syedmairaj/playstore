"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss: () => void;
  isRtl?: boolean;
  anchor: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
};

export function OptimizationQueueOnboardingPopover({
  open,
  onOpenChange,
  onDismiss,
  isRtl = false,
  anchor,
  align,
  side = "top",
}: Props) {
  const t = useTranslations("competitorSpy.reviewSentiment");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        side={side}
        align={align ?? (isRtl ? "start" : "end")}
        className={cn(
          "w-[min(22rem,calc(100vw-2rem))] border-amber-500/25 bg-[#12100c] p-0",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-amber-500/15 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-amber-100">
              {t("optimizationOnboardingTitle")}
            </p>
            <button
              type="button"
              className="rounded-md p-0.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              aria-label={t("optimizationOnboardingDismiss")}
              onClick={onDismiss}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <p className="px-4 py-3 text-xs leading-relaxed text-zinc-300">
          {t("optimizationOnboardingBody")}
        </p>
        <div className="border-t border-white/[0.06] px-4 py-3">
          <Button
            type="button"
            size="sm"
            className="w-full border-amber-400/30 bg-amber-500/80 text-white hover:bg-amber-400"
            onClick={onDismiss}
          >
            {t("optimizationOnboardingDismiss")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
