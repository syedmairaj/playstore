"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";
import { HeroInteractivePhone } from "@/components/marketing/HeroInteractivePhone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Marketing hero: midnight shell, Geist (app font), RTL-aware layout,
 * interactive phone preview with auto-cycling tabs (see HeroInteractivePhone).
 */
export function AnimatedHero() {
  const t = useTranslations("hero");

  return (
    <section className="relative overflow-hidden border-b border-white/[0.06] bg-[#0B0E14] px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-16">
      <div className="pointer-events-none absolute inset-0 opacity-90" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(34,197,94,0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_90%_20%,rgba(66,133,244,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_10%_80%,rgba(34,197,94,0.06),transparent_45%)]" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-14 lg:flex-row lg:items-center lg:gap-16">
        <div className="min-w-0 flex-1 text-center lg:max-w-xl lg:text-start">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] px-4 py-1.5 text-xs font-semibold tracking-wide text-white/70 shadow-sm backdrop-blur-[12px]"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" aria-hidden />
            {t("eyebrow")}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.04 }}
            className="mt-7 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.1rem] lg:leading-[1.1]"
          >
            {t("headline")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/60 sm:text-xl lg:mx-0"
          >
            {t("sub")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-11 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 lg:justify-start"
          >
            <AuthModalTrigger
              intent="signup"
              label={t("ctaPrimary")}
              className={cn(
                "hero-cta-breathe relative h-12 w-full min-w-[220px] overflow-hidden rounded-xl border-0 bg-[#22C55E] text-base font-bold text-white sm:w-auto",
                "transition-colors duration-200 hover:bg-[#4ade80]",
              )}
            />
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-xl border-white/15 bg-white/[0.04] text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/[0.08] sm:w-auto"
            >
              <Link href="/features">{t("ctaSecondary")}</Link>
            </Button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.26 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/50 lg:justify-start"
          >
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-1 shrink-0 rounded-full bg-[#22C55E]/90" aria-hidden />
              {t("trustBar.noCard")}
            </span>
            <span className="hidden text-white/25 sm:inline" aria-hidden>
              ·
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-1 shrink-0 rounded-full bg-[#22C55E]/90" aria-hidden />
              {t("trustBar.cancel")}
            </span>
            <span className="hidden text-white/25 sm:inline" aria-hidden>
              ·
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1 w-1 shrink-0 rounded-full bg-[#22C55E]/90" aria-hidden />
              {t("trustBar.secure")}
            </span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.3 }}
            className="mx-auto mt-4 max-w-xl text-center text-sm font-medium leading-relaxed text-white/70 lg:mx-0 lg:text-start"
          >
            {t("trustStrong")}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.36 }}
            className="mt-2 text-xs text-white/45"
          >
            {t("trust")}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className={cn(
            "flex w-full shrink-0 justify-center lg:flex-1 lg:justify-end",
            "pt-2 lg:pt-0",
          )}
        >
          <HeroInteractivePhone />
        </motion.div>
      </div>
    </section>
  );
}
