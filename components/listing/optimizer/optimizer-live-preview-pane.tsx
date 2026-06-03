"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { OptimizerMobilePreviewDrawer } from "@/components/listing/optimizer/optimizer-mobile-preview-drawer";
import {
  OptimizerPreviewInner,
  type OptimizerPreviewInnerProps,
} from "@/components/listing/optimizer/optimizer-preview-inner";
import { cn } from "@/lib/utils";

const PREVIEW_MINIMIZED_STORAGE_PREFIX = "optimizer-preview-minimized:";

/** Sticky offset under dashboard chrome. */
const STICKY_TOP_CLASS = "top-6";
const STICKY_TOP_PX = 24;
const STICKY_BOTTOM_PAD_PX = 24;

export type OptimizerLivePreviewPaneProps = OptimizerPreviewInnerProps & {
  workspaceId?: string;
};

function usePreviewStickyEnabled(mockupRef: React.RefObject<HTMLDivElement | null>) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const el = mockupRef.current;
    if (!el) return;

    const check = () => {
      const mockupH = el.getBoundingClientRect().height;
      setEnabled(
        window.innerHeight >= mockupH + STICKY_TOP_PX + STICKY_BOTTOM_PAD_PX + 16,
      );
    };

    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    check();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [mockupRef]);

  return enabled;
}

export function OptimizerLivePreviewPane({
  workspaceId,
  ...previewProps
}: OptimizerLivePreviewPaneProps) {
  const t = useTranslations("optimizer");
  const [minimized, setMinimized] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const stickyEnabled = usePreviewStickyEnabled(mockupRef);

  useEffect(() => {
    if (!workspaceId) return;
    try {
      const stored = sessionStorage.getItem(
        `${PREVIEW_MINIMIZED_STORAGE_PREFIX}${workspaceId}`,
      );
      if (stored === "1") setMinimized(true);
    } catch {
      /* sessionStorage unavailable */
    }
  }, [workspaceId]);

  const setMinimizedPersisted = useCallback(
    (next: boolean) => {
      setMinimized(next);
      if (!workspaceId) return;
      try {
        const key = `${PREVIEW_MINIMIZED_STORAGE_PREFIX}${workspaceId}`;
        if (next) sessionStorage.setItem(key, "1");
        else sessionStorage.removeItem(key);
      } catch {
        /* sessionStorage unavailable */
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || minimized) {
      setIsStuck(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-24px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [minimized]);

  if (minimized) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMinimizedPersisted(false)}
          aria-label={t("preview.showPreviewAria")}
          className={cn(
            "fixed bottom-6 z-30 hidden items-center gap-2 rounded-full border border-[#34A853]/40 bg-[#0a1210]/95 px-4 py-2.5 text-sm font-semibold text-[#d1fae5] shadow-[0_8px_32px_-10px_rgba(52,168,83,0.45)] backdrop-blur-md md:inline-flex",
            "transition-[transform,box-shadow,border-color] duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_12px_40px_-10px_rgba(52,168,83,0.55)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34A853]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c11]",
            "end-5 sm:end-6",
            previewProps.isRtl && "flex-row-reverse",
          )}
        >
          <Smartphone className="size-4 shrink-0 opacity-90" aria-hidden />
          <span className="whitespace-nowrap">{t("preview.showPreview")}</span>
        </button>
        <aside
          className="hidden min-h-[3rem] shrink-0 md:block md:w-[320px] md:max-w-[320px] lg:w-[380px] lg:max-w-[380px]"
          aria-hidden
        />
      </>
    );
  }

  return (
    <>
      <OptimizerMobilePreviewDrawer {...previewProps} />

      <aside
        dir={previewProps.isRtl ? "rtl" : "ltr"}
        className={cn(
          "relative hidden min-h-0 w-full shrink-0 flex-col bg-zinc-900/30 md:flex",
          "border-s border-zinc-800/70",
          "md:w-[320px] md:max-w-[320px] lg:w-[380px] lg:max-w-[380px]",
        )}
      >
        <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />

        <div
          className={cn(
            "z-10 flex flex-col items-center justify-center px-4 py-6 sm:px-6",
            stickyEnabled && cn("sticky", STICKY_TOP_CLASS, "min-h-[calc(100dvh-3rem)]"),
          )}
        >
          <OptimizerPreviewInner
            {...previewProps}
            phoneMeasureRef={mockupRef}
            isStuck={isStuck}
            showMinimize
            onMinimize={() => setMinimizedPersisted(true)}
          />
        </div>
      </aside>
    </>
  );
}
