"use client";

import { useEffect, useState } from "react";
import {
  AlignLeft,
  BarChart3,
  Check,
  FileText,
  FolderInput,
  Info,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { DiscoveryKeywordSuggestion } from "@/lib/keywords/discovery-ai-suggestions";
import type { ListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";
import { cn } from "@/lib/utils";

const GLASS_MENU_CLASS =
  "z-[80] border border-white/[0.1] bg-zinc-950/80 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-xl";

const STAGE_ACTIONS: {
  asset: ListingAssetTarget;
  Icon: typeof Type;
  pillClass: string;
  iconClass: string;
  activeClass: string;
}[] = [
  {
    asset: "title",
    Icon: Type,
    pillClass:
      "border-sky-500/20 bg-sky-500/[0.08] text-sky-300/90 hover:border-sky-400/35 hover:bg-sky-500/15 hover:text-sky-200",
    iconClass: "text-sky-400/90",
    activeClass: "border-sky-400/40 bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/25",
  },
  {
    asset: "short_description",
    Icon: AlignLeft,
    pillClass:
      "border-violet-500/20 bg-violet-500/[0.08] text-violet-300/90 hover:border-violet-400/35 hover:bg-violet-500/15 hover:text-violet-200",
    iconClass: "text-violet-400/90",
    activeClass:
      "border-violet-400/40 bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/25",
  },
  {
    asset: "full_description",
    Icon: FileText,
    pillClass:
      "border-amber-500/20 bg-amber-500/[0.08] text-amber-300/90 hover:border-amber-400/35 hover:bg-amber-500/15 hover:text-amber-200",
    iconClass: "text-amber-400/90",
    activeClass:
      "border-amber-400/40 bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/25",
  },
];

const CATEGORY_BADGE: Record<string, { className: string }> = {
  brand: {
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-300/95 shadow-[0_0_12px_-6px_rgba(52,211,153,0.35)]",
  },
  opportunity: {
    className:
      "border-teal-500/25 bg-teal-500/10 text-teal-300/95 shadow-[0_0_12px_-6px_rgba(45,212,191,0.35)]",
  },
  competitive: {
    className:
      "border-sky-500/25 bg-sky-500/10 text-sky-300/95 shadow-[0_0_12px_-6px_rgba(56,189,248,0.35)]",
  },
  intent: {
    className:
      "border-violet-500/25 bg-violet-500/10 text-violet-300/95 shadow-[0_0_12px_-6px_rgba(167,139,250,0.35)]",
  },
  gap: {
    className:
      "border-amber-500/25 bg-amber-500/10 text-amber-300/95 shadow-[0_0_12px_-6px_rgba(251,191,36,0.35)]",
  },
};

const CELL = "px-4 py-3.5 align-middle";

export type AiSuggestedKeywordRowProps = {
  suggestion: DiscoveryKeywordSuggestion;
  rowIndex?: number;
  isTracked: boolean;
  stagedAsset: ListingAssetTarget | null;
  isRtl?: boolean;
  busy?: boolean;
  staging?: boolean;
  tracking?: boolean;
  disabled?: boolean;
  onStage: (asset: ListingAssetTarget) => void;
  onTrack: () => void;
  onIgnore: () => void;
  onViewSearchVolumeHistory?: () => void;
};

function StatusBadge({
  isTracked,
  stagedAsset,
  staging,
  tracking,
  t,
}: {
  isTracked: boolean;
  stagedAsset: ListingAssetTarget | null;
  staging: boolean;
  tracking: boolean;
  t: ReturnType<typeof useTranslations<"keywordTracker.aiSuggestedKeywords">>;
}) {
  if (isTracked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
        <span
          className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
          aria-hidden
        />
        {t("tracked")}
      </span>
    );
  }

  if (staging) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-400">
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
        {t("staging")}
      </span>
    );
  }

  if (tracking) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-400">
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
        {t("tracking")}
      </span>
    );
  }

  if (stagedAsset) {
    return (
      <span className="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200/90">
        {t("stagedBadge", { asset: t(`assets.${stagedAsset}`) })}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-zinc-500">
      {t("gridStatusIdle")}
    </span>
  );
}

