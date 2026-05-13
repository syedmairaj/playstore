"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { buildLogoDownloadFilename } from "@/lib/listing/logo-download-filename";
import {
  LISTING_LOGO_STYLES,
  type ListingLogoStyle,
} from "@/lib/validation/listing-logo-generate-body";
import { cn } from "@/lib/utils";

type LogoGenOk = {
  ok: true;
  images: string[];
  meta?: { creditsCharged?: number; creditsRemaining?: number };
};

type LogoGenErr = {
  ok: false;
  error: {
    code?: string;
    message: string;
    remaining?: number;
    required?: number;
  };
};

function LogoSkeletonTile() {
  return (
    <div
      className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-1.5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.05]"
      aria-hidden
    >
      <div className="absolute inset-1.5 animate-logo-skeleton-shimmer rounded-[22%] bg-gradient-to-r from-transparent via-white/[0.09] to-transparent bg-[length:180%_100%]" />
    </div>
  );
}

export function LogoGeneratorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  appId: string;
  appName: string;
  category: string;
  shortDescription: string;
  creditsRemaining: number | null;
  onCreditsRemaining: (n: number) => void;
  /** Called first on successful PATCH so the parent can update live preview without waiting for refetch. */
  onLogoSelected: (httpsUrl: string) => void;
}) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("optimizer.logo");
  const creditCost = AI_CREDIT_COSTS.listing_logo_generation;
  const [style, setStyle] = useState<ListingLogoStyle>("Modern");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setSelected(null);
  }, [props.open]);

  async function runGenerate() {
    if (
      typeof props.creditsRemaining === "number" &&
      props.creditsRemaining < creditCost
    ) {
      toast.message(t("insufficientTitle"), {
        description: t("insufficientBody", {
          rem: props.creditsRemaining,
          req: creditCost,
        }),
      });
      return;
    }
    setBusy(true);
    setImages([]);
    setSelected(null);
    const toastId = toast.loading(t("generating"));
    try {
      const res = await fetch("/api/listings/logo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId,
          appId: props.appId,
          appName: props.appName,
          category: props.category,
          ...(props.shortDescription.trim()
            ? { shortDescription: props.shortDescription.trim() }
            : {}),
          style,
        }),
      });
      const json = (await res.json()) as LogoGenOk | LogoGenErr;
      toast.dismiss(toastId);
      if (!json.ok) {
        if (res.status === 402 || json.error.code === "insufficient_credits") {
          const rem = json.error.remaining;
          const req =
            typeof json.error.required === "number"
              ? json.error.required
              : creditCost;
          if (typeof rem === "number") {
            props.onCreditsRemaining(rem);
          }
          toast.message(t("insufficientTitle"), {
            description:
              typeof rem === "number"
                ? t("insufficientBody", { rem, req })
                : json.error.message,
          });
        } else if (
          res.status === 503 &&
          json.error.code === "logo_generation_unconfigured"
        ) {
          toast.error(t("errors.unconfigured"));
        } else {
          toast.error(
            json.error.message?.trim()
              ? json.error.message
              : t("errors.generationFailed"),
          );
        }
        return;
      }
      setImages(json.images);
      if (typeof json.meta?.creditsRemaining === "number") {
        props.onCreditsRemaining(json.meta.creditsRemaining);
      }
      toast.success(t("generateSuccess"));
    } catch {
      toast.dismiss(toastId);
      toast.error(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function fetchRemoteImageBlob(url: string): Promise<Blob | null> {
    try {
      const res = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  async function blobTo512PngBlob(blob: Blob): Promise<Blob | null> {
    let bmp: ImageBitmap | undefined;
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return null;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, 512, 512);
      const w = bmp.width;
      const h = bmp.height;
      const scale = Math.min(512 / w, 512 / h);
      const dw = w * scale;
      const dh = h * scale;
      const ox = (512 - dw) / 2;
      const oy = (512 - dh) / 2;
      ctx.drawImage(bmp, ox, oy, dw, dh);
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });
    } finally {
      bmp.close();
    }
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function variantIndex(url: string): number {
    const idx = images.findIndex((u) => u === url);
    return idx >= 0 ? idx : 0;
  }

  async function downloadPlay512(url: string) {
    const index = variantIndex(url);
    const blob = await fetchRemoteImageBlob(url);
    if (!blob) {
      toast.message(t("downloadCorsTitle"), {
        description: t("downloadCorsBody"),
      });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const png = await blobTo512PngBlob(blob);
    if (!png) {
      toast.error(t("downloadPrepareFailed"));
      return;
    }
    triggerBlobDownload(
      png,
      buildLogoDownloadFilename({
        appName: props.appName,
        category: props.category,
        imageUrl: url,
        index,
        exportTag: "512",
      }),
    );
  }

  async function downloadHighRes(url: string) {
    const index = variantIndex(url);
    const blob = await fetchRemoteImageBlob(url);
    if (!blob) {
      toast.message(t("downloadCorsTitle"), {
        description: t("downloadCorsBody"),
      });
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    triggerBlobDownload(
      blob,
      buildLogoDownloadFilename({
        appName: props.appName,
        category: props.category,
        imageUrl: url,
        index,
        exportTag: "1024",
      }),
    );
  }

  async function applyIcon(url: string) {
    if (!/^https:\/\//i.test(url)) {
      toast.message(t("httpsOnlyTitle"), { description: t("httpsOnlyBody") });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${props.workspaceId}/apps/${props.appId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icon_url: url }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!res.ok || json.ok !== true) {
        toast.error(json.error?.message ?? t("applyError"));
        return;
      }
      props.onLogoSelected(url);
      toast.success(t("logoUpdated"));
      props.onOpenChange(false);
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(false);
    }
  }

  const showSkeletonGrid = busy && images.length === 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className={cn(
          "max-h-[min(92vh,860px)] max-w-[min(96vw,720px)] overflow-y-auto border border-white/[0.1] bg-[#0c1018] p-0 text-white shadow-2xl sm:rounded-2xl",
          isAr && "font-arabic",
        )}
        overlayClassName="bg-black/70 backdrop-blur-md"
      >
        <div className="space-y-8 p-7 sm:p-10">
          <DialogHeader className="space-y-3 text-start sm:space-y-3.5">
            <DialogTitle className="text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
              {t("title")}
            </DialogTitle>
            <p className="text-[15px] leading-relaxed text-white/72 sm:text-base">
              {t("subtitle")}
            </p>
            <p className="text-sm leading-relaxed text-amber-200/90 sm:text-[15px]">
              {t("creditsWarning", { credits: creditCost })}
            </p>
            <p className="text-xs leading-relaxed text-white/50 sm:text-[13px]">{t("sizeNote")}</p>
          </DialogHeader>

          <div className="space-y-3">
            <label className="text-xs font-medium text-white/70" htmlFor="logo-style">
              {t("styleLabel")}
            </label>
            <select
              id="logo-style"
              disabled={busy}
              value={style}
              onChange={(e) => setStyle(e.target.value as ListingLogoStyle)}
              className="w-full max-w-md rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]"
            >
              {LISTING_LOGO_STYLES.map((s) => (
                <option key={s} value={s}>
                  {t(`styles.${s}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void runGenerate();
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? (
                <>
                  <Loader2
                    className="size-4 shrink-0 opacity-90 motion-reduce:opacity-70 motion-reduce:animate-none motion-safe:animate-[spin_1.35s_linear_infinite]"
                    aria-hidden
                  />
                  <span>{t("generatingShort")}</span>
                </>
              ) : images.length ? (
                t("regenerate")
              ) : (
                t("generate")
              )}
            </button>
          </div>

          {showSkeletonGrid ? (
            <div className="space-y-4">
              <p className="text-xs text-white/50">{t("generating")}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
                {[0, 1, 2, 3].map((i) => (
                  <LogoSkeletonTile key={i} />
                ))}
              </div>
            </div>
          ) : null}

          {images.length > 0 ? (
            <div className="space-y-6">
              <p className="text-xs leading-relaxed text-white/50 sm:text-[13px]">{t("pickHint")}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
                {images.map((src, i) => (
                  <button
                    key={`${i}-${src.slice(0, 48)}`}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(src)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/35 p-1.5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45),0_14px_28px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]",
                      "transition-[transform,box-shadow,border-color,opacity,ring-color] duration-200 ease-out will-change-transform",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018]",
                      "motion-safe:hover:-translate-y-[2px] motion-safe:hover:border-[#22C55E]/45 motion-safe:hover:shadow-[0_8px_20px_-6px_rgba(34,197,94,0.22),0_20px_40px_-16px_rgba(0,0,0,0.55)] motion-safe:hover:ring-[#22C55E]/15",
                      selected === src
                        ? "border-[#22C55E]/60 ring-2 ring-[#22C55E]/40 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.28),0_18px_36px_-14px_rgba(0,0,0,0.55)]"
                        : "hover:border-white/[0.12]",
                      busy && "pointer-events-none opacity-55",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="aspect-square w-full rounded-[22%] object-cover [image-rendering:auto] transition-[opacity,transform] duration-200 motion-safe:group-hover:scale-[1.02] motion-safe:group-hover:opacity-95"
                    />
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
                <button
                  type="button"
                  disabled={busy || !selected}
                  onClick={() => selected && void applyIcon(selected)}
                  className="inline-flex min-h-[40px] min-w-[10rem] flex-1 items-center justify-center rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(34,197,94,0.45)] transition hover:bg-[#16a34a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                >
                  {t("useThis")}
                </button>
                <button
                  type="button"
                  disabled={busy || !selected}
                  onClick={() => selected && void downloadPlay512(selected)}
                  className="inline-flex min-h-[40px] min-w-[10rem] flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:border-[#22C55E]/45 hover:bg-[#22C55E]/12 hover:text-[#ecfdf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                >
                  {t("download512")}
                </button>
                <button
                  type="button"
                  disabled={busy || !selected}
                  onClick={() => selected && void downloadHighRes(selected)}
                  className="inline-flex min-h-[40px] min-w-[10rem] flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:border-[#22C55E]/45 hover:bg-[#22C55E]/12 hover:text-[#ecfdf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1018] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                >
                  {t("download1024")}
                </button>
              </div>
              <p className="text-balance text-center text-[11px] leading-relaxed text-[#86efac]/88 sm:text-start sm:text-xs">
                {t("playStoreIconNote")}
              </p>
              <p className="text-[11px] leading-relaxed text-white/42 sm:text-xs">{t("downloadHint")}</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
