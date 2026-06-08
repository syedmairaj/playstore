"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HeroMockScreenAi,
  HeroMockScreenAso,
  HeroMockScreenKeywords,
} from "@/components/marketing/hero-product-mock-screens";
import { PixelPhoneFrame } from "@/components/ui/pixel-phone-frame";
import { cn } from "@/lib/utils";

const TABS = ["aso", "ai", "keywords"] as const;
export type HeroPhoneTab = (typeof TABS)[number];

const CYCLE_MS = 4500;
const MANUAL_COOLDOWN_MS = 9000;

function nextTab(current: HeroPhoneTab): HeroPhoneTab {
  const i = TABS.indexOf(current);
  return TABS[(i + 1) % TABS.length]!;
}

const panelMotion = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.985 },
};

const transitionSmooth = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const transitionInstant = { duration: 0 };

export function HeroInteractivePhone() {
  const t = useTranslations("hero");
  const locale = useLocale();
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<HeroPhoneTab>("aso");
  const [hoverPhone, setHoverPhone] = useState(false);
  const lastManualRef = useRef(0);

  const handleTabClick = useCallback((next: HeroPhoneTab) => {
    lastManualRef.current = Date.now();
    setTab(next);
  }, []);

  useEffect(() => {
    if (hoverPhone || reduceMotion) return undefined;
    const id = window.setInterval(() => {
      if (Date.now() - lastManualRef.current < MANUAL_COOLDOWN_MS) return;
      setTab((prev) => nextTab(prev));
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [hoverPhone, reduceMotion]);

  const isRtl = locale === "ar";
  const motionTransition =
    hoverPhone || reduceMotion ? transitionInstant : transitionSmooth;

  return (
    <div
      className="flex w-full max-w-[min(100%,320px)] flex-col gap-3"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <p className="min-w-0 text-start text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45 sm:flex-1 sm:pe-2">
          {t("phone.liveLabel")}
        </p>
        <span className="inline-flex w-fit shrink-0 self-end rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60 sm:self-start">
          {t("phone.interactiveBadge")}
        </span>
      </div>

      <PixelPhoneFrame
        onPointerEnter={() => setHoverPhone(true)}
        onPointerLeave={() => setHoverPhone(false)}
      >
        <div
          role="tablist"
          aria-label={t("phone.tabsAria")}
          className="relative z-20 flex gap-0.5 border-b border-white/[0.06] bg-black/30 p-1.5"
        >
          {TABS.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={tab === m}
              onClick={() => handleTabClick(m)}
              className={cn(
                "min-h-[40px] flex-1 cursor-pointer rounded-xl px-2 py-1.5 text-center text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/60 active:scale-[0.98]",
                tab === m
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/45 hover:bg-white/[0.04] hover:text-white/70",
              )}
            >
              {t(`preview.modes.${m}`)}
            </button>
          ))}
        </div>

        <div className="relative bg-[#0B0E14]">
          <div className="relative h-[min(420px,62vh)] min-h-[320px] overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                variants={panelMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={motionTransition}
                className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-4 pt-2"
              >
                {tab === "aso" ? (
                  <HeroMockScreenAso />
                ) : tab === "ai" ? (
                  <HeroMockScreenAi />
                ) : (
                  <HeroMockScreenKeywords />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </PixelPhoneFrame>
    </div>
  );
}
