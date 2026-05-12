"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

/** Syncs <html lang/dir> with the active next-intl locale (SSR root stays neutral). */
export function LocaleAttributes() {
  const locale = useLocale();

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
    root.classList.toggle("locale-ar", locale === "ar");
  }, [locale]);

  return null;
}
