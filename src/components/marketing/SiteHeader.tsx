"use client";

import { Menu } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PlayStoreLogo } from "./PlayStoreLogo";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { href: "/features", key: "features" as const },
  { href: "/pricing", key: "pricing" as const },
  { href: "/blog", key: "blog" as const },
];

export function SiteHeader() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sheetSide = locale === "ar" ? "left" : "right";

  return (
    <motion.header
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0B0E14]/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#0B0E14]/65"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-0.5 rounded-lg outline-none ring-offset-[#0B0E14] transition-all duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#22C55E]/60 active:scale-[0.99]"
        >
          <PlayStoreLogo size="md" brand="play" />
        </Link>

        <nav className="hidden flex-1 justify-center gap-0.5 md:flex">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-white/55 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <LanguageSwitcher surface="dark" className="shrink-0" />
          <ThemeToggle />
          <AuthModalTrigger
            intent="signin"
            label={t("signIn")}
            variant="ghost"
            className="hidden h-10 px-3 text-sm font-medium text-white/80 hover:bg-white/[0.06] hover:text-white sm:inline-flex"
          />
          <AuthModalTrigger
            intent="signup"
            label={t("startTrial")}
            variant="default"
            className="hidden h-10 border-0 bg-[#22C55E] px-4 text-sm font-semibold text-white shadow-md shadow-[#22C55E]/20 hover:bg-[#16a34a] sm:inline-flex"
          />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/[0.08] md:hidden"
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={sheetSide}
              className="w-[min(100%,22rem)] border-white/10 bg-[#0B0E14]/98 text-white backdrop-blur-xl"
            >
              <SheetHeader>
                <SheetTitle className="text-start font-semibold text-white">
                  {t("menu")}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-8 flex flex-col gap-1">
                {nav.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl px-3 py-3 text-base font-medium text-white/90 transition hover:bg-white/[0.06]"
                  >
                    {t(item.key)}
                  </Link>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6">
                <p className="text-xs font-medium uppercase tracking-wide text-white/45">
                  {t("language")}
                </p>
                <LanguageSwitcher surface="dark" />
                <AuthModalTrigger
                  intent="signin"
                  label={t("signIn")}
                  variant="outline"
                  className="h-11 w-full border-white/15 bg-transparent text-base font-semibold text-white hover:bg-white/[0.06]"
                />
                <AuthModalTrigger
                  intent="signup"
                  label={t("startTrial")}
                  variant="default"
                  className="h-11 w-full border-0 bg-[#22C55E] text-base font-semibold text-white shadow-lg shadow-[#22C55E]/25 hover:bg-[#16a34a]"
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}
