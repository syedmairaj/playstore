"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const STATUS_KEYS = ["status1", "status2", "status3"] as const;
const CYCLE_MS = 2000;

type Props = {
  isRtl?: boolean;
};

export function OptimizerActiveAuditorStatus({ isRtl = false }: Props) {
  const t = useTranslations("optimizer.results.loading");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % STATUS_KEYS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  const activeKey = STATUS_KEYS[index]!;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("auditorAria")}
      className={cn(
        "flex min-h-[1.75rem] items-center gap-2.5 text-sm font-medium text-white/72",
        isRtl && "flex-row-reverse",
      )}
    >
      <span
        className="relative flex size-2 shrink-0 items-center justify-center"
        aria-hidden
      >
        <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-400/40 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]" />
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={activeKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={cn(
              "truncate text-start leading-snug tracking-tight text-white/78",
              isRtl && "text-end",
            )}
          >
            {t(activeKey)}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
