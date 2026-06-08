"use client";

import { useState } from "react";

type Props = {
  title: string;
  items: string[];
  copyLabel: string;
  onCopyAll: () => void | Promise<void>;
};

export function OptimizerResultList(props: Props) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-white/[0.045] p-6 shadow-[0_10px_36px_-18px_rgba(0,0,0,0.45)] ring-1 ring-emerald-500/10 backdrop-blur-[12px] transition-[border-color,box-shadow] duration-200 hover:border-emerald-500/20 hover:shadow-[0_14px_40px_-16px_rgba(34,197,94,0.12)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight text-white/95">
          {props.title}
        </h3>
        <button
          type="button"
          onClick={async () => {
            await props.onCopyAll();
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-white/14 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/85 transition hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-100"
        >
          {copied ? "✓" : props.copyLabel}
        </button>
      </div>
      <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-white/82">
        {props.items.map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
