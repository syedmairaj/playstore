"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthModalTrigger } from "@/components/auth/auth-modal-trigger";
import { Button } from "@/components/ui/button";

export function CtaBand() {
  const t = useTranslations("ctaBand");

  return (
    <section className="relative mx-auto max-w-4xl overflow-hidden px-4 py-24 sm:px-6 sm:py-28">
      <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-[radial-gradient(ellipse_at_30%_20%,rgba(34,197,94,0.12),transparent_50%)] blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative rounded-3xl border border-white/[0.1] bg-white/[0.05] p-10 text-center shadow-xl shadow-black/30 backdrop-blur-[12px] sm:p-14"
      >
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
          {t("subtitle")}
        </p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <AuthModalTrigger
            intent="signup"
            label={t("primary")}
            className="h-12 min-w-[200px] border-0 bg-[#22C55E] text-base font-semibold text-white shadow-lg shadow-[#22C55E]/25 hover:bg-[#16a34a]"
          />
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 min-w-[200px] rounded-xl border-white/15 bg-white/[0.04] text-base font-semibold text-white hover:bg-white/[0.08]"
          >
            <Link href="/pricing">{t("secondary")}</Link>
          </Button>
        </div>
        <p className="mt-6 text-center text-xs text-white/50 sm:text-sm">
          {t("trustLine")}
        </p>
        <p className="mt-10 text-sm text-white/55">
          <a
            href="mailto:hello@playstore.xyz?subject=PlayStore"
            className="font-medium text-[#4285F4] hover:underline"
          >
            {t("contact")}
          </a>
        </p>
      </motion.div>
    </section>
  );
}
