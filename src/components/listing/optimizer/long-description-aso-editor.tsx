"use client";

import {
  Expand,
  PencilLine,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { KeywordHighlightTextarea } from "@/components/listing/optimizer/keyword-highlight-textarea";
import { ListingCharCounter } from "@/components/listing/optimizer/listing-char-counter";
import {
  LISTING_LONG_MAX,
  LISTING_LONG_WARN_FROM,
} from "@/components/listing/optimizer/listing-field-limits";
import type { ModularLongUiMode } from "@/lib/listing/modular-listing.types";
import { cn } from "@/lib/utils";

export type LongDescriptionAiTool =
  | "rewrite"
  | "expand"
  | "tone-professional"
  | "tone-casual";

type Props = {
  value: string;
  lockedKeywords: string[];
  isRtl?: boolean;
  busy?: boolean;
  longUiMode?: ModularLongUiMode;
  hasError?: boolean;
  errorMessage?: string;
  /** Draft state — blur overlay, block selection/copy until finalize. */
  draftMasked?: boolean;
  finalizeCreditCost?: number;
  finalizeBusy?: boolean;
  finalizeReady?: boolean;
  onCopyBlocked?: () => void;
  onFinalize?: () => void;
  onChange?: (value: string) => void;
  onGenerate?: () => void;
  onAiTool?: (tool: LongDescriptionAiTool) => void;
  onManualEdit?: () => void;
};

export function LongDescriptionAsoEditor({
  value,
  lockedKeywords,
  isRtl = false,
  busy = false,
  longUiMode = "choice",
  hasError = false,
  errorMessage,
  draftMasked = false,
  finalizeCreditCost = 5,
  finalizeBusy = false,
  finalizeReady = false,
  onCopyBlocked,
  onFinalize,
  onChange,
  onGenerate,
  onAiTool,
  onManualEdit,
}: Props) {
  const t = useTranslations("optimizer.results.modular.longEditor");
  const tModular = useTranslations("optimizer.results.modular");
  const hasContent = value.trim().length > 0;
  const showEditor = hasContent || longUiMode === "manual";

  if (!showEditor) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed border-sky-500/35 bg-sky-500/[0.06] px-6 py-10 text-center",
          isRtl && "font-arabic",
        )}
      >
        <Sparkles className="mb-3 size-8 text-sky-300/90" aria-hidden />
        <p className="max-w-md text-sm font-semibold text-white">{t("emptyTitle")}</p>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-white/55">
          {t("emptyBody")}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="mt-6 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 hover:bg-sky-500 disabled:opacity-50 sm:w-auto"
        >
          {busy ? (
            <RefreshCw className="size-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="size-4 shrink-0" aria-hidden />
          )}
          {t("generateCta")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onManualEdit}
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
        >
          <PencilLine className="size-3.5" aria-hidden />
          {t("manualStart")}
        </button>
      </div>
    );
  }

  const blockClipboard = (event: React.ClipboardEvent) => {
    if (!draftMasked) return;
    event.preventDefault();
    onCopyBlocked?.();
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3",
          draftMasked && "pointer-events-none opacity-60",
          isRtl && "text-end",
        )}
      >
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-sky-200/90">
          {t("aiToolsHeading")}
        </p>
        <div
          className={cn(
            "flex flex-wrap gap-2",
            isRtl && "flex-row-reverse justify-end",
          )}
        >
          <AiToolButton
            icon={<RefreshCw className="size-3.5" />}
            label={t("rewrite")}
            disabled={busy || !hasContent}
            onClick={() => onAiTool?.("rewrite")}
          />
          <AiToolButton
            icon={<Expand className="size-3.5" />}
            label={t("expand")}
            disabled={busy || !hasContent}
            onClick={() => onAiTool?.("expand")}
          />
          <AiToolButton
            label={t("toneProfessional")}
            disabled={busy || !hasContent}
            active={longUiMode === "ai"}
            onClick={() => onAiTool?.("tone-professional")}
          />
          <AiToolButton
            label={t("toneCasual")}
            disabled={busy || !hasContent}
            onClick={() => onAiTool?.("tone-casual")}
          />
          <AiToolButton
            icon={<PencilLine className="size-3.5" />}
            label={t("manuallyEdit")}
            disabled={busy}
            active={longUiMode === "manual"}
            onClick={onManualEdit}
          />
        </div>
        {lockedKeywords.length > 0 ? (
          <p className="mt-2.5 text-[10px] leading-relaxed text-emerald-200/70">
            {t("keywordHighlightHint", { count: lockedKeywords.length })}
          </p>
        ) : null}
      </div>

      <div
        className="relative"
        onCopy={blockClipboard}
        onCut={blockClipboard}
        style={draftMasked ? { userSelect: "none", WebkitUserSelect: "none" } : undefined}
      >
        <div
          className={cn(
            draftMasked && "pointer-events-none select-none blur-[4px] saturate-50",
          )}
          aria-hidden={draftMasked ? true : undefined}
        >
          <KeywordHighlightTextarea
            id="modular-long-description"
            value={value}
            onChange={(next) => onChange?.(next)}
            lockedKeywords={lockedKeywords}
            disabled={busy || draftMasked}
            isRtl={isRtl}
            rows={12}
            maxLength={LISTING_LONG_MAX}
            label={t("fieldLabel")}
            counterId="modular-long-count"
            placeholder={t("placeholder")}
            counter={
              <ListingCharCounter
                id="modular-long-count"
                current={value.length}
                max={LISTING_LONG_MAX}
                warnFrom={LISTING_LONG_WARN_FROM}
              />
            }
          />
        </div>

        {draftMasked ? (
          <div
            className={cn(
              "absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl border border-amber-500/30 bg-gradient-to-b from-black/55 via-black/70 to-black/80 px-4 py-6 text-center backdrop-blur-[2px]",
              isRtl && "font-arabic",
            )}
          >
            <p className="max-w-md text-sm font-semibold leading-snug text-amber-100/95">
              {tModular("draftMask.finalizeUnlockCta", { credits: finalizeCreditCost })}
            </p>
            {onFinalize ? (
              <button
                type="button"
                disabled={finalizeBusy || !hasContent || !finalizeReady}
                onClick={onFinalize}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_28px_-8px_rgba(16,185,129,0.55)] ring-2 ring-emerald-500/35 hover:bg-emerald-500 disabled:opacity-50"
              >
                {finalizeBusy ? (
                  <RefreshCw className="size-4 animate-spin" aria-hidden />
                ) : null}
                {tModular("finalizeCta", { credits: finalizeCreditCost })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {busy ? (
        <p className="flex items-center gap-2 text-xs text-sky-200/80" role="status">
          <RefreshCw className="size-3.5 animate-spin" aria-hidden />
          {t("generating")}
        </p>
      ) : null}

      {hasError && !hasContent && errorMessage ? (
        <p
          role="alert"
          className={cn(
            "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-100/95",
            isRtl && "text-end",
          )}
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function AiToolButton({
  label,
  icon,
  disabled,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-45",
        active
          ? "border-sky-400/50 bg-sky-500/20 text-sky-100"
          : "border-zinc-700 bg-zinc-900/80 text-white/80 hover:bg-zinc-800",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
