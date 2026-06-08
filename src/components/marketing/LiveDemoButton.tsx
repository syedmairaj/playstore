"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function LiveDemoButton({ className }: { className?: string }) {
  const t = useTranslations("marketing");

  return (
    <motion.div
      className={cn("fixed bottom-5 z-40", className)}
      style={{ insetInlineEnd: "1.25rem" }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.45, ease: "easeOut" }}
    >
      <Link
        href="/features"
        className="group inline-flex items-center gap-2 rounded-full border border-[#22C55E]/35 bg-[#22C55E]/95 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#22C55E]/25 backdrop-blur-sm transition hover:bg-[#22C55E] hover:shadow-xl"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white/25">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        </span>
        {t("liveDemo")}
      </Link>
    </motion.div>
  );
}
