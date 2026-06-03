"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { LocalizeMarketCode } from "@/lib/listing/localized-markets";
import { cn } from "@/lib/utils";

type LocalizedMarketOptionsMenuProps = {
  market: LocalizeMarketCode;
  disabled?: boolean;
  busy?: boolean;
  onRegenerate: (market: LocalizeMarketCode) => void;
  onExport: (market: LocalizeMarketCode) => void;
  onDelete: (market: LocalizeMarketCode) => void;
};

export function LocalizedMarketOptionsMenu({
  market,
  disabled = false,
  busy = false,
  onRegenerate,
  onExport,
  onDelete,
}: LocalizedMarketOptionsMenuProps) {
  const t = useTranslations("optimizer.results.localize");
  const regenerateCredits = AI_CREDIT_COSTS.localization;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
          )}
          aria-label={t("optionsMenuAria")}
        >
          <span>{t("optionsLabel")}</span>
          <MoreHorizontal className="size-3.5 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[220px] border-white/[0.1] bg-zinc-900 text-zinc-100"
      >
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onRegenerate(market)}
          className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
        >
          {t("optionRegenerate", { credits: regenerateCredits })}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onExport(market)}
          className="cursor-pointer gap-2 focus:bg-white/[0.08] focus:text-white"
        >
          {t("optionExportTxt")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => onDelete(market)}
          className="cursor-pointer gap-2 text-rose-300 focus:bg-rose-500/15 focus:text-rose-200"
        >
          {t("optionDelete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
