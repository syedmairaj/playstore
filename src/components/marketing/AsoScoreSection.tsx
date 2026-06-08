"use client";

import { motion } from "framer-motion";
import { ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const SCORE_FALLBACK = 95;

const cardShell = cn(
  "relative overflow-hidden rounded-3xl border border-[rgba(255,255,255,0.08)] p-8 sm:p-10",
  "bg-gradient-to-br from-[#34A853]/[0.07] via-[#0B0E14] to-[#0B0E14]",
  "shadow-[inset_0_1px_0_0_rgba(52,168,83,0.08),0_0_48px_-18px_rgba(52,168,83,0.18)]",
);

const iconWrap =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[#34A853] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

export function AsoScoreSection() {
  const t = useTranslations("marketing.asoScore");
  const scoreValue = t("scoreValue");
  const scoreMax = t("scoreMax");
  const parsed = Number.parseInt(scoreValue.replace(/\D/g, ""), 10);
  const pct = Math.min(100, Math.max(0, Number.isFinite(parsed) ? parsed : SCORE_FALLBACK));
  const ringDeg = (pct / 100) * 360;

  return (
    <section
      aria-labelledby="aso-score-heading"
      className="border-b border-white/[0.06] bg-[#0B0E14] px-4 py-20 sm:px-6 sm:py-28"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-48px" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={cn(cardShell, "order-1")}
          >
            <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#34A853]/20 blur-3xl" />
            </div>

            <div className="relative flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-3">
                <div className={iconWrap}>
                  <ClipboardCheck className="h-5 w-5" strokeWidth={1.65} aria-hidden />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                  {t("auditLabel")}
                </p>
              </div>

              <div
                className="relative mx-auto mt-8 flex h-[9.5rem] w-[9.5rem] items-center justify-center sm:mt-10 sm:h-44 sm:w-44"
                style={{
                  background: `conic-gradient(from -90deg, #34A853 0deg ${ringDeg}deg, rgba(255,255,255,0.08) ${ringDeg}deg 360deg)`,
                  borderRadius: "9999px",
                  padding: "5px",
                }}
                role="img"
                aria-label={t("scoreAria", { value: scoreValue, max: scoreMax })}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#0B0E14] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                  <span className="text-[2.35rem] font-bold tabular-nums tracking-tight text-white sm:text-[2.6rem]">
                    {scoreValue}
                  </span>
                  <span className="-mt-0.5 text-sm font-medium tabular-nums text-white/45">
                    /{scoreMax}
                  </span>
                </div>
              </div>

              <p className="mt-8 max-w-md text-pretty text-sm leading-relaxed text-white/58 sm:mt-10 sm:text-[0.9375rem]">
                {t("verifyLine")}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-48px" }}
            transition={{ duration: 0.5, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="order-2 lg:ps-2"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#22C55E]">
              {t("eyebrow")}
            </p>
            <h2
              id="aso-score-heading"
              className="mt-4 text-3xl font-bold tracking-tight text-white sm:mt-5 sm:text-4xl sm:leading-[1.1]"
            >
              {t("headline")}
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/55 sm:mt-6 sm:text-lg">
              {t("subtext")}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
