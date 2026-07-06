"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  GitBranch,
  Globe,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Upload,
  RotateCcw,
  Edit3,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingVersion, LiveListingSnapshot, ScreenshotCaption } from "@/lib/listing/listing-version.types";
import { toast } from "sonner";
import type { BuildOrIdleMode } from "@/lib/listing/pipeline-progress.types";
import { buildPipelineSteps } from "@/lib/listing/pipeline-progress.types";
import type { PipelinePhaseProgress } from "@/hooks/useListingPipeline";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  version: ListingVersion;
  /** Called after a successful status transition to refresh parent state. */
  onVersionUpdated?: (version: ListingVersion) => void;
  isRtl?: boolean;
  className?: string;
  /**
   * When provided, overlays a "building" progress bar at the top of the view
   * and uses partialContent to fill fields that are still null in `version`.
   * Pass `{ isBuilding: false }` or omit to show the normal completed view.
   */
  buildMode?: BuildOrIdleMode;
  /**
   * Phase completion booleans — required when buildMode.isBuilding is true
   * to render the step indicators.
   */
  buildPhases?: PipelinePhaseProgress;
};

type Section = "title" | "short" | "long" | "captions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diffClass(live: string | null | undefined, draft: string | null | undefined) {
  if (!live && !draft) return "unchanged";
  if (!live) return "new";
  if (live?.trim() === draft?.trim()) return "unchanged";
  return "changed";
}

const STATUS_CONFIG = {
  draft: {
    icon: Clock,
    ringClass: "text-amber-400",
    bgClass: "bg-amber-500/10 border-amber-500/25",
    textClass: "text-amber-300",
  },
  published: {
    icon: Globe,
    ringClass: "text-sky-400",
    bgClass: "bg-sky-500/10 border-sky-500/25",
    textClass: "text-sky-300",
  },
  deployed: {
    icon: CheckCircle2,
    ringClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10 border-emerald-500/25",
    textClass: "text-emerald-300",
  },
} as const;

// ─── Subcomponents ────────────────────────────────────────────────────────────

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-zinc-700/60", className)}
      aria-hidden="true"
    />
  );
}

function DraftSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

