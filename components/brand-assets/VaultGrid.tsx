"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2, Trash2, Download, Image as ImageIcon, Layers, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VaultAsset } from "@/app/api/brand-assets/vault/route";

type Filter = "all" | "icon" | "banner";

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

function AssetCard({
  asset, onDelete, locale,
}: { asset: VaultAsset; onDelete: (id: string) => void; locale: string }) {
  const t = useTranslations("brandAssets.vault");
  const [deleting, setDeleting] = useState(false);
  const isWide = asset.assetType === "banner";

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/brand-assets/${asset.id}?workspaceId=${encodeURIComponent("")}`, {
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
      {/* Image */}
      <div className={cn("overflow-hidden bg-black/20", isWide ? "aspect-[2/1]" : "aspect-square")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.signedUrl}
          alt={asset.fileName}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
      </div>

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
            : "bg-blue-500/20 text-blue-300",
        )}>
          {asset.assetType === "icon"
            ? <ImageIcon className="size-2.5" aria-hidden />
            : <Layers className="size-2.5" aria-hidden />}
          {t(asset.assetType === "icon" ? "typeIcon" : "typeBanner")}
        </span>
      </div>

      {/* Footer */}
      <div className="px-2.5 py-2">
        <p className="text-[11px] text-white/35">{formatDate(asset.createdAt, locale)}</p>
      </div>
    </div>
  );
}

export function VaultGrid({
  workspaceId, appId,
}: { workspaceId: string; appId?: string }) {
  const locale = useLocale();
  const t = useTranslations("brandAssets.vault");
  const [filter, setFilter] = useState<Filter>("all");
  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchAssets = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId, limit: "48" });
      if (appId) params.set("appId", appId);
      if (filter !== "all") params.set("assetType", filter);
      if (!reset) params.set("offset", String(offset));
      const res = await fetch(`/api/brand-assets/vault?${params}`);
      const json = (await res.json()) as { ok: boolean; assets?: VaultAsset[]; hasMore?: boolean };
      if (!json.ok || !json.assets) return;
      setAssets(reset ? json.assets : (prev) => [...prev, ...json.assets!]);
      setHasMore(json.hasMore ?? false);
      if (!reset) setOffset((o) => o + json.assets!.length);
    } catch { toast.error(t("loadError")); }
    finally { setLoading(false); }
  }, [workspaceId, appId, filter, offset, t]);

  // Re-fetch when filter changes
  useEffect(() => {
    setOffset(0);
    setAssets([]);
    void fetchAssets(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, appId, filter]);

  function handleDeleted(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  const FILTERS: { key: Filter; label: string; icon: React.ReactNode }[] = [
    { key: "all",    label: t("filterAll"),    icon: null },
    { key: "icon",   label: t("filterIcons"),  icon: <ImageIcon className="size-3.5" aria-hidden /> },
    { key: "banner", label: t("filterBanners"), icon: <Layers className="size-3.5" aria-hidden /> },
  ];

  return (
    <div className="space-y-5">
      {/* Filter pills + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {FILTERS.map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => setFilter(key)}
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
        <button type="button" onClick={() => { setOffset(0); setAssets([]); void fetchAssets(true); }}
          disabled={loading}
          className="ms-auto flex items-center gap-1.5 text-xs text-white/35 transition hover:text-white/60 disabled:opacity-40">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
          {t("refresh")}
        </button>
      </div>

      {/* Grid */}
      {loading && assets.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-white/30" aria-hidden />
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ImageIcon className="size-10 text-white/15" aria-hidden />
          <p className="text-sm font-medium text-white/40">{t("empty")}</p>
          <p className="text-xs text-white/25">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onDelete={handleDeleted} locale={locale} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button type="button" disabled={loading}
                onClick={() => { void fetchAssets(false); }}
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