export function AiSuggestedKeywordRow({
  suggestion,
  rowIndex = 0,
  isTracked,
  stagedAsset,
  isRtl = false,
  busy = false,
  staging = false,
  tracking = false,
  disabled = false,
  onStage,
  onTrack,
  onIgnore,
  onViewSearchVolumeHistory,
}: AiSuggestedKeywordRowProps) {
  const t = useTranslations("keywordTracker.aiSuggestedKeywords");
  const keyword = suggestion.keyword;
  const category = suggestion.category;
  const reasonText = t(`reasons.${suggestion.reasonKey}` as "reasons.brandFeature", suggestion.reasonParams ?? {});
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<ListingAssetTarget | null>(null);
  const [successAsset, setSuccessAsset] = useState<ListingAssetTarget | null>(null);

  const stageDisabled = disabled || busy || staging || stagedAsset != null;
  const watchlistDisabled = disabled || busy || tracking || isTracked;

  useEffect(() => {
    if (staging || !pendingAsset) return;
    if (stagedAsset === pendingAsset) {
      setSuccessAsset(pendingAsset);
      setPendingAsset(null);
      const timer = window.setTimeout(() => setSuccessAsset(null), 800);
      return () => window.clearTimeout(timer);
    }
  }, [staging, stagedAsset, pendingAsset]);

  const handleStageClick = (asset: ListingAssetTarget) => {
    if (stageDisabled) return;
    setPendingAsset(asset);
    setSuccessAsset(null);
    onStage(asset);
  };

  const rowAccent =
    isTracked
      ? isRtl
        ? "border-e-2 border-e-emerald-500/50"
        : "border-s-2 border-s-emerald-500/50"
      : stagedAsset
        ? isRtl
          ? "border-e-2 border-e-violet-500/35"
          : "border-s-2 border-s-violet-500/35"
        : "";

  const utilityBtn =
    "size-8 rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.07] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-white/15";

  return (
    <tr
      className={cn(
        "group relative transition-all duration-200 ease-out",
        rowIndex % 2 === 1 && !isTracked && "bg-white/[0.012]",
        "hover:bg-white/[0.04]",
        menuOpen && "z-10 bg-white/[0.05]",
        isTracked && "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.06]",
        rowAccent,
      )}
    >
      <td className={cn(CELL, isRtl ? "text-right" : "text-left")}>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            isRtl && "flex-row-reverse justify-end",
          )}
        >
          <span className="block truncate text-sm font-semibold tracking-tight text-zinc-50 transition-colors group-hover:text-white">
            {keyword}
          </span>
          <Tooltip
            asChild
            side="top"
            content={
              <span className="max-w-[220px] text-xs leading-relaxed text-zinc-200">
                {reasonText}
              </span>
            }
          >
            <button
              type="button"
              className="shrink-0 rounded-md p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
              aria-label={t("whySuggestedAria")}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        </div>
      </td>

      <td className={cn(CELL, isRtl ? "text-right" : "text-left")}>
        {category !== "general" && CATEGORY_BADGE[category] ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide",
              !isRtl && "uppercase",
              CATEGORY_BADGE[category].className,
            )}
          >
            {t(`categories.${category}` as "categories.brand")}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-600">—</span>
        )}
      </td>

      <td className={cn(CELL, isRtl ? "text-right" : "text-left")}>
        <StatusBadge
          isTracked={isTracked}
          stagedAsset={stagedAsset}
          staging={staging}
          tracking={tracking}
          t={t}
        />
      </td>

      <td className={CELL}>
        <div
          className={cn(
            "flex items-center justify-end gap-2",
            isRtl && "flex-row-reverse",
          )}
        >
          <Tooltip
            asChild
            side="top"
            content={
              <span className="max-w-[220px] text-xs leading-relaxed text-zinc-200">
                {isTracked ? t("onWatchlistHint") : t("addToWatchlistHint")}
              </span>
            }
          >
            <button
              type="button"
              disabled={watchlistDisabled}
              aria-label={t("addToWatchlistAria")}
              onClick={onTrack}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all duration-200",
                isTracked
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                  : "border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {tracking ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : isTracked ? (
                <Check className="size-3.5 stroke-[2.5]" aria-hidden />
              ) : (
                <ListPlus className="size-3.5" aria-hidden />
              )}
              {tracking
                ? t("addingToWatchlist")
                : isTracked
                  ? t("onWatchlist")
                  : t("addToWatchlist")}
            </button>
          </Tooltip>

          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1",
              isRtl && "flex-row-reverse",
            )}
            role="group"
            aria-label={t("stageClusterAria")}
          >
            {STAGE_ACTIONS.map(({ asset, Icon, pillClass, iconClass, activeClass }) => {
              const isPending = staging && pendingAsset === asset;
              const isSuccess =
                successAsset === asset ||
                (stagedAsset === asset && !staging && !pendingAsset);
              const isActive = stagedAsset === asset;

              return (
                <Tooltip
                  key={asset}
                  asChild
                  side="top"
                  content={
                    <span className="font-medium text-zinc-200">
                      {t(`stageTo.${asset}`)}
                    </span>
                  }
                >
                  <button
                    type="button"
                    disabled={stageDisabled && !isActive}
                    aria-label={t(`stageTo.${asset}`)}
                    onClick={() => handleStageClick(asset)}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border transition-all duration-200",
                      "disabled:cursor-not-allowed disabled:opacity-30",
                      isSuccess || isActive ? activeClass : pillClass,
                      successAsset === asset &&
                        "animate-[stage-pulse_0.55s_ease-out]",
                    )}
                  >
                    {isPending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : isSuccess || isActive ? (
                      <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                    ) : (
                      <Icon className={cn("size-3.5", iconClass)} aria-hidden />
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || busy}
                className={utilityBtn}
                aria-label={t("rowMenuAria")}
                title={t("rowMenuAria")}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className={cn(GLASS_MENU_CLASS, "min-w-[220px]")}
            >
              <DropdownMenuItem
                className="cursor-pointer gap-2.5 rounded-md text-sm font-medium focus:bg-white/[0.08] focus:text-white"
                disabled={watchlistDisabled}
                onSelect={onTrack}
              >
                <ListPlus className="size-4 shrink-0 text-emerald-400/90" aria-hidden />
                {tracking ? t("addingToWatchlist") : t("menuAddToWatchlist")}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer gap-2.5 rounded-md text-sm font-medium focus:bg-white/[0.08] focus:text-white"
                disabled={stageDisabled}
                onSelect={() => handleStageClick("keywords")}
              >
                <FolderInput className="size-4 shrink-0 text-violet-400/90" aria-hidden />
                {staging ? t("staging") : t("menuStage")}
              </DropdownMenuItem>

              <DropdownMenuItem
                className="cursor-pointer gap-2.5 rounded-md text-sm font-medium focus:bg-white/[0.08] focus:text-white"
                onSelect={() => onViewSearchVolumeHistory?.()}
              >
                <BarChart3 className="size-4 shrink-0 text-sky-400/90" aria-hidden />
                {t("menuViewSearchVolume")}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-white/[0.08]" />

              <DropdownMenuItem
                className="cursor-pointer gap-2.5 rounded-md text-sm font-medium text-rose-300/95 focus:bg-rose-500/10 focus:text-rose-200"
                onSelect={onIgnore}
              >
                <Trash2 className="size-4 shrink-0 text-rose-400/80" aria-hidden />
                {t("menuIgnore")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