function SectionComparison({
  label,
  liveText,
  draftText,
  multiline = false,
  isRtl = false,
  isBuilding = false,
  skeletonLines = 2,
  t,
}: {
  label: string;
  liveText?: string | null;
  draftText?: string | null;
  multiline?: boolean;
  isRtl?: boolean;
  /** When true and draftText is null, show a skeleton shimmer instead of "—". */
  isBuilding?: boolean;
  skeletonLines?: number;
  t: ReturnType<typeof useTranslations<"optimizer.deployment">>;
}) {
  const diff = diffClass(liveText, draftText);

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/6">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
          {label}
        </span>
        {diff === "changed" && (
          <span className="ml-auto text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
            {t("changed")}
          </span>
        )}
        {diff === "unchanged" && liveText && (
          <span className="ml-auto text-[10px] font-medium text-zinc-500 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full">
            {t("unchanged")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-white/6">
        {/* Live column */}
        <div className="p-4 bg-zinc-800/30">
          {liveText ? (
            <p
              className={cn(
                "text-sm text-zinc-300 leading-relaxed",
                isRtl && "text-right font-arabic",
                !multiline && "line-clamp-3",
              )}
              dir={isRtl ? "rtl" : "ltr"}
            >
              {liveText}
            </p>
          ) : (
            <p className="text-sm text-zinc-600 italic">—</p>
          )}
        </div>
        {/* Draft column */}
        <div
          className={cn(
            "p-4",
            diff === "changed" && "bg-amber-500/5",
          )}
        >
          {draftText ? (
            <p
              className={cn(
                "text-sm text-zinc-200 leading-relaxed",
                isRtl && "text-right font-arabic",
                !multiline && "line-clamp-3",
              )}
              dir={isRtl ? "rtl" : "ltr"}
            >
              {draftText}
            </p>
          ) : isBuilding ? (
            <DraftSkeleton lines={skeletonLines} />
          ) : (
            <p className="text-sm text-zinc-600 italic">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptionsPanel({
  captions,
  t,
}: {
  captions: ScreenshotCaption[];
  t: ReturnType<typeof useTranslations<"optimizer.deployment">>;
}) {
  if (captions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic py-2">{t("noCaptions")}</p>
    );
  }

  const THEME_COLORS: Record<ScreenshotCaption["theme"], string> = {
    hook: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    feature: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    benefit: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    cta: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      {captions.map((cap) => (
        <div
          key={cap.order}
          className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/3 px-3 py-2.5"
        >
          <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/8 text-[11px] font-bold text-zinc-400">
            {cap.order}
          </span>
          <p className="flex-1 text-sm text-zinc-200">{cap.caption}</p>
          <span
            className={cn(
              "shrink-0 text-[10px] font-medium border rounded-full px-1.5 py-0.5 uppercase tracking-wide",
              THEME_COLORS[cap.theme],
            )}
          >
            {cap.theme}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Live snapshot dialog ─────────────────────────────────────────────────────

function LiveSnapshotDialog({
  current,
  isRtl,
  onSave,
  onClose,
  t,
}: {
  current: LiveListingSnapshot | null;
  isRtl: boolean;
  onSave: (snap: LiveListingSnapshot) => Promise<void>;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"optimizer.deployment">>;
}) {
  const [form, setForm] = useState<LiveListingSnapshot>({
    title: current?.title ?? "",
    shortDescription: current?.shortDescription ?? "",
    longDescription: current?.longDescription ?? "",
    capturedAt: new Date().toISOString(),
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...form, capturedAt: new Date().toISOString() });
      onClose();
    } catch {
      /* handled by caller */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h3 className="font-semibold text-zinc-100">{t("liveSnapshotDialogTitle")}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              {t("liveSnapshotTitleLabel")}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              maxLength={30}
              dir={isRtl ? "rtl" : "ltr"}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              {t("liveSnapshotShortLabel")}
            </label>
            <textarea
              value={form.shortDescription}
              onChange={(e) =>
                setForm((p) => ({ ...p, shortDescription: e.target.value }))
              }
              maxLength={80}
              rows={2}
              dir={isRtl ? "rtl" : "ltr"}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              {t("liveSnapshotLongLabel")}
            </label>
            <textarea
              value={form.longDescription}
              onChange={(e) =>
                setForm((p) => ({ ...p, longDescription: e.target.value }))
              }
              rows={6}
              dir={isRtl ? "rtl" : "ltr"}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/8">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/8 transition-colors"
          >
            {t("liveSnapshotCancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="rounded-lg px-4 py-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? "…" : t("liveSnapshotSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeploymentView({
  workspaceId,
  version: initialVersion,
  onVersionUpdated,
  isRtl = false,
  className,
  buildMode,
  buildPhases,
}: Props) {
  const t = useTranslations("optimizer.deployment");
  const [version, setVersion] = useState(initialVersion);
  const [expandedSection, setExpandedSection] = useState<Section | null>("title");
  const [showLiveDialog, setShowLiveDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isBuilding = buildMode?.isBuilding === true;

  // Merge partial content into version fields — partial content takes
  // precedence only when the version field is still null (i.e. not yet
  // written from the worker), allowing the UI to stream in live text.
  const partial = isBuilding ? (buildMode as { isBuilding: true; partialContent: { title: string | null; shortDescription: string | null; longDescription: string | null }; progressPercent: number; currentPhase: string | null }).partialContent : null;
  const displayTitle = version.title ?? partial?.title ?? null;
  const displayShort = version.shortDescription ?? partial?.shortDescription ?? null;
  const displayLong = version.longDescription ?? partial?.longDescription ?? null;

  const progressPercent = isBuilding
    ? (buildMode as { isBuilding: true; progressPercent: number }).progressPercent
    : 100;

  const statusCfg = STATUS_CONFIG[version.status];
  const StatusIcon = statusCfg.icon;
  const live = version.liveListingSnapshot;
  const hasLive = !!live;

  // Step indicators for the build progress header
  const buildSteps = isBuilding && buildPhases
    ? buildPipelineSteps(
        buildPhases,
        (buildMode as { isBuilding: true; currentPhase: string | null }).currentPhase,
      )
    : null;

  const callVersionApi = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/listing-versions/${version.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { version: ListingVersion };
      setVersion(json.version);
      onVersionUpdated?.(json.version);
    },
    [workspaceId, version.id, onVersionUpdated],
  );

  async function handleStatusAction(action: string, successKey: keyof typeof t) {
    setActionLoading(action);
    try {
      await callVersionApi({ action });
      toast.success(t(successKey as Parameters<typeof t>[0]));
    } catch {
      toast.error(t("actionError"));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveLiveSnapshot(snap: LiveListingSnapshot) {
    await callVersionApi({ action: "set_live_snapshot", snapshot: snap });
  }

  function toggleSection(s: Section) {
    setExpandedSection((prev) => (prev === s ? null : s));
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* ── Build progress banner (only when generating) ── */}
      {isBuilding && (
        <div
          className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 space-y-2.5"
          role="status"
          aria-live="polite"
        >
          {/* Step indicators */}
          {buildSteps && (
            <div className="flex items-start justify-between gap-1">
              {buildSteps.map((step, idx) => (
                <div key={step.phase} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border transition-all duration-500",
                        step.status === "done" && "border-emerald-500 bg-emerald-500",
                        step.status === "active" && "border-amber-400 bg-amber-400/20 ring-1 ring-amber-400/30",
                        step.status === "pending" && "border-zinc-600 bg-zinc-800",
                      )}
                    >
                      {step.status === "active" && (
                        <span className="block h-1.5 w-1.5 animate-ping rounded-full bg-amber-400" />
                      )}
                      {step.status === "done" && (
                        <svg className="h-2 w-2 text-white" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7z" />
                        </svg>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[9px] font-medium",
                        step.status === "done" && "text-emerald-400",
                        step.status === "active" && "text-amber-300",
                        step.status === "pending" && "text-zinc-600",
                      )}
                    >
                      {isRtl ? step.labelAr : step.label}
                    </span>
                  </div>
                  {idx < buildSteps.length - 1 && (
                    <div
                      className={cn(
                        "mb-4 mx-1 h-px flex-1 transition-colors duration-500",
                        step.status === "done" ? "bg-emerald-500/40" : "bg-zinc-700",
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-700/60">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Label */}
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
            <p className="text-xs text-amber-300/80">
              {t("buildingMessage")}
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              {t("panelTitle")} — {t("versionLabel", { number: version.versionNumber })}
            </p>
            <p className="text-xs text-zinc-500">{t("panelSubtitle")}</p>
          </div>
        </div>

        {/* Status badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
            isBuilding
              ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
              : cn(statusCfg.bgClass, statusCfg.textClass),
          )}
        >
          {isBuilding ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              {t("generating")}
            </>
          ) : (
            <>
              <StatusIcon className={cn("w-3.5 h-3.5", statusCfg.ringClass)} />
              {t(`status${version.status.charAt(0).toUpperCase() + version.status.slice(1)}` as Parameters<typeof t>[0])}
            </>
          )}
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-4 py-2.5">
          <Globe className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold text-zinc-300">{t("liveColumn")}</span>
          {!hasLive && (
            <button
              onClick={() => setShowLiveDialog(true)}
              className="ml-auto text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" />
              {t("enterLiveButton")}
            </button>
          )}
          {hasLive && (
            <button
              onClick={() => setShowLiveDialog(true)}
              className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" />
              {t("updateLiveButton")}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/8 px-4 py-2.5">
          <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-xs font-semibold text-violet-300">{t("draftColumn")}</span>
        </div>
      </div>

      {/* ── No live listing notice ── */}
      {!hasLive && (
        <div className="rounded-xl border border-dashed border-white/12 bg-white/2 p-5 text-center space-y-2">
          <p className="text-sm text-zinc-400">{t("noLiveSnapshot")}</p>
          <p className="text-xs text-zinc-600">{t("enterLiveHint")}</p>
          <button
            onClick={() => setShowLiveDialog(true)}
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {t("enterLiveButton")}
          </button>
        </div>
      )}

      {/* ── Section accordions ── */}
      {(["title", "short", "long"] as const).map((key) => {
        const liveVal =
          key === "title"
            ? live?.title
            : key === "short"
            ? live?.shortDescription
            : live?.longDescription;
        // Use display values that merge partial content for progressive UI
        const draftVal =
          key === "title"
            ? displayTitle
            : key === "short"
            ? displayShort
            : displayLong;
        const sectionLabel = t(`${key}Section` as Parameters<typeof t>[0]);
        const isExpanded = expandedSection === key;
        // A field is still loading if we're building AND no content has arrived yet
        const fieldLoading = isBuilding && !draftVal;

        return (
          <div
            key={key}
            className="rounded-xl border border-white/8 bg-white/2 overflow-hidden"
          >
            <button
              onClick={() => toggleSection(key)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors"
            >
              <span className="text-sm font-medium text-zinc-200">{sectionLabel}</span>
              {/* Loading indicator for fields not yet ready during build */}
              {fieldLoading ? (
                <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400/70">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t("generating")}
                </span>
              ) : diffClass(liveVal, draftVal) === "changed" && !isBuilding ? (
                <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                  {t("changed")}
                </span>
              ) : null}
              <span className="ml-auto text-zinc-600">
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>
            {isExpanded && (
              <div className="border-t border-white/6">
                <SectionComparison
                  label={sectionLabel}
                  liveText={liveVal}
                  draftText={draftVal}
                  multiline={key === "long"}
                  isRtl={isRtl}
                  isBuilding={fieldLoading}
                  skeletonLines={key === "long" ? 5 : key === "short" ? 3 : 2}
                  t={t}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* ── Screenshot captions ── */}
      {version.screenshotCaptions.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-white/2 overflow-hidden">
          <button
            onClick={() => toggleSection("captions")}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors"
          >
            <span className="text-sm font-medium text-zinc-200">
              {t("captionsSection")}
            </span>
            <span className="text-xs text-zinc-500 bg-white/5 border border-white/8 rounded-full px-2 py-0.5">
              {version.screenshotCaptions.length}
            </span>
            <span className="ml-auto text-zinc-600">
              {expandedSection === "captions" ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>
          {expandedSection === "captions" && (
            <div className="p-4 border-t border-white/6">
              <CaptionsPanel captions={version.screenshotCaptions} t={t} />
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {version.status === "draft" && (
          <button
            onClick={() => handleStatusAction("publish", "publishSuccess")}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Globe className="w-4 h-4" />
            {actionLoading === "publish" ? "…" : t("markPublished")}
          </button>
        )}
        {version.status === "published" && (
          <button
            onClick={() => handleStatusAction("deploy", "deploySuccess")}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Upload className="w-4 h-4" />
            {actionLoading === "deploy" ? "…" : t("markDeployed")}
          </button>
        )}
        {version.status !== "draft" && (
          <button
            onClick={() => handleStatusAction("revert_to_draft", "revertSuccess")}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/8 border border-white/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {actionLoading === "revert_to_draft" ? "…" : t("revertToDraft")}
          </button>
        )}
      </div>

      {/* ── Live snapshot dialog ── */}
      {showLiveDialog && (
        <LiveSnapshotDialog
          current={live}
          isRtl={isRtl}
          onSave={handleSaveLiveSnapshot}
          onClose={() => setShowLiveDialog(false)}
          t={t}
        />
      )}
    </div>
  );
}
