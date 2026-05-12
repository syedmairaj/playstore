"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export function TestimonialSection() {
  const ts = useTranslations("social");

  const quotes = [
    { q: ts("q1"), who: ts("who1") },
    { q: ts("q2"), who: ts("who2") },
    { q: ts("q3"), who: ts("who3") },
  ];

  return (
    <section className="border-y border-white/[0.06] bg-white/[0.02] px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {ts("title")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-white/55 sm:text-lg">
          {ts("subtitle")}
        </p>
        <motion.ul
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-32px" }}
          className="mt-14 grid gap-6 lg:grid-cols-3"
        >
          {quotes.map((row) => (
            <motion.li key={row.who} variants={item} transition={{ duration: 0.45 }}>
              <div className="h-full rounded-3xl border border-white/[0.08] bg-white/[0.05] p-6 shadow-lg shadow-black/20 backdrop-blur-[12px] transition-all duration-300 hover:-translate-y-1 hover:border-[#4285F4]/30 hover:shadow-md sm:p-7">
                <p className="text-sm font-medium leading-relaxed text-white/90 sm:text-[15px]">
                  “{row.q}”
                </p>
                <p className="mt-4 text-xs font-medium text-[#22C55E]">{row.who}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
