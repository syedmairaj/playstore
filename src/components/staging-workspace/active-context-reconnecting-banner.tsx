"use client";

import { Loader2, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Props = {
  isRtl?: boolean;
  className?: string;
};

export function ActiveContextReconnectingBanner({ isRtl = false, className }: Props) {
  const t = useTranslations("optimizer.activeContext");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3",
        isRtl && "flex-row-reverse text-end font-arabic",
        className,
      )}
    >
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-amber-300" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-100">
          <WifiOff className="size-3.5 opacity-80" aria-hidden />
          {t("reconnecting")}
        </p>
        <p className="text-[11px] leading-relaxed text-amber-200/70">{t("reconnectingDetail")}</p>
      </div>
    </div>
  );
}
