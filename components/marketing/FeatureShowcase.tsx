"use client";

import { motion } from "framer-motion";
import {
  Gauge,
  Globe2,
  ImageIcon,
  Radar,
  Search,
  Sparkles,
} from "lucide-react";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  display: "swap",
});

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const cardShell =
  "relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[#0B0E14] p-10 transition-[border-color,box-shadow] duration-300 ease-out hover:border-[#34A853] hover:shadow-[0_0_0_1px_rgba(52,168,83,0.12),0_20px_56px_-18px_rgba(52,168,83,0.28)]";

const cardTitle = "mt-5 text-lg font-semibold tracking-tight text-white sm:text-xl";

const cardBody =
  "mt-3 text-pretty text-[0.9375rem] leading-relaxed text-white/58 sm:text-base";

const iconWrap =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[#34A853] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

export function FeatureShowcase() {
  const t = useTranslations("features");

  return (
    <motion.div
      role="list"
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-56px" }}
      className={cn(
        "mt-16 grid grid-cols-1 gap-6 sm:mt-20 sm:gap-7",
        "md:grid-cols-2",
        "lg:mt-24 lg:grid-cols-3 lg:gap-8",
      )}
    >
      {/* Row 1 — AI Listing Optimizer (hero, 2 cols) */}
      <motion.article
        role="listitem"
        variants={item}
        className="md:col-span-2 lg:col-span-2 lg:row-start-1"
      >
        <div className={cn(cardShell, "min-h-[17rem] lg:min-h-[18.5rem]")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className={iconWrap}>
              <Sparkles className="h-6 w-6" strokeWidth={1.65} aria-hidden />
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#34A853]/35 bg-[#34A853]/12 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-50 shadow-[0_0_24px_-8px_rgba(52,168,83,0.45)]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#34A853] shadow-[0_0_10px_2px_rgba(52,168,83,0.5)]"
                aria-hidden
              />
              {t("optimizer.aiPoweredBadge")}
            </p>
          </div>
          <h3 className={cn(cardTitle, "mt-6")}>{t("optimizer.title")}</h3>
          <p className={cardBody}>{t("optimizer.body")}</p>
        </div>
      </motion.article>

      {/* Row 1 — AI Logo Generator */}
      <motion.article
        role="listitem"
        variants={item}
        className="md:col-span-2 lg:col-span-1 lg:row-start-1"
      >
        <div className={cn(cardShell, "min-h-[17rem] lg:min-h-[18.5rem]")}>
          <div className={iconWrap}>
            <ImageIcon className="h-6 w-6" strokeWidth={1.65} aria-hidden />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#4285F4]">
            {t("logoGenerator.headline")}
          </p>
          <h3 className={cn(cardTitle, "mt-2")}>{t("logoGenerator.title")}</h3>
          <p className={cardBody}>{t("logoGenerator.body")}</p>
        </div>
      </motion.article>

      {/* Row 2 — three equal */}
      <motion.article role="listitem" variants={item} className="lg:col-span-1">
        <div className={cardShell}>
          <div className={iconWrap}>
            <Search className="h-6 w-6" strokeWidth={1.65} aria-hidden />
          </div>
          <h3 className={cardTitle}>{t("keywords.title")}</h3>
          <p className={cardBody}>{t("keywords.body")}</p>
        </div>
      </motion.article>

      <motion.article role="listitem" variants={item} className="lg:col-span-1">
        <div className={cardShell}>
          <div className={iconWrap}>
            <Radar className="h-6 w-6" strokeWidth={1.65} aria-hidden />
          </div>
          <h3 className={cardTitle}>{t("competitor.title")}</h3>
          <p className={cardBody}>{t("competitor.body")}</p>
        </div>
      </motion.article>

      <motion.article role="listitem" variants={item} className="lg:col-span-1">
        <div className={cardShell}>
          <div className={iconWrap}>
            <Globe2 className="h-6 w-6" strokeWidth={1.65} aria-hidden />
          </div>
          <h3 className={cardTitle}>{t("localization.title")}</h3>
          <p className={cardBody}>{t("localization.body")}</p>
          <div className="mt-6 space-y-3 rounded-2xl border border-white/[0.06] bg-black/25 p-4">
            <p className="text-sm leading-snug text-white/75">{t("localization.sampleEn")}</p>
            <div className="h-px bg-white/[0.08]" aria-hidden />
            <div className={cn(ibmPlexSansArabic.className, "space-y-2")}>
              <p className="text-[1rem] font-semibold leading-normal text-white/85 sm:text-lg">
                {t("localization.arabicScriptLabel")}
              </p>
              <p className="text-[1.05rem] font-medium leading-relaxed text-white/88 sm:text-lg" dir="rtl">
                {t("localization.sampleAr")}
              </p>
            </div>
          </div>
        </div>
      </motion.article>

      {/* Row 3 — Performance accent */}
      <motion.article
        role="listitem"
        variants={item}
        className="md:col-span-2 lg:col-span-3 lg:flex lg:justify-center"
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-3xl p-px",
            "bg-gradient-to-br from-[#34A853]/55 via-[#4285F4]/25 to-[#34A853]/40",
            "shadow-[0_24px_64px_-28px_rgba(52,168,83,0.35)]",
            "lg:max-w-3xl",
          )}
        >
          <div
            className={cn(
              "flex h-full min-h-[12.5rem] flex-col rounded-[calc(1.5rem-1px)] bg-[#0B0E14] p-10",
              "transition-[box-shadow] duration-300 ease-out",
              "hover:shadow-[inset_0_0_0_1px_rgba(52,168,83,0.12),0_0_48px_-12px_rgba(52,168,83,0.2)]",
            )}
          >
            <div className="flex flex-wrap items-start gap-5">
              <div className={iconWrap}>
                <Gauge className="h-6 w-6" strokeWidth={1.65} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {t("performance.title")}
                </h3>
                <p className="mt-2 max-w-prose text-pretty text-sm leading-relaxed text-white/58 sm:text-base">
                  {t("performance.body")}
                </p>
              </div>
            </div>
            <div className="mt-8">
              <p className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {t("performance.stat")}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                {t("performance.progressLabel")}
              </p>
              <div
                className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
                role="presentation"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#34A853] to-[#2d8f47]"
                  style={{ width: "90%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
}
