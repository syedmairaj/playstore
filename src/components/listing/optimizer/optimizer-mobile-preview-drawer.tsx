"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  OptimizerPreviewInner,
  type OptimizerPreviewInnerProps,
} from "@/components/listing/optimizer/optimizer-preview-inner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type OptimizerMobilePreviewDrawerProps = OptimizerPreviewInnerProps;

export function OptimizerMobilePreviewDrawer(props: OptimizerMobilePreviewDrawerProps) {
  const { isRtl, previewConnected, ...innerProps } = props;
  const t = useTranslations("optimizer");
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
        aria-hidden={open}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="optimizer-mobile-preview-sheet"
          aria-label={t("preview.showMobileAria")}
          className={cn(
            "pointer-events-auto mx-auto flex w-[min(100%-1.5rem,22rem)] items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-md",
            "transition-[transform,box-shadow,border-color] duration-300 motion-safe:active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34A853]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c11]",
            previewConnected
              ? "border-[#34A853]/45 bg-[#0a1210]/95 text-[#d1fae5] shadow-[0_8px_32px_-10px_rgba(52,168,83,0.45)]"
              : "border-zinc-700/80 bg-zinc-950/95 text-white/85 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.55)]",
            isRtl && "flex-row-reverse",
            open && "pointer-events-none opacity-0",
          )}
        >
          <Smartphone className="size-4 shrink-0 opacity-90" aria-hidden />
          <span className="whitespace-nowrap">{t("preview.showMobile")}</span>
          <ChevronUp className="size-4 shrink-0 opacity-70" aria-hidden />
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          id="optimizer-mobile-preview-sheet"
          side="bottom"
          dir={isRtl ? "rtl" : "ltr"}
          className={cn(
            "max-h-[min(92dvh,820px)] overflow-y-auto rounded-t-2xl border-zinc-800/90 bg-[#080f0d] p-0 pb-[max(1rem,env(safe-area-inset-bottom))]",
            "[&>button]:end-4 [&>button]:top-4",
          )}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("preview.label")}</SheetTitle>
            <SheetDescription>{t("preview.interactive")}</SheetDescription>
          </SheetHeader>

          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-800/80 bg-[#080f0d]/95 px-4 py-3 backdrop-blur-md">
            <p className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/85">
              {t("preview.label")}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("preview.hideMobileAria")}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-white/70",
                "transition-[color,background-color,border-color] duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white/90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34A853]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080f0d]",
                isRtl && "flex-row-reverse",
              )}
            >
              <span>{t("preview.hideMobile")}</span>
              <ChevronDown className="size-3.5 opacity-80" aria-hidden />
            </button>
          </div>

          <div className="px-4 py-5">
            <OptimizerPreviewInner
              {...innerProps}
              isRtl={isRtl}
              previewConnected={previewConnected}
              compact
              showHeader={false}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
