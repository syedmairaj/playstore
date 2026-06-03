"use client";

import { useTranslations } from "next-intl";
import { LocalizedMarketOptionsMenu } from "@/components/optimizer/LocalizedMarketOptionsMenu";
import {
  LOCALIZE_MARKETS,
  MARKET_META,
  type LocalizeMarketCode,
  type LocalizedMarketRecord,
} from "@/lib/listing/localized-markets";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export type { LocalizedMarketRecord, LocalizeMarketCode };

export type LocalizedFieldKey =
  | "title"
  | "shortDescription"
  | "longDescription"
  | "keywords";

type LocalizedResultsProps = {
  markets: LocalizedMarketRecord[];
  activeMarket: LocalizeMarketCode;
  onActiveMarketChange: (market: LocalizeMarketCode) => void;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  marketActionBusy?: boolean;
  /** Active market undergoing single-market re-generation (shows card spinner). */
  regeneratingMarket?: LocalizeMarketCode | null;
  onRegenerateMarket: (market: LocalizeMarketCode) => void;
  onExportMarket: (market: LocalizeMarketCode) => void;
  onDeleteMarket: (market: LocalizeMarketCode) => void;
  /** Notifies parent (phone preview) when the visible field tab changes. */
  onActiveFieldChange?: (field: LocalizedFieldKey) => void;
};

function tabLabelKey(market: LocalizeMarketCode): "tabPillAe" | "tabPillIn" | "tabPillMx" {
  if (market === "ae") return "tabPillAe";
  if (market === "in") return "tabPillIn";
  return "tabPillMx";
}

function fieldPillKey(
  field: LocalizedFieldKey,
): "fieldPillTitle" | "fieldPillShort" | "fieldPillLong" | "fieldPillKeywords" {
  if (field === "title") return "fieldPillTitle";
  if (field === "shortDescription") return "fieldPillShort";
  if (field === "longDescription") return "fieldPillLong";
  return "fieldPillKeywords";
}

