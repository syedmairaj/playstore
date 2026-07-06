"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, Download, Image as ImageIcon, Layers, RefreshCw, Smartphone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VaultAsset } from "@/app/api/brand-assets/vault/route";
import { BrandKitSyncPanel } from "@/components/brand-assets/BrandKitSyncPanel";

type Filter = "all" | "icon" | "banner" | "screenshot";

/** Shared query-key factory — must match the key used in BrandAssetsClient */
export function vaultQueryKey(workspaceId: string, appId?: string, filter?: Filter, offset?: number) {
  return ["brand-assets-vault", workspaceId, appId ?? "", filter ?? "all", offset ?? 0] as const;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

// ── Screenshot live-preview frame (lightweight CSS phone shell) ───────────────

function ScreenshotPhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[140px]">
      {/* Phone shell */}
      <div className="relative rounded-[18px] border-[3px] border-white/[0.18] bg-[#111] pb-3 pt-2 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_6px_24px_rgba(0,0,0,0.5)]">
        {/* Pill camera */}
        <div className="mx-auto mb-1.5 h-[6px] w-[26px] rounded-full bg-[#1a1a1a]" aria-hidden />
        {/* Screen */}
        <div className="overflow-hidden rounded-[10px] mx-0.5 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-1.5 h-[3px] w-[32px] rounded-full bg-white/20" aria-hidden />
      </div>
    </div>
  );
}

// ── AssetCard ─────────────────────────────────────────────────────────────────

function AssetCard({
  asset, onDelete, locale, workspaceId, isManuallyOverridden,
}: { asset: VaultAsset; onDelete: (id: string) => void; locale: string; workspaceId: string; isManuallyOverridden?: boolean }) {
  const t = useTranslations("brandAssets.vault");
  const tSync = useTranslations("brandAssets.sync");
  const [deleting, setDeleting] = useState(false);
  const isWide = asset.assetType === "banner";
  const isScreenshot = asset.assetType === "screenshot";

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/brand-assets/${asset.id}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
      });
      if (!res.ok) { toast.error(t("deleteError")); return; }
      onDelete(asset.id);
      toast.success(t("deleted"));
    } catch { toast.error(t("deleteError")); }
    finally { setDeleting(false); }
  }

  function handleDownload() {
    const a = Object.assign(document.createElement("a"), {
      href: asset.signedUrl, download: asset.fileName, rel: "noopener",
    });
    document.body.appendChild(a); a.click(); a.remove();
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/35 ring-1 ring-white/[0.05] transition-[border-color] hover:border-white/[0.15]">
      {/* Image — screenshot type shows live-preview phone frame */}
      {isScreenshot ? (
        <div className="overflow-hidden bg-black/20 px-4 pt-4 pb-2">
          <ScreenshotPhoneFrame src={asset.signedUrl} alt={asset.fileName} />
        </div>
      ) : (
        <div className={cn("overflow-hidden bg-black/20", isWide ? "aspect-[2/1]" : "aspect-square")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.signedUrl}
            alt={asset.fileName}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        </div>
      )}

      {/* Overlay actions — appear on hover */}
      <div className="absolute inset-0 flex items-end justify-end gap-1.5 p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleDownload}
          title={t("download")}
          className="flex size-8 items-center justify-center rounded-lg bg-black/70 text-white/80 backdrop-blur-sm transition hover:bg-[#22C55E]/80 hover:text-white"
        >
          <Download className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => { void handleDelete(); }}
          disabled={deleting}
          title={t("delete")}
          className="flex size-8 items-center justify-center rounded-lg bg-black/70 text-white/80 backdrop-blur-sm transition hover:bg-red-500/80 hover:text-white disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
        </button>
      </div>

      {/* Type badge */}
      <div className="absolute start-2 top-2">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
          asset.assetType === "icon"
            ? "bg-[#22C55E]/20 text-[#86efac]"
            : asset.assetType === "screenshot"
              ? "bg-purple-500/20 text-purple-300"
              : "bg-blue-500/20 text-blue-300",
        )}>
          {asset.assetType === "icon"
            ? <ImageIcon className="size-2.5" aria-hidden />
            : asset.assetType === "screenshot"
              ? <Smartphone className="size-2.5" aria-hidden />
              : <Layers className="size-2.5" aria-hidden />}
          {asset.assetType === "icon" ? t("typeIcon") : asset.assetType === "screenshot" ? t("typeScreenshot") : t("typeBanner")}
        </span>
      </div>

      {/* Manual override badge */}
      {isManuallyOverridden && (
        <div className="absolute end-2 top-2">
          <span
            title={tSync("overrideBadge")}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
          >
            <ShieldAlert className="size-2.5" aria-hidden />
            {tSync("overrideBadgeShort")}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="px-2.5 py-2">
        <p className="text-[11px] text-white/35">{formatDate(asset.createdAt, locale)}</p>
      </div>
    </div>
  );
}

