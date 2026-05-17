"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { CompetitorSpyOpenPlayButton } from "@/components/competitor-spy/competitor-spy-open-play-button";
import {
  type SupportedCountryCode,
  isSupportedCountry,
} from "@/lib/countries";
import {
  LIVE_RANKS_PREVIEW_UNAVAILABLE,
} from "@/lib/keywords/live-ranks-preview-tokens";
import { extractPackageIdFromPlayStoreDetailsUrl } from "@/lib/keywords/play-store-details-url";
import { serperPreviewRowMatchesWorkspacePackage } from "@/lib/keywords/serper-snapshot-rank-resolve";
import type { SerperPreviewCountry, SerperPreviewItem } from "@/lib/keywords/serper-preview-types";
import { cn } from "@/lib/utils";

/** Shape mirrors the public response from `POST /api/serper/play-store-search`. */
export type { SerperPreviewCountry, SerperPreviewItem };

export type SerperPreviewResultsProps = {
  results: SerperPreviewCountry[];
  className?: string;
  /** Workspace app package (raw); matched with the same rules as saved rank snapshots. */
  packageName?: string | null;
  /** Optional display name for contextual copy (reserved for future use). */
  appDisplayName?: string | null;
  /**
   * `serp`: row link uses Serper `item.link`.
   * `canonical`: Competitor Spy — open `playStoreAppDetailsUrl` from package id (with i18n + loading UX).
   */
  playStoreLinks?: "serp" | "canonical";
  isRtl?: boolean;
};

function chunkOk(country: string): country is SupportedCountryCode {
  return isSupportedCountry(country);
}

function mapPreviewCountryError(raw: string, translate: (key: string) => string): string {
  if (raw === LIVE_RANKS_PREVIEW_UNAVAILABLE) return translate("liveRanksUnavailable");
  if (raw === "timeout" || raw === "fetch_failed") return translate("liveRanksUnavailable");
  if (raw.startsWith("Serper ")) return translate("liveRanksUnavailable");
  return raw;
}

const PREVIEW_LIST_LIMIT = 20;

export function SerperPreviewResults({
  results,
  className,
  packageName,
  appDisplayName,
  playStoreLinks = "serp",
  isRtl,
}: SerperPreviewResultsProps) {
  const t = useTranslations("serperPreview");
  const tCountries = useTranslations("countrySelector");

  const trackPackage = Boolean(packageName?.trim());
  const namedApp = appDisplayName?.trim() ?? "";

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
          <p className="max-w-2xl text-xs leading-relaxed text-zinc-500" role="note">
            {t("googleRankDirectionalNote")}
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

              {code === "cn" ? (
                <p className="text-[11px] leading-relaxed text-amber-200/85" role="note">
                  {t("chinaDisclaimer")}
                </p>
              ) : null}

              {country.error ? (
                <p
                  className="rounded-xl border border-rose-500/35 bg-rose-500/[0.14] px-4 py-3 text-sm leading-relaxed text-rose-50/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-rose-400/15"
                  role="alert"
                >
                  {t("errorPerCountry", {
                    country: countryLabel,
                    message: mapPreviewCountryError(country.error, t),
                  })}
                </p>
              ) : country.items.length === 0 ? (
                <p className="rounded-xl border border-white/[0.06] bg-[#070a0f] px-4 py-3 text-sm text-zinc-500">
                  {t("noResults")}
                </p>
              ) : (
                <>
                  <ol className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.08] bg-[#070a0f]/90">
                    {country.items.slice(0, PREVIEW_LIST_LIMIT).map((item) => {
                      const isYourApp =
                        trackPackage && serperPreviewRowMatchesWorkspacePackage(packageName, item);
                      const resolvedPackageId =
                        item.packageId?.trim() ||
                        extractPackageIdFromPlayStoreDetailsUrl(item.link);
                      return (
                        <li
                          key={`${code}-${item.position}-${item.link}`}
                          className={cn(
                            "flex gap-4 px-4 py-3.5 sm:px-5 sm:py-4",
                            isYourApp &&
                              "bg-emerald-500/[0.07] ring-1 ring-inset ring-emerald-500/25",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-bold tabular-nums shadow-sm",
                              isYourApp
                                ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-50 ring-1 ring-emerald-400/30"
                                : "border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-200 ring-1 ring-emerald-400/15",
                            )}
                            title={t("rankLabel")}
                          >
                            {item.position}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[15px] font-semibold leading-snug text-zinc-50">
                                {item.title}
                              </p>
                              {isYourApp ? (
                                <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                                  {t("yourAppPositionBadge")}
                                </span>
                              ) : null}
                            </div>
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
                          {playStoreLinks === "canonical" ? (
                            <CompetitorSpyOpenPlayButton
                              packageId={resolvedPackageId}
                              isRtl={isRtl}
                              size="sm"
                              variant="outline"
                              className="h-9 shrink-0 self-start rounded-lg border-white/[0.1] bg-white/[0.03] px-2.5 text-xs font-medium text-zinc-200 hover:border-emerald-400/35 hover:bg-emerald-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                            />
                          ) : (
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
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {trackPackage &&
                  !country.items.some((it) =>
                    serperPreviewRowMatchesWorkspacePackage(packageName, it),
                  ) ? (
                    <div
                      className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-3 text-xs leading-relaxed text-amber-50/95 sm:text-[13px]"
                      role="note"
                    >
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0 text-amber-400/90"
                        aria-hidden
                      />
                      <p>
                        {namedApp
                          ? t("appOutsideTopPreviewFooterWithApp", { appName: namedApp })
                          : t("appOutsideTopPreviewFooter")}
                      </p>
                    </div>
                  ) : null}
                </>
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
