"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Always-visible EN / عربي control; inner `dir="ltr"` keeps label order stable in RTL pages. */
export function LanguageSwitcher({
  className,
  surface = "default",
}: {
  className?: string;
  /** Dark marketing header: light pills on #0B0E14. */
  surface?: "default" | "dark";
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");

  function go(next: "en" | "ar") {
    if (next !== locale) router.replace(pathname, { locale: next });
  }

  return (
    <div
      dir="ltr"
      role="group"
      aria-label={t("language")}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full p-0.5 shadow-inner transition-shadow duration-200",
        surface === "dark"
          ? "border border-white/15 bg-white/[0.06] hover:border-white/25 hover:shadow-md"
          : "border border-border/80 bg-muted/50 hover:border-border hover:shadow-md",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => go("en")}
        className={cn(
          "min-w-[2.25rem] rounded-full px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 hover:scale-[1.03]",
          surface === "dark"
            ? locale === "en"
              ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
              : "text-white/55 hover:text-white"
            : locale === "en"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
              : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <span
        className={cn(
          "select-none px-0.5 text-[10px] font-medium",
          surface === "dark" ? "text-white/35" : "text-muted-foreground/60",
        )}
      >
        /
      </span>
      <button
        type="button"
        onClick={() => go("ar")}
        className={cn(
          "min-w-[2.25rem] rounded-full px-2.5 py-1.5 font-arabic text-[13px] font-semibold leading-none tracking-wide transition-all duration-200 hover:scale-[1.03]",
          surface === "dark"
            ? locale === "ar"
              ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
              : "text-white/55 hover:text-white"
            : locale === "ar"
              ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
              : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={locale === "ar"}
      >
        عربي
      </button>
    </div>
  );
}
