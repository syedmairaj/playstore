"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CountrySelector } from "@/components/country-selector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import type { SupportedCountryCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

export type PreviewMarketsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: string;
  /** Countries that currently have preview data on screen. */
  previewCountries: SupportedCountryCode[];
  pending: boolean;
  onApply: (countries: SupportedCountryCode[]) => void | Promise<void>;
};

export function PreviewMarketsModal({
  open,
  onOpenChange,
  term,
  previewCountries,
  pending,
  onApply,
}: PreviewMarketsModalProps) {
  const t = useTranslations("keywordTracker.previewMarkets");
  const locale = useLocale();
  const [draftCountries, setDraftCountries] = useState<SupportedCountryCode[]>(previewCountries);

  useEffect(() => {
    if (!open) return;
    setDraftCountries(previewCountries);
  }, [open, previewCountries]);

  const newCountryCount = useMemo(() => {
    const existing = new Set(previewCountries);
    return draftCountries.filter((c) => !existing.has(c)).length;
  }, [draftCountries, previewCountries]);

  const hasChanges = useMemo(() => {
    const a = [...previewCountries].sort().join(",");
    const b = [...draftCountries].sort().join(",");
    return a !== b;
  }, [previewCountries, draftCountries]);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className={cn(
          "max-w-lg border-white/[0.08] bg-[#0a0e14] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)] sm:rounded-2xl",
        )}
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-zinc-500 hover:text-white"
        closeButtonSrText={t("cancel")}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-2 text-start">
          <DialogTitle className="text-xl font-semibold text-white">{t("title")}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-zinc-400">
            {t("description", { term: term.trim() || "—" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-zinc-500">{t("preserveHint")}</p>
          <CountrySelector
            value={draftCountries}
            onChange={setDraftCountries}
            disabled={pending}
          />
          {newCountryCount > 0 ? (
            <p className="text-xs text-amber-200/90">
              {t("creditsForNew", {
                count: newCountryCount,
                per: AI_CREDIT_COSTS.serper_preview_per_country,
              })}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">{t("noNewCredits")}</p>
          )}
        </div>

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
            disabled={pending || draftCountries.length === 0 || !hasChanges}
            onClick={() => void onApply(draftCountries)}
          >
            {pending ? (
              <>
                <Loader2 className="me-2 size-4 shrink-0 animate-spin" aria-hidden />
                {t("applying")}
              </>
            ) : (
              t("apply")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
