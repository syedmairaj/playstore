"use client";

import { motion } from "framer-motion";
import { Gauge, Globe2, MessageSquareText, Radar, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
  },
};

type FeatureKey =
  | "asoScore"
  | "keywords"
  | "listing"
  | "competitor"
  | "reviews"
  | "localization";

const FEATURE_ROWS: { key: FeatureKey; icon: typeof Gauge }[] = [
  { key: "asoScore", icon: Gauge },
  { key: "keywords", icon: Search },
  { key: "listing", icon: Sparkles },
  { key: "competitor", icon: Radar },
  { key: "reviews", icon: MessageSquareText },
  { key: "localization", icon: Globe2 },
];

const hoverTransition = { type: "tween" as const, duration: 0.42, ease: [0.16, 1, 0.3, 1] as const };

export function FeatureShowcase() {
  const t = useTranslations("features");

  return (
    <motion.ul
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-48px" }}
      className="mt-16 grid auto-rows-fr gap-6 sm:mt-20 sm:grid-cols-2 sm:gap-7 lg:mt-24 lg:grid-cols-3"
    >
      {FEATURE_ROWS.map((f) => (
        <motion.li
          key={f.key}
          variants={item}
          className="flex min-h-0"
          whileHover={{ y: -6 }}
          transition={hoverTransition}
        >
          <div
            className={cn(
              "group relative flex h-full min-h-[17.5rem] w-full flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.07] bg-white/[0.045] p-6 shadow-[0_12px_48px_-20px_rgba(0,0,0,0.55)] backdrop-blur-[14px]",
              "transition-[box-shadow,border-color,background-color] duration-500 ease-out sm:min-h-[18.25rem] sm:p-7",
              "hover:border-[#22C55E]/32 hover:bg-white/[0.065]",
              "hover:shadow-[0_22px_56px_-18px_rgba(34,197,94,0.16),0_0_0_1px_rgba(34,197,94,0.06)_inset]",
            )}
          >
            <div
              className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#22C55E]/35 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                "bg-[#22C55E]/10 ring-1 ring-inset ring-[#22C55E]/18",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,box-shadow,background-color] duration-500 group-hover:bg-[#22C55E]/14 group-hover:shadow-[0_0_24px_-4px_rgba(34,197,94,0.35)]",
              )}
            >
              <f.icon
                className="h-7 w-7 text-[#22C55E] transition-transform duration-500 group-hover:scale-[1.04]"
                strokeWidth={1.65}
                aria-hidden
              />
            </div>
            <h3 className="mt-5 text-lg font-semibold leading-snug tracking-tight text-white sm:text-xl">
              {t(`${f.key}.title`)}
            </h3>
            <p className="mt-3 flex-1 text-[15px] leading-[1.65] text-white/58 sm:text-[0.9375rem]">
              {t(`${f.key}.body`)}
            </p>
            {f.key === "listing" ? (
              <p
                className={cn(
                  "mt-5 w-fit max-w-full rounded-lg border border-[#22C55E]/14 bg-[#22C55E]/8 px-2.5 py-1.5",
                  "text-[11px] font-medium leading-snug text-[#22C55E]/88 sm:text-xs",
                  "text-start shadow-[0_0_0_1px_rgba(34,197,94,0.04)_inset]",
                )}
                role="note"
              >
                {t("listing.aiBadge")}
              </p>
            ) : null}
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
