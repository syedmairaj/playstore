"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function FeaturesRoadmap() {
  const t = useTranslations("featuresPage");

  const phases = [
    {
      key: "now" as const,
      items: [t("now1"), t("now2"), t("now3"), t("now4")],
    },
    {
      key: "next" as const,
      items: [t("next1"), t("next2"), t("next3")],
    },
    {
      key: "later" as const,
      items: [t("later1"), t("later2")],
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45 }}
      className="mt-24 border-t border-white/[0.08] pt-20"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {t("roadmapTitle")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-base">
          {t("roadmapIntro")}
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-3 sm:gap-6">
        {phases.map((phase) => (
          <div
            key={phase.key}
            className="rounded-3xl border border-white/[0.08] bg-white/[0.05] p-6 text-start shadow-lg shadow-black/20 backdrop-blur-[12px] transition-colors duration-200 hover:border-[#22C55E]/30 hover:bg-white/[0.07]"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#22C55E]">
              {t(`${phase.key}Label`)}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-white/60">
              {phase.items.map((line) => (
                <li key={line} className="flex gap-2">
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#22C55E]/70"
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
