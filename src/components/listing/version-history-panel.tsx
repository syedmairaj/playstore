"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Clock,
  Globe,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingVersion } from "@/lib/listing/listing-version.types";
import { DeploymentView } from "@/components/listing/deployment-view";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  appId?: string | null;
  vaultLocale?: "en" | "ar";
  isRtl?: boolean;
  className?: string;
  /** If provided, this version is selected by default (e.g. after generation). */
  defaultVersionId?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft: {
    icon: Clock,
    label: "statusDraft",
    dotClass: "bg-amber-400",
    badgeClass: "bg-amber-500/10 border-amber-500/25 text-amber-300",
  },
  published: {
    icon: Globe,
    label: "statusPublished",
    dotClass: "bg-sky-400",
    badgeClass: "bg-sky-500/10 border-sky-500/25 text-sky-300",
  },
  deployed: {
    icon: CheckCircle2,
    label: "statusDeployed",
    dotClass: "bg-emerald-400",
    badgeClass: "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
  },
} as const;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ─── Version row ─────────────────────────────────────────────────────────────

function VersionRow({
  version,
  isSelected,
  onClick,
  t,
}: {
  version: ListingVersion;
  isSelected: boolean;
  onClick: () => void;
  t: ReturnType<typeof useTranslations<"optimizer.versionHistory">>;
}) {
  const cfg = STATUS_CONFIG[version.status];
  const StatusIcon = cfg.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
        isSelected
          ? "border-violet-500/40 bg-violet-500/8"
          : "border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/12",
      )}
    >
      {/* Status dot */}
      <div className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotClass)} />

      {/* Version label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200 truncate">
          {t("versionLabel", { number: version.versionNumber })}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">
          {t("createdAt", { date: formatDate(version.createdAt) })}
        </p>
        {version.title && (
          <p className="text-xs text-zinc-500 truncate mt-0.5 italic">
            {version.title}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0",
          cfg.badgeClass,
        )}
      >
        <StatusIcon className="w-3 h-3" />
        {t(cfg.label as Parameters<typeof t>[0])}
      </div>

      <ChevronRight
        className={cn(
          "w-4 h-4 shrink-0 transition-transform",
          isSelected ? "text-violet-400 rotate-90" : "text-zinc-600",
        )}
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VersionHistoryPanel({
  workspaceId,
  appId,
  vaultLocale = "en",
  isRtl = false,
  className,
  defaultVersionId,
}: Props) {
  const t = useTranslations("optimizer.versionHistory");
  const [versions, setVersions] = useState<ListingVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultVersionId ?? null,
  );

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/workspaces/${workspaceId}/listing-versions`,
        window.location.origin,
      );
      if (appId) url.searchParams.set("appId", appId);
      url.searchParams.set("locale", vaultLocale);
      url.searchParams.set("limit", "20");

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { versions: ListingVersion[] };
      setVersions(json.versions);

      // Auto-select the default or latest version
      if (defaultVersionId) {
        setSelectedId(defaultVersionId);
      } else if (!selectedId && json.versions.length > 0) {
        setSelectedId(json.versions[0].id);
      }
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, appId, vaultLocale, t, defaultVersionId, selectedId]);

  useEffect(() => {
    fetchVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, appId, vaultLocale]);

  // Sync default version selection when it changes (e.g. after a new generation)
  useEffect(() => {
    if (defaultVersionId) setSelectedId(defaultVersionId);
  }, [defaultVersionId]);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;

  function handleVersionUpdated(updated: ListingVersion) {
    setVersions((prev) =>
      prev.map((v) => (v.id === updated.id ? updated : v)),
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">{t("panelTitle")}</p>
            {!loading && versions.length > 0 && (
              <p className="text-xs text-zinc-500">
                {t("versionCount", { count: versions.length })}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchVersions}
          className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/8 transition-colors"
          aria-label={t("refreshAria")}
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* ── Content ── */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-white/4 border border-white/6 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!loading && !error && versions.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/2 p-6 text-center">
          <GitBranch className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">{t("emptyState")}</p>
        </div>
      )}

      {!loading && versions.length > 0 && (
        <div className="grid gap-2">
          {/* ── Version list (left) + DeploymentView (right on large screens) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
            {/* Version list */}
            <div className="space-y-2">
              {versions.map((v) => (
                <VersionRow
                  key={v.id}
                  version={v}
                  isSelected={v.id === selectedId}
                  onClick={() => setSelectedId(v.id)}
                  t={t}
                />
              ))}
            </div>

            {/* Deployment view for selected version */}
            {selectedVersion && (
              <DeploymentView
                workspaceId={workspaceId}
                version={selectedVersion}
                onVersionUpdated={handleVersionUpdated}
                isRtl={isRtl}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
