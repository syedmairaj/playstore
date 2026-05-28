"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, CloudUpload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PlayConsoleClampedListing = {
  title: string;
  shortDescription: string;
  fullDescription: string;
};

export type PlayConsoleExportCopyField =
  | "appNameTitle"
  | "shortDescription"
  | "fullDescription";

// ── One-click publish state machine ──────────────────────────────────────────

type PublishState =
  | { phase: "idle" }
  | { phase: "confirm" }
  | { phase: "publishing" }
  | { phase: "success"; language: string; authorizedEmail: string | null }
  | { phase: "error"; message: string };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PlayConsoleExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dir: "rtl" | "ltr";
  clamped: PlayConsoleClampedListing;
  onCopy: (field: PlayConsoleExportCopyField, text: string) => void | Promise<void>;
  onCopyAllPlayConsole: () => void | Promise<void>;
  onDownloadTxt?: () => void;
  disabled?: boolean;

  // One-click publish — all optional; if absent the publish section is hidden
  workspaceId?: string;
  appId?: string;
  /** BCP-47 locale being published, e.g. "en" | "ar" */
  locale?: string;
  /**
   * true  → workspace has a connected Google Play account
   * false → not connected → show a nudge
   * undefined → hide the publish section entirely
   */
  googlePlayConnected?: boolean;
  /** Authorized email of the connected account, shown in success state */
  connectedEmail?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayConsoleExportDialog({
  open,
  onOpenChange,
  dir,
  clamped,
  onCopy,
  onCopyAllPlayConsole,
  onDownloadTxt,
  disabled,
  workspaceId,
  appId,
  locale = "en",
  googlePlayConnected,
  connectedEmail,
}: PlayConsoleExportDialogProps) {
  const t = useTranslations("optimizer.results.exportModal");
  const [publishState, setPublishState] = useState<PublishState>({ phase: "idle" });

  const showPublishSection = Boolean(workspaceId && appId);

  function handleOpenChange(next: boolean) {
    if (!next) setPublishState({ phase: "idle" });
    onOpenChange(next);
  }

  async function handlePublishConfirmed() {
    if (!workspaceId || !appId) return;
    setPublishState({ phase: "publishing" });

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/apps/${appId}/publish-listing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            title: clamped.title,
            shortDescription: clamped.shortDescription,
            fullDescription: clamped.fullDescription,
          }),
        },
      );

      const json = (await res.json()) as {
        ok: boolean;
        language?: string;
        authorizedEmail?: string | null;
        error?: { message: string };
      };

      if (!json.ok) {
        setPublishState({
          phase: "error",
          message: json.error?.message ?? t("publishErrorGeneric"),
        });
        return;
      }

      setPublishState({
        phase: "success",
        language: json.language ?? locale,
        authorizedEmail: json.authorizedEmail ?? connectedEmail ?? null,
      });
    } catch {
      setPublishState({ phase: "error", message: t("publishErrorGeneric") });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        dir={dir}
        className={cn(
          "max-h-[min(92dvh,880px)] max-w-[min(100vw-1.5rem,34rem)] gap-0 overflow-hidden border border-white/[0.12] bg-gradient-to-b from-[#0f1419] via-[#0b0e14] to-[#080a0f] p-0 text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-[#22C55E]/10 sm:max-w-lg",
        )}
        overlayClassName="bg-black/70 backdrop-blur-md"
        closeButtonClassName="text-white/70 hover:text-white hover:bg-white/10"
      >
        <DialogHeader className="space-y-2 border-b border-white/[0.08] px-5 pb-4 pt-5 text-start sm:space-y-2.5 sm:px-6 sm:pb-5 sm:pt-6">
          <DialogTitle className="text-lg font-semibold leading-snug tracking-tight text-white sm:text-xl">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-white/58">
            {t("intro")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(70dvh,640px)] space-y-5 overflow-y-auto px-5 py-5 sm:space-y-6 sm:px-6">

          {/* ── One-click publish section ───────────────────────────────── */}
          {showPublishSection && (
            <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CloudUpload className="h-4 w-4 shrink-0 text-[#86efac]" />
                <p className="text-sm font-semibold text-[#86efac]">
                  {t("publishSectionTitle")}
                </p>
              </div>

              {/* Not connected nudge */}
              {!googlePlayConnected && (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200/90">
                  {t("publishNotConnected")}
                </p>
              )}

              {/* Idle */}
              {googlePlayConnected && publishState.phase === "idle" && (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-white/50">
                    {t("publishIdleHint", { locale: locale.toUpperCase() })}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setPublishState({ phase: "confirm" })}
                    className="h-9 w-full bg-[#22C55E] text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(34,197,94,0.4)] hover:bg-[#16a34a] disabled:opacity-45"
                  >
                    <CloudUpload className="me-2 h-4 w-4" />
                    {t("publishButton")}
                  </Button>
                </div>
              )}

              {/* Confirm */}
              {publishState.phase === "confirm" && (
                <div className="space-y-3">
                  <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100/90">
                    {t("publishConfirmWarning")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handlePublishConfirmed}
                      className="flex-1 bg-[#22C55E] text-sm font-semibold text-white hover:bg-[#16a34a]"
                    >
                      {t("publishConfirmYes")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPublishState({ phase: "idle" })}
                      className="flex-1 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      {t("publishConfirmCancel")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Publishing */}
              {publishState.phase === "publishing" && (
                <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/70">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#86efac]" />
                  {t("publishingInProgress")}
                </div>
              )}

              {/* Success */}
              {publishState.phase === "success" && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-300">
                        {t("publishSuccessTitle")}
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-200/70">
                        {t("publishSuccessHint", {
                          language: publishState.language.toUpperCase(),
                        })}
                        {publishState.authorizedEmail
                          ? ` · ${publishState.authorizedEmail}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPublishState({ phase: "idle" })}
                    className="w-full border-white/15 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    {t("publishAgain")}
                  </Button>
                </div>
              )}

              {/* Error */}
              {publishState.phase === "error" && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <div>
                      <p className="text-sm font-semibold text-red-300">
                        {t("publishErrorTitle")}
                      </p>
                      <p className="mt-0.5 text-xs text-red-200/70">
                        {publishState.message}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPublishState({ phase: "idle" })}
                    className="w-full border-white/15 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    {t("publishRetry")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Manual copy steps ──────────────────────────────────────── */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/40">
              {t("manualSectionTitle")}
            </p>
            <ol className="list-decimal space-y-3 ps-5 text-sm leading-relaxed text-white/74 marker:font-semibold marker:text-[#86efac]/90">
              <li>{t("step1")}</li>
              <li>{t("step2")}</li>
              <li>{t("step3")}</li>
              <li>{t("step4")}</li>
            </ol>
            <p className="mt-4 rounded-lg border border-[#86efac]/20 bg-[#22C55E]/10 px-3 py-2.5 text-start text-xs leading-relaxed text-[#bbf7d0]/95 sm:text-[13px]">
              {t("tipOpenConsoleTab")}
            </p>
          </div>

          <div className="space-y-4">
            <ExportFieldBox
              label={t("fieldLabels.appNameTitle")}
              value={clamped.title}
              disabled={disabled}
              onCopy={() => void onCopy("appNameTitle", clamped.title)}
              copyLabel={t("copyBlock")}
              valueClassName="max-h-40 font-mono text-[13px] leading-normal text-white/90"
            />
            <ExportFieldBox
              label={t("fieldLabels.shortDescription")}
              value={clamped.shortDescription}
              disabled={disabled}
              onCopy={() => void onCopy("shortDescription", clamped.shortDescription)}
              copyLabel={t("copyBlock")}
              valueClassName="max-h-48 font-mono text-[13px] leading-normal text-white/90"
            />
            <ExportFieldBox
              label={t("fieldLabels.fullDescription")}
              value={clamped.fullDescription}
              disabled={disabled}
              onCopy={() => void onCopy("fullDescription", clamped.fullDescription)}
              copyLabel={t("copyBlock")}
              valueClassName="max-h-[min(44vh,24rem)] min-h-[9rem] font-sans text-[13px] leading-relaxed text-white/90"
            />
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-white/[0.08] bg-black/25 px-5 py-4 sm:px-6 sm:py-5">
          <Button
            type="button"
            size="lg"
            disabled={disabled}
            className="h-12 w-full bg-[#22C55E] text-base font-semibold text-white shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] hover:bg-[#16a34a] disabled:opacity-45"
            onClick={() => void onCopyAllPlayConsole()}
          >
            {t("copyAllPlayConsole")}
          </Button>

          {onDownloadTxt ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                className="h-8 w-full shrink-0 border-white/18 bg-transparent text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white sm:w-auto"
                onClick={onDownloadTxt}
              >
                {t("downloadTxt")}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-white/40 sm:text-end">
                {t("pasteHint")}
              </p>
            </div>
          ) : (
            <p className="text-center text-[11px] leading-relaxed text-white/40 sm:text-start">
              {t("pasteHint")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ExportFieldBox ────────────────────────────────────────────────────────────

function ExportFieldBox(props: {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: () => void;
  disabled?: boolean;
  valueClassName: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.12] bg-black/25 ring-1 ring-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5 sm:px-4">
        <span className="text-sm font-semibold text-white/90">{props.label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.disabled}
          className="h-8 shrink-0 border-white/18 bg-white/[0.06] text-xs font-medium text-white/88 hover:bg-[#22C55E]/15 hover:text-[#ecfdf5]"
          onClick={props.onCopy}
        >
          {props.copyLabel}
        </Button>
      </div>
      <pre
        className={cn(
          "overflow-auto whitespace-pre-wrap break-words bg-black/20 p-3 sm:p-4",
          props.valueClassName,
        )}
      >
        {props.value}
      </pre>
    </div>
  );
}
