"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { KeywordSignal } from "@/lib/staging/keyword-signals";
import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import { Layers, Sparkles } from "lucide-react";

type AsoSandboxPanelProps = {
  title: string;
  shortDescription: string;
  longDescription: string;
  keywordSignals: KeywordSignal[];
  isRtl?: boolean;
  loading?: boolean;
};

const ASSET_FIELDS: ListingAssetTarget[] = [
  "title",
  "short_description",
  "full_description",
  "keywords",
];

function draftForAsset(
  asset: ListingAssetTarget,
  title: string,
  shortDescription: string,
  longDescription: string,
): string {
  switch (asset) {
    case "title":
      return title;
    case "short_description":
      return shortDescription;
    case "full_description":
      return longDescription;
    case "keywords":
      return "";
    default:
      return "";
  }
}

export function AsoSandboxPanel({
  title,
  shortDescription,
  longDescription,
  keywordSignals,
  isRtl = false,
  loading = false,
}: AsoSandboxPanelProps) {
  const t = useTranslations("optimizer.asoSandbox");

  const stagedByAsset = useMemo(() => {
    const map = new Map<ListingAssetTarget, KeywordSignal[]>();
    for (const signal of keywordSignals) {
      const asset = signal.targetAsset;
      if (!asset) continue;
      const list = map.get(asset) ?? [];
      list.push(signal);
      map.set(asset, list);
    }
    return map;
  }, [keywordSignals]);

  const hasStaged = keywordSignals.some((s) => s.targetAsset);

  if (!hasStaged && !loading) {
    return null;
  }

  return (
    <aside
      className="rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-950/20 to-transparent p-4 sm:p-5"
      aria-label={t("title")}
    >
      <div className={cn("mb-4 flex items-start gap-3", isRtl && "flex-row-reverse text-end")}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
          <Layers className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90">{t("title")}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-white/45">{t("subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-white/40">{t("loading")}</p>
      ) : (
        <div className="space-y-3">
          {ASSET_FIELDS.map((asset) => {
            const staged = stagedByAsset.get(asset) ?? [];
            if (staged.length === 0) return null;
            const currentDraft = draftForAsset(asset, title, shortDescription, longDescription);
            return (
              <div
                key={asset}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
              >
                <div
                  className={cn(
                    "mb-2 flex flex-wrap items-center gap-2",
                    isRtl && "flex-row-reverse",
                  )}
                >
                  <span className="text-xs font-medium text-white/75">
                    {t(`assets.${asset}`)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                    <Sparkles className="size-3" aria-hidden />
                    {t("stagedBadge")}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
                      {t("currentDraft")}
                    </p>
                    <p
                      className={cn(
                        "min-h-[2.5rem] rounded-md border border-white/[0.05] bg-black/20 px-2.5 py-2 text-xs leading-relaxed text-white/70",
                        isRtl && "font-arabic text-end",
                      )}
                    >
                      {currentDraft.trim() || t("emptyDraft")}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
                      {t("stagedKeywords")}
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {staged.map((s) => (
                        <li
                          key={s.keyword}
                          className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200"
                        >
                          {s.keyword}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
