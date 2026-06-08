"use client";

import { type ComponentProps, useCallback, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  isValidPlayStorePackageId,
  playStoreAppDetailsUrl,
} from "@/lib/keywords/play-store-details-url";
import { cn } from "@/lib/utils";

export type CompetitorSpyOpenPlayButtonProps = {
  packageId: string | null | undefined;
  isRtl?: boolean;
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
};

export function CompetitorSpyOpenPlayButton({
  packageId,
  isRtl,
  className,
  size = "default",
  variant = "outline",
}: CompetitorSpyOpenPlayButtonProps) {
  const t = useTranslations("competitorSpy.playStore");
  const [opening, setOpening] = useState(false);

  const raw = typeof packageId === "string" ? packageId : "";
  const valid = isValidPlayStorePackageId(raw);
  const url = valid ? playStoreAppDetailsUrl(raw) : "";

  const onClick = useCallback(() => {
    if (!valid || !url) return;
    setOpening(true);
    window.open(url, "_blank", "noopener,noreferrer");
    const reset = () => setOpening(false);
    requestAnimationFrame(() => {
      setTimeout(reset, 200);
    });
  }, [valid, url]);

  const unavailable = t("packageUnavailable");
  const labelOpen = t("open");
  const iconCls =
    size === "sm" ? "size-3.5 shrink-0 opacity-90" : "size-4 shrink-0 opacity-90";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={!valid || opening}
      onClick={onClick}
      title={!valid ? unavailable : undefined}
      aria-label={!valid ? unavailable : labelOpen}
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(className)}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {opening ? (
          <Loader2 className={cn(iconCls, "animate-spin")} aria-hidden />
        ) : (
          <ExternalLink className={iconCls} aria-hidden />
        )}
        {opening ? t("opening") : labelOpen}
      </span>
    </Button>
  );
}
