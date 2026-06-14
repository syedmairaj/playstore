"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { SerperPreviewCountry } from "@/components/serper/serper-preview-results";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COUNTRY_FLAG_EMOJI, isSupportedCountry, type SupportedCountryCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

export type SaveKeywordModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: string;
  results: SerperPreviewCountry[];
  pending: boolean;
  onSave: (countries: SupportedCountryCode[]) => void | Promise<void>;
};

export function previewCountryCodes(results: SerperPreviewCountry[]): SupportedCountryCode[] {
  const out: SupportedCountryCode[] = [];
  const seen = new Set<string>();
  for (const block of results) {
    const raw = String(block.country ?? "").trim().toLowerCase();
    if (!isSupportedCountry(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

export function SaveKeywordModal({
  open,
  onOpenChange,
  term,
  results,
  pending,
  onSave,
}: SaveKeywordModalProps) {
  const t = useTranslations("keywordTracker.saveModal");
  const tCountrySel = useTranslations("countrySelector");
  const locale = useLocale();
  const codes = useMemo(() => previewCountryCodes(results), [results]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const c of codes) next[c] = true;
    setChecked(next);
  }, [open, codes]);

  const orderedSelected = useMemo(() => {
    return codes.filter((c) => checked[c]);
  }, [codes, checked]);

  const checkedCount = orderedSelected.length;

  const toggle = (code: SupportedCountryCode) => {
    setChecked((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const countryLabel = (code: SupportedCountryCode) => tCountrySel(`countries.${code}.label`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md border-white/[0.08] bg-[#0a0e14] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)] sm:rounded-2xl",
        )}
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-zinc-500 hover:text-white"
        closeButtonSrText={t("close")}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-2 text-start">
          <DialogTitle className="text-xl font-semibold text-white">{t("title")}</DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            {t("description", { term: term.trim() || "—" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("marketsLabel")}</p>
          <ul className="max-h-[220px] space-y-2 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#060910] p-3">
            {codes.map((code) => (
              <li key={code}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-white/20 bg-[#070a0f] text-emerald-500 focus:ring-emerald-500/40"
                    checked={Boolean(checked[code])}
                    onChange={() => toggle(code)}
                  />
                  <span className="text-base leading-none" aria-hidden>
                    {COUNTRY_FLAG_EMOJI[code]}
                  </span>
                  <span className="text-sm text-zinc-200">{countryLabel(code)}</span>
                </label>
              </li>
            ))}
          </ul>
          {codes.length === 0 ? (
            <p className="text-sm text-amber-200/90">{t("noCountries")}</p>
          ) : null}
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
            disabled={pending || checkedCount === 0 || codes.length === 0}
            onClick={() => void onSave(orderedSelected)}
          >
            {pending ? (
              <>
                <Loader2 className="me-2 size-4 shrink-0 animate-spin" aria-hidden />
                {t("saving")}
              </>
            ) : (
              t("saveWithCount", { count: checkedCount })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
