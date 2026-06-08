import { Check, Circle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AsoCheckItem } from "@/lib/features/product/aso/checklist";

export type { AsoCheckItem };

export function AsoScorePanel(props: {
  title: string;
  hint: string;
  score: number;
  checks: AsoCheckItem[];
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(props.score)));

  return (
    <section className="rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-white to-neutral-50/80 p-6 shadow-sm ring-1 ring-neutral-100 sm:p-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-6">
          <div
            className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-4 border-indigo-100 bg-indigo-50/90 shadow-inner"
            aria-label={`${props.title}: ${clamped} out of 100`}
          >
            <span className="text-3xl font-semibold tracking-tight text-indigo-900">{clamped}</span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600/90">
              / 100
            </span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{props.title}</h2>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-neutral-600">{props.hint}</p>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-2.5 lg:max-w-md">
          {props.checks.map((c) => (
            <li key={c.label}>
              <Link
                href={c.href}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  c.done
                    ? "border-emerald-100 bg-emerald-50/40 text-neutral-800"
                    : "border-neutral-100 bg-neutral-50/60 text-neutral-800 hover:border-indigo-200 hover:bg-white"
                }`}
              >
                <span className="mt-0.5 shrink-0" aria-hidden>
                  {c.done ? (
                    <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                  ) : (
                    <Circle className="h-4 w-4 text-neutral-300" strokeWidth={2} />
                  )}
                </span>
                <span className="leading-snug">{c.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
