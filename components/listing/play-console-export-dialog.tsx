"use client";

import { useTranslations } from "next-intl";
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

export function PlayConsoleExportDialog({
  open,
  onOpenChange,
  dir,
  clamped,
  onCopy,
  onCopyAllPlayConsole,
  onDownloadTxt,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dir: "rtl" | "ltr";
  clamped: PlayConsoleClampedListing;
  onCopy: (
    field: PlayConsoleExportCopyField,
    text: string,
  ) => void | Promise<void>;
  onCopyAllPlayConsole: () => void | Promise<void>;
  onDownloadTxt?: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("optimizer.results.exportModal");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        className={cn(
          "max-h-[min(92dvh,880px)] max-w-[min(100vw-1.5rem,34rem)] gap-0 overflow-hidden border border-white/[0.12] bg-gradient-to-b from-[#0f1419] via-[#0b0e14] to-[#080a0f] p-0 text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] sm:max-w-lg",
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
          <ol className="list-decimal space-y-3 ps-5 text-sm leading-relaxed text-white/74 marker:font-semibold marker:text-[#86efac]/90">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
            <li>{t("step4")}</li>
          </ol>

          <p className="rounded-lg border border-[#86efac]/20 bg-[#22C55E]/10 px-3 py-2.5 text-start text-xs leading-relaxed text-[#bbf7d0]/95 sm:text-[13px]">
            {t("tipOpenConsoleTab")}
          </p>

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