export function LocalizedResults({
  markets,
  activeMarket,
  onActiveMarketChange,
  copiedKey,
  onCopy,
  marketActionBusy = false,
  regeneratingMarket = null,
  onRegenerateMarket,
  onExportMarket,
  onDeleteMarket,
  onActiveFieldChange,
}: LocalizedResultsProps) {
  const t = useTranslations("optimizer.results.localize");
  const tResults = useTranslations("optimizer.results");
  const [activeField, setActiveField] = useState<LocalizedFieldKey>("title");

  const active = markets.find((m) => m.market === activeMarket) ?? markets[0] ?? null;

  useEffect(() => {
    if (!active?.longDescription && activeField === "longDescription") {
      setActiveField("title");
    }
  }, [active?.longDescription, activeField]);

  useEffect(() => {
    onActiveFieldChange?.(activeField);
  }, [activeField, onActiveFieldChange]);

  if (!active || markets.length === 0) return null;

  const isRegeneratingActive =
    Boolean(regeneratingMarket) && regeneratingMarket === active.market;

  const orderedMarkets = LOCALIZE_MARKETS.filter((code) =>
    markets.some((m) => m.market === code),
  );

  const fieldOptions: LocalizedFieldKey[] = active.longDescription
    ? ["title", "shortDescription", "longDescription", "keywords"]
    : ["title", "shortDescription", "keywords"];

  const copyKey = `${active.market}-${activeField}`;
  const copyHandlers: Record<LocalizedFieldKey, { text: string; label: string }> = {
    title: { text: active.title, label: t("resultCopyTitle") },
    shortDescription: {
      text: active.shortDescription,
      label: t("resultCopyShort"),
    },
    longDescription: {
      text: active.longDescription,
      label: t("resultCopyLong"),
    },
    keywords: {
      text: active.keywords.join(", "),
      label: t("resultCopyKeywords"),
    },
  };

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">{t("resultTitle")}</h3>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("resultTabsAria")}>
        {orderedMarkets.map((code) => {
          const isActive = code === activeMarket;
          return (
            <button
              key={code}
              type="button"
              role="tab"
              id={`localized-tab-${code}`}
              aria-selected={isActive}
              aria-controls={`localized-panel-${code}`}
              onClick={() => onActiveMarketChange(code)}
              disabled={marketActionBusy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
                isActive
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/30"
                  : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200",
              )}
            >
              {t(tabLabelKey(code))}
            </button>
          );
        })}
      </div>

      <div
        dir={active.rtl ? "rtl" : "ltr"}
        className={cn(
          "relative rounded-xl border border-white/[0.07] bg-[#080c12] p-4",
          active.rtl && "font-arabic",
          isRegeneratingActive && "pointer-events-none",
        )}
        role="tabpanel"
        id={`localized-panel-${active.market}`}
        aria-labelledby={`localized-tab-${active.market}`}
        aria-busy={isRegeneratingActive}
      >
        {isRegeneratingActive ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#080c12]/85 backdrop-blur-[1px]">
            <svg className="size-6 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-xs font-medium text-emerald-200/90">{t("resultRegenerating")}</p>
          </div>
        ) : null}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-base" aria-hidden>
              {MARKET_META[active.market].flag}
            </span>
            <span className="font-semibold text-white/90">{active.label}</span>
            {active.rtl ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/20">
                RTL
              </span>
            ) : null}
          </div>
          <LocalizedMarketOptionsMenu
            market={active.market}
            busy={marketActionBusy}
            onRegenerate={onRegenerateMarket}
            onExport={onExportMarket}
            onDelete={onDeleteMarket}
          />
        </div>

        <div
          className="mb-4 flex flex-wrap gap-1.5"
          role="tablist"
          aria-label={t("fieldTabsAria")}
        >
          {fieldOptions.map((field) => {
            const selected = activeField === field;
            return (
              <button
                key={field}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveField(field)}
                disabled={marketActionBusy}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold transition-all",
                  selected
                    ? "border-sky-500/45 bg-sky-500/12 text-sky-100 ring-1 ring-sky-500/25"
                    : "border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:border-white/[0.14] hover:text-zinc-300",
                )}
              >
                {t(fieldPillKey(field))}
              </button>
            );
          })}
        </div>

        {activeField === "title" ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {tResults("titleBlock")}
              </span>
              <button
                type="button"
                onClick={() => onCopy(copyHandlers.title.text, copyKey)}
                className="text-[11px] text-emerald-400/80 hover:text-emerald-300"
              >
                {copiedKey === copyKey ? t("resultCopied") : copyHandlers.title.label}
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-100">{active.title}</p>
            <p className="mt-0.5 text-[10px] text-zinc-600">{active.title.length} / 30</p>
          </div>
        ) : null}

        {activeField === "shortDescription" ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {tResults("shortBlock")}
              </span>
              <button
                type="button"
                onClick={() => onCopy(copyHandlers.shortDescription.text, copyKey)}
                className="text-[11px] text-emerald-400/80 hover:text-emerald-300"
              >
                {copiedKey === copyKey ? t("resultCopied") : copyHandlers.shortDescription.label}
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-300">{active.shortDescription}</p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              {active.shortDescription.length} / 80
            </p>
          </div>
        ) : null}

        {activeField === "longDescription" && active.longDescription ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {tResults("longBlock")}
              </span>
              <button
                type="button"
                onClick={() => onCopy(copyHandlers.longDescription.text, copyKey)}
                className="text-[11px] text-emerald-400/80 hover:text-emerald-300"
              >
                {copiedKey === copyKey ? t("resultCopied") : copyHandlers.longDescription.label}
              </button>
            </div>
            <p className="mt-1 max-h-40 overflow-y-auto text-sm leading-relaxed text-zinc-300 [scrollbar-width:thin]">
              {active.longDescription}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              {active.longDescription.length} / 4000
            </p>
          </div>
        ) : null}

        {activeField === "keywords" ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t("keywordsLabel")}
              </span>
              <button
                type="button"
                onClick={() => onCopy(copyHandlers.keywords.text, copyKey)}
                className="text-[11px] text-emerald-400/80 hover:text-emerald-300"
              >
                {copiedKey === copyKey ? t("resultCopied") : copyHandlers.keywords.label}
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {active.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
