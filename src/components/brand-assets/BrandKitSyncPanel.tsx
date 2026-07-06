"use client";

/**
 * BrandKitSyncPanel
 *
 * Displays the current Brand Kit → Mockup sync status and provides two
 * primary actions:
 *
 *  • Auto-Sync  (POST /api/brand-kit/sync)    — respects is_manually_overridden
 *  • Force-Revert (PATCH /api/brand-kit/sync) — overwrites all manifests,
 *    including manually-overridden ones, and clears the flag
 *
 * The panel is placed at the top of the VaultGrid's "My Vault" view.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BrandKitSyncResult } from "@/lib/listing/asset-manifest.types";

// ── Types ─────────────────────────────────────────────────────────────────────

type ManifestStatus = {
  id: string;
  queueHash: string;
  syncStatus: "synced" | "mismatch" | "pending";
  isManuallyOverridden: boolean;
  appId: string | null;
  vaultLocale: "en" | "ar";
};

type ManifestStatusResponse = {
  ok: boolean;
  manifests?: ManifestStatus[];
  error?: { message: string };
};

type SyncApiResponse = {
  ok: boolean;
  result?: BrandKitSyncResult;
  error?: { message: string };
};

// ── Manifest status query ─────────────────────────────────────────────────────

function useManifestStatus(workspaceId: string, appId?: string) {
  return useQuery<ManifestStatus[]>({
    queryKey: ["brand-kit-manifest-status", workspaceId, appId ?? ""],
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId });
      if (appId) params.set("appId", appId);
      const res = await fetch(`/api/brand-kit/manifests?${params}`, {
        credentials: "include",
      });
      const json = (await res.json()) as ManifestStatusResponse;
      if (!json.ok || !json.manifests) return [];
      return json.manifests;
    },
  });
}

// ── Sync result summary ───────────────────────────────────────────────────────

function SyncResultSummary({
  result,
  t,
}: {
  result: BrandKitSyncResult;
  t: ReturnType<typeof useTranslations<"brandAssets.sync">>;
}) {
  const items = [
    { label: t("summaryUpdated"), value: result.updated, color: "text-emerald-400" },
    { label: t("summarySkipped"), value: result.skippedManualOverride, color: "text-amber-400" },
    { label: t("summaryMismatch"), value: result.markedMismatch, color: "text-orange-400" },
    ...(result.errors > 0
      ? [{ label: t("summaryErrors"), value: result.errors, color: "text-red-400" }]
      : []),
  ];

  return (
    <div className="flex flex-wrap gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs">
      {items.map(({ label, value, color }) => (
        <span key={label} className="flex items-center gap-1.5 text-white/60">
          <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Manifest row ──────────────────────────────────────────────────────────────

function ManifestRow({
  manifest,
  t,
}: {
  manifest: ManifestStatus;
  t: ReturnType<typeof useTranslations<"brandAssets.sync">>;
}) {
  const statusConfig = {
    synced: {
      icon: <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />,
      label: t("statusSynced"),
      pill: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
    },
    mismatch: {
      icon: <AlertTriangle className="size-3.5 text-orange-400" aria-hidden />,
      label: t("statusMismatch"),
      pill: "bg-orange-400/10 text-orange-400 border-orange-400/20",
    },
    pending: {
      icon: <Info className="size-3.5 text-white/40" aria-hidden />,
      label: t("statusPending"),
      pill: "bg-white/[0.05] text-white/40 border-white/[0.1]",
    },
  } as const;

  const cfg = statusConfig[manifest.syncStatus];

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] transition hover:bg-white/[0.03]">
      <div className="flex items-center gap-2 min-w-0">
        {cfg.icon}
        <span className="truncate font-mono text-white/45">{manifest.queueHash.slice(0, 12)}…</span>
        {manifest.vaultLocale === "ar" && (
          <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-300">AR</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {manifest.isManuallyOverridden && (
          <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 bg-amber-400/10 text-amber-400 border-amber-400/20">
            <ShieldAlert className="size-2.5" aria-hidden />
            {t("overrideBadgeShort")}
          </span>
        )}
        <span className={cn("rounded-md border px-1.5 py-0.5 font-medium", cfg.pill)}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

// ── BrandKitSyncPanel ─────────────────────────────────────────────────────────

export function BrandKitSyncPanel({
  workspaceId,
  appId,
}: {
  workspaceId: string;
  appId?: string;
}) {
  const t = useTranslations("brandAssets.sync");
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [lastResult, setLastResult] = useState<BrandKitSyncResult | null>(null);

  const { data: manifests = [], isFetching: loadingManifests } = useManifestStatus(
    workspaceId,
    appId,
  );

  const syncedCount = manifests.filter((m) => m.syncStatus === "synced").length;
  const mismatchCount = manifests.filter((m) => m.syncStatus === "mismatch").length;
  const overrideCount = manifests.filter((m) => m.isManuallyOverridden).length;

  async function handleSync(force: boolean) {
    if (force) {
      if (!window.confirm(t("revertConfirm"))) return;
    }

    const setter = force ? setReverting : setSyncing;
    setter(true);
    setLastResult(null);

    try {
      const res = await fetch("/api/brand-kit/sync", {
        method: force ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          appId: appId ?? null,
          assetType: "all",
        }),
      });
      const json = (await res.json()) as SyncApiResponse;

      if (!json.ok || !json.result) {
        toast.error(json.error?.message ?? t("syncError"));
        return;
      }

      setLastResult(json.result);

      // Invalidate manifest status + vault queries
      void queryClient.invalidateQueries({
        queryKey: ["brand-kit-manifest-status", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["brand-assets-vault", workspaceId],
      });

      if (force) {
        toast.success(t("revertSuccess", { count: json.result.updated }));
      } else {
        toast.success(t("syncSuccess", { count: json.result.updated }));
      }
    } catch {
      toast.error(t("syncError"));
    } finally {
      setter(false);
    }
  }

  const busy = syncing || reverting;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 ring-1 ring-white/[0.04]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90">{t("panelTitle")}</h3>
          <p className="mt-0.5 text-xs text-white/40">{t("panelSubtitle")}</p>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => { void handleSync(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1.5 text-xs font-medium text-[#86efac] transition hover:border-[#22C55E]/50 hover:bg-[#22C55E]/20 disabled:opacity-50"
          >
            {syncing
              ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
              : <RefreshCw className="size-3.5" aria-hidden />}
            {syncing ? t("syncing") : t("syncButton")}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => { void handleSync(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:border-white/20 hover:text-white/80 disabled:opacity-50"
          >
            {reverting
              ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
              : <RotateCcw className="size-3.5" aria-hidden />}
            {reverting ? t("reverting") : t("revertButton")}
          </button>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <StatusChip
          icon={<CheckCircle2 className="size-3" />}
          label={t("statusSynced")}
          count={syncedCount}
          color="emerald"
        />
        {mismatchCount > 0 && (
          <StatusChip
            icon={<AlertTriangle className="size-3" />}
            label={t("statusMismatch")}
            count={mismatchCount}
            color="orange"
          />
        )}
        {overrideCount > 0 && (
          <StatusChip
            icon={<ShieldAlert className="size-3" />}
            label={t("overrideBadgeShort")}
            count={overrideCount}
            color="amber"
          />
        )}
        {loadingManifests && (
          <Loader2 className="size-3.5 animate-spin text-white/30 self-center" aria-hidden />
        )}
      </div>

      {/* Last result summary */}
      {lastResult && (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <SyncResultSummary result={lastResult} t={t} />
        </div>
      )}

      {/* Manifest list — collapsed if empty, expanded if there are mismatches/overrides */}
      {manifests.length > 0 && (
        <div className="border-t border-white/[0.06] px-2 py-2">
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {manifests.map((m) => (
              <ManifestRow key={m.id} manifest={m} t={t} />
            ))}
          </div>
        </div>
      )}

      {manifests.length === 0 && !loadingManifests && (
        <div className="border-t border-white/[0.06] px-4 py-4">
          <p className="text-center text-xs text-white/30">{t("noManifests")}</p>
        </div>
      )}
    </div>
  );
}

// ── StatusChip ────────────────────────────────────────────────────────────────

function StatusChip({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "emerald" | "orange" | "amber";
}) {
  const colorMap = {
    emerald: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
    orange: "bg-orange-400/10 text-orange-400 border-orange-400/20",
    amber: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        colorMap[color],
      )}
    >
      {icon}
      <span className="font-semibold tabular-nums">{count}</span>
      {label}
    </span>
  );
}
