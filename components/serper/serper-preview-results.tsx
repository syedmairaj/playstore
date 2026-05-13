"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type SupportedCountryCode,
  isSupportedCountry,
} from "@/lib/countries";
import { cn } from "@/lib/utils";

/** Shape mirrors the public response from `POST /api/serper/play-store-search`. */
export type SerperPreviewItem = {
  title: string;
  link: string;
  packageId: string | null;
  position: number;
  snippet: string | null;
};

export type SerperPreviewCountry = {
  country: string;
  gl: string;
  hl: string;
  items: SerperPreviewItem[];
  error: string | null;
};

export type SerperPreviewResultsProps = {
  results: SerperPreviewCountry[];
  className?: string;
};

function chunkOk(country: string): country is SupportedCountryCode {
  return isSupportedCountry(country);
}

export function SerperPreviewResults({
  results,
  className,
}: SerperPreviewResultsProps) {
  const t = useTranslations("serperPreview");
  const tCountries = useTranslations("countrySelector");

  if (!results.length) return null;

  return (
    <section
      className={cn(
        "mt-6 space-y-6 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#0c121a] to-[#080c12] p-5 sm:p-6",
        className,
      )}
      aria-labelledby="serper-preview-heading"
    >
      <header className="space-y-2 border-b border-white/[0.06] pb-5">
        <div className="flex flex-wrap gap-2" aria-label={t("marketsLabel")}>
          {results.map((c) => {
            const code = c.country;
            const labelKey = chunkOk(code) ? (`countries.${code}.label` as const) : null;
            const flagKey = chunkOk(code) ? (`countries.${code}.flag` as const) : null;
            const countryLabel = labelKey ? tCountries(labelKey) : code.toUpperCase();
            const flag = flagKey ? tCountries(flagKey) : null;
            return (
              <span
                key={`flag-${code}`}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-100 ring-1 ring-emerald-500/10"
                title={countryLabel}
              >
                <span className="text-base leading-none" aria-hidden>
                  {flag}
                </span>
                <span className="tabular-nums tracking-wide text-zinc-300">
                  {code.toUpperCase()}
                </span>
              </span>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <h3
            id="serper-preview-heading"
            className="text-lg font-semibold tracking-tight text-white"
          >
            {t("resultsHeading")}
          </h3>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            {t("resultsSubtitle")}
          </p>
        </div>
      </header>

      <ul className="space-y-6">
        {results.map((country) => {
          const code = country.country;
          const labelKey = chunkOk(code) ? (`countries.${code}.label` as const) : null;
          const flagKey = chunkOk(code) ? (`countries.${code}.flag` as const) : null;
          const countryLabel = labelKey ? tCountries(labelKey) : code.toUpperCase();
          const flag = flagKey ? tCountries(flagKey) : null;

          return (
            <li key={code} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-white/[0.04] pb-2">
                <span aria-hidden className="text-lg leading-none">
                  {flag}
                </span>
                <span className="text-sm font-semibold text-white">{countryLabel}</span>
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {code}
                </span>
                <span className="ms-auto rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                  {country.gl} · {country.hl}
                </span>
              </div>

              {country.error ? (
                <p
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm leading-relaxed text-rose-100/90"
                  role="alert"
                >
                  {t("errorPerCountry", {
                    country: countryLabel,
                    message: country.error,
                  })}
                </p>
              ) : country.items.length === 0 ? (
                <p className="rounded-xl border border-white/[0.06] bg-[#070a0f] px-4 py-3 text-sm text-zinc-500">
                  {t("noResults")}
                </p>
              ) : (
                <ol className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.08] bg-[#070a0f]/90">
                  {country.items.slice(0, 10).map((item) => (
                    <li
                      key={`${code}-${item.position}-${item.link}`}
                      className="flex gap-4 px-4 py-3.5 sm:px-5 sm:py-4"
                    >
                      <span
                        className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/35 bg-emerald-500/[0.12] text-sm font-bold tabular-nums text-emerald-200 shadow-sm ring-1 ring-emerald-400/15"
                        title={t("rankLabel")}
                      >
                        {item.position}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-[15px] font-semibold leading-snug text-zinc-50">
                          {item.title}
                        </p>
                        {item.packageId ? (
                          <p className="truncate font-mono text-xs text-zinc-500">
                            {item.packageId}
                          </p>
                        ) : null}
                        {item.snippet ? (
                          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-400">
                            {item.snippet}
                          </p>
                        ) : null}
                      </div>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t("openInPlay")}
                        aria-label={t("openInPlay")}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-white/[0.1] bg-white/[0.03] px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                      >
                        <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                        <span>{t("openInPlay")}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      <p
        className="rounded-xl border border-white/[0.06] bg-[#060910] px-4 py-3 text-xs leading-relaxed text-zinc-500 sm:text-[13px]"
        role="note"
      >
        {t("disclaimer")}
      </p>
    </section>
  );
}