const PAGE_SIZE = 48;

export function VaultGrid({
  workspaceId, appId, showSyncPanel = false,
}: { workspaceId: string; appId?: string; showSyncPanel?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("brandAssets.vault");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  // Accumulate pages of assets across "load more" clicks
  const [allAssets, setAllAssets] = useState<VaultAsset[]>([]);

  const queryKey = vaultQueryKey(workspaceId, appId, filter, offset);

  const { data, isFetching, isLoading } = useQuery({
    queryKey,
    staleTime: 60_000, // 1 min — signed URLs are valid for 1 h
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId, limit: String(PAGE_SIZE) });
      if (appId) params.set("appId", appId);
      if (filter !== "all") params.set("assetType", filter);
      if (offset > 0) params.set("offset", String(offset));
      const res = await fetch(`/api/brand-assets/vault?${params}`, { credentials: "include" });
      const json = (await res.json()) as { ok: boolean; assets?: VaultAsset[]; hasMore?: boolean };
      if (!json.ok || !json.assets) return { assets: [] as VaultAsset[], hasMore: false };
      // Merge into accumulated list
      setAllAssets((prev) => {
        if (offset === 0) return json.assets!;
        // Deduplicate by id in case of invalidation / refetch
        const ids = new Set(json.assets!.map((a) => a.id));
        return [...prev.filter((a) => !ids.has(a.id)), ...json.assets!];
      });
      return { assets: json.assets, hasMore: json.hasMore ?? false };
    },
  });

  const hasMore = data?.hasMore ?? false;
  const loading = isLoading || isFetching;

  function resetFilter(newFilter: Filter) {
    setFilter(newFilter);
    setOffset(0);
    setAllAssets([]);
    // Invalidate so the fresh query fires immediately
    void queryClient.invalidateQueries({ queryKey: vaultQueryKey(workspaceId, appId, newFilter, 0) });
  }

  function refresh() {
    setOffset(0);
    setAllAssets([]);
    void queryClient.invalidateQueries({ queryKey: vaultQueryKey(workspaceId, appId, filter, 0) });
  }

  function handleDeleted(id: string) {
    setAllAssets((prev) => prev.filter((a) => a.id !== id));
  }

  const FILTERS: { key: Filter; label: string; icon: React.ReactNode }[] = [
    { key: "all",        label: t("filterAll"),         icon: null },
    { key: "icon",       label: t("filterIcons"),       icon: <ImageIcon className="size-3.5" aria-hidden /> },
    { key: "banner",     label: t("filterBanners"),     icon: <Layers className="size-3.5" aria-hidden /> },
    { key: "screenshot", label: t("filterScreenshots"), icon: <Smartphone className="size-3.5" aria-hidden /> },
  ];

  return (
    <div className="space-y-5">
      {/* Brand Kit Sync Panel — shown when the vault is in "My Vault" mode */}
      {showSyncPanel && (
        <BrandKitSyncPanel workspaceId={workspaceId} appId={appId} />
      )}

      {/* Filter pills + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {FILTERS.map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => resetFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === key
                  ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]"
                  : "border-white/[0.1] bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/75",
              )}>
              {icon}{label}
            </button>
          ))}
        </div>
        <button type="button" onClick={refresh}
          disabled={loading}
          className="ms-auto flex items-center gap-1.5 text-xs text-white/35 transition hover:text-white/60 disabled:opacity-40">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
          {t("refresh")}
        </button>
      </div>

      {/* Grid */}
      {loading && allAssets.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-white/30" aria-hidden />
        </div>
      ) : allAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ImageIcon className="size-10 text-white/15" aria-hidden />
          <p className="text-sm font-medium text-white/40">{t("empty")}</p>
          <p className="text-xs text-white/25">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {allAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDelete={handleDeleted}
                locale={locale}
                workspaceId={workspaceId}
                isManuallyOverridden={
                  // The override flag lives on manifests, not on the asset row itself.
                  // We surface it here via asset.meta if the vault API injects it.
                  (asset.meta as Record<string, unknown> | null)?.isManuallyOverridden === true
                }
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button type="button" disabled={loading}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/70 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] disabled:opacity-40">
                {loading ? <Loader2 className="size-4 animate-spin inline me-2" /> : null}
                {t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
