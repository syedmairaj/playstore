"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  SERPER_MAX_COUNTRIES,
  SUPPORTED_COUNTRY_CODES,
  type SupportedCountryCode,
  isSupportedCountry,
} from "@/lib/countries";
import { cn } from "@/lib/utils";

export type CountrySelectorProps = {
  /** Current 1–N selected ISO-3166 alpha-2 codes (lowercase). */
  value: string[];
  onChange: (next: SupportedCountryCode[]) => void;
  /** Max selectable; defaults to {@link SERPER_MAX_COUNTRIES}. */
  max?: number;
  disabled?: boolean;
  /** Optional id for label association. */
  id?: string;
  /** Optional className for the chip row container. */
  className?: string;
};

/**
 * Compact multi-select chip picker for Serper.dev country fan-out.
 *
 * - Shows currently-selected countries as removable chips (flag + localized name).
 * - Enforces 1–`max` selection (default from `SERPER_MAX_COUNTRIES`) — never lets the caller drop to zero.
 * - Adding via the "+" menu only lists countries not already selected.
 * - Accessible: button-driven menu, ESC closes, ARIA labels for SR users.
 * - RTL-safe via Tailwind logical properties (`ms-*` / `me-*` / `text-start`).
 *
 * The actual i18n labels live under `countrySelector.countries.<code>.label`
 * in `messages/{en,ar}.json`.
 */
export function CountrySelector({
  value,
  onChange,
  max = SERPER_MAX_COUNTRIES,
  disabled = false,
  id,
  className,
}: CountrySelectorProps) {
  const t = useTranslations("countrySelector");
  const generatedId = useId();
  const containerId = id ?? `country-selector-${generatedId}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const normalizedValue = useMemo<SupportedCountryCode[]>(() => {
    const seen = new Set<SupportedCountryCode>();
    const out: SupportedCountryCode[] = [];
    for (const raw of value) {
      const c = String(raw ?? "").trim().toLowerCase();
      if (!isSupportedCountry(c)) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      if (out.length >= max) break;
    }
    return out;
  }, [value, max]);

  const remaining = useMemo(
    () => SUPPORTED_COUNTRY_CODES.filter((c) => !normalizedValue.includes(c)),
    [normalizedValue],
  );

  const limitReached = normalizedValue.length >= max;
  const minReached = normalizedValue.length <= 1;

  const labelFor = useCallback(
    (code: SupportedCountryCode) =>
      t(`countries.${code}.label` as `countries.${SupportedCountryCode}.label`),
    [t],
  );

  const flagFor = useCallback(
    (code: SupportedCountryCode) =>
      t(`countries.${code}.flag` as `countries.${SupportedCountryCode}.flag`),
    [t],
  );

  function removeCountry(code: SupportedCountryCode) {
    if (disabled || minReached) return;
    const next = normalizedValue.filter((c) => c !== code);
    onChange(next);
  }

  function addCountry(code: SupportedCountryCode) {
    if (disabled || limitReached) return;
    if (normalizedValue.includes(code)) return;
    const next: SupportedCountryCode[] = [...normalizedValue, code];
    onChange(next);
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  function onContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!menuRef.current) return;
    if (e.relatedTarget && menuRef.current.contains(e.relatedTarget as Node)) return;
    setMenuOpen(false);
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      id={containerId}
      onBlur={onContainerBlur}
    >
      <p className="text-xs font-medium text-zinc-400">{t("label")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ul
          className="contents"
          aria-label={t("selectedSrLabel")}
        >
          {normalizedValue.map((code) => {
            const label = labelFor(code);
            return (
              <li key={code} className="contents">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 ps-2.5 pe-1 py-1 text-xs font-medium text-emerald-100",
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {flagFor(code)}
                  </span>
                  <span className="font-semibold tracking-tight">
                    {code.toUpperCase()}
                  </span>
                  <span className="text-emerald-100/85">{label}</span>
                  <button
                    type="button"
                    disabled={disabled || minReached}
                    aria-label={t("removeAria", { country: label })}
                    onClick={() => removeCountry(code)}
                    className="ms-1 inline-flex size-5 items-center justify-center rounded-full text-emerald-100/80 transition-colors hover:bg-emerald-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        {remaining.length > 0 && !limitReached ? (
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              disabled={disabled || limitReached}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-label={t("addCountryAria")}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-white/20 bg-transparent px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-emerald-400/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3" aria-hidden />
              <span>{t("addCountryAria")}</span>
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                role="listbox"
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setMenuOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
                className="absolute z-20 mt-2 min-w-[14rem] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0c1018] py-1 text-sm shadow-2xl ring-1 ring-emerald-500/15"
                style={{ insetInlineStart: 0 }}
              >
                {remaining.map((code) => (
                  <button
                    key={code}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => addCountry(code)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-start text-zinc-200 transition-colors hover:bg-emerald-500/10 hover:text-white"
                  >
                    <span aria-hidden className="text-lg leading-none">
                      {flagFor(code)}
                    </span>
                    <span className="font-semibold tracking-tight">
                      {code.toUpperCase()}
                    </span>
                    <span className="text-zinc-400">{labelFor(code)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {limitReached ? (
          <span
            className="text-[11px] text-zinc-500"
            aria-label={t("limitReachedAria")}
          >
            {t("maxNote")}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">{t("helper")}</p>
    </div>
  );
}
