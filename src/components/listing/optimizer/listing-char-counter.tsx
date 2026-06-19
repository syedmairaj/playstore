"use client";

import { useTranslations } from "next-intl";
import {
  charCountToneClass,
  listingCountTone,
} from "@/components/listing/optimizer/listing-field-limits";
import { cn } from "@/lib/utils";

type Props = {
  current: number;
  max: number;
  warnFrom?: number;
  id?: string;
  className?: string;
};

export function ListingCharCounter({
  current,
  max,
  warnFrom,
  id,
  className,
}: Props) {
  const t = useTranslations("optimizer");
  const effectiveWarn = warnFrom ?? Math.floor(max * 0.9);

  return (
    <span
      id={id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "text-[12px] font-medium tabular-nums tracking-tight",
        charCountToneClass(
          listingCountTone(current, max, effectiveWarn),
        ),
        className,
      )}
    >
      {t("results.charCount", { current, max })}
    </span>
  );
}
