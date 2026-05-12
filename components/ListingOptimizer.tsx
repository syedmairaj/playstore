"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { LivePreviewPhone } from "@/components/features/visualizer/live-preview-phone";
import { cn } from "@/lib/utils";

type ToneStyle = "professional" | "friendly" | "bold" | "minimal";

type ApiSuccess = {
  ok: true;
  data: ListingGenerationOutput;
  meta?: { model?: string; promptVersion?: string; persisted?: boolean };
};

type ApiError = {
  ok: false;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    remaining?: number;
    required?: number;
  };
};

export function ListingOptimizer({
  workspaceId,
  embedded,
}: {
  workspaceId: string;
  embedded?: boolean;
}) {
  const t = useTranslations("optimizer");
  const [appName, setAppName] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [features, setFeatures] = useState("");
  const [toneStyle, setToneStyle] = useState<ToneStyle>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListingGenerationOutput | null>(null);
  const [meta, setMeta] = useState<ApiSuccess["meta"]>();

  const canSubmit = useMemo(() => {
    return (
      appName.trim().length > 0 &&
      category.trim().length > 0 &&
      keywords.trim().length > 0 &&
      features.trim().length > 0 &&
      !loading
    );
  }, [appName, category, keywords, features, loading]);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("results.copiedDescription"), {
        description: t("results.copiedTitle"),
      });
    } catch {
      window.prompt(`Copy ${label}`, text);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setMeta(undefined);
    setLoading(true);
    try {
      const res = await fetch("/api/listings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          appName: appName.trim(),
          category: category.trim(),
          targetKeywords: keywords,
          appFeatures: features.trim(),
          toneStyle,
        }),
      });
      const json = (await res.json()) as ApiSuccess | ApiError;
      if (!json.ok) {
        if (res.status === 401) {
          setError(t("form.signInError"));
        } else if (
          res.status === 402 ||
          json.error.code === "insufficient_credits"
        ) {
          const rem = json.error.remaining;
          const req = json.error.required;
          const suffix =
            typeof rem === "number" && typeof req === "number"
              ? ` ${t("form.creditsDetail", { rem, req })}`
              : "";
          setError(`${json.error.message}${suffix}${t("form.creditsSuffix")}`);
        } else {
          setError(json.error.message || t("form.networkError"));
        }
        return;
      }
      setResult(json.data);
      setMeta(json.meta);
    } catch {
      setError(t("form.networkError"));
    } finally {
      setLoading(false);
    }
  }

  const shellClass = embedded
    ? "rounded-3xl border border-white/[0.08] bg-[#0B0E14] px-4 py-8 sm:px-8"
    : "min-h-screen bg-[#0B0E14] px-4 py-12 sm:px-6 lg:px-8";

  return (
    <div className={cn("mx-auto max-w-6xl", shellClass)}>
      <header className="mb-10 space-y-3">
        {!embedded ? (
          <p className="text-sm font-medium text-[#22C55E]">{t("eyebrow")}</p>
        ) : null}
        <h1
          className={cn(
            "font-semibold tracking-tight text-white",
            embedded ? "text-2xl" : "text-3xl sm:text-4xl",
          )}
        >
          {t("title")}
        </h1>
        <p className="max-w-2xl text-base text-white/60">{t("subtitle")}</p>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          <section className="rounded-3xl border border-white/[0.08] bg-white/[0.05] p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-[12px] sm:p-8">
            <form className="space-y-6" onSubmit={onSubmit}>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90">
                    {t("form.appName")}
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none ring-0 transition placeholder:text-white/35 focus:border-[#22C55E]/50 focus:ring-2 focus:ring-[#22C55E]/25"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder={t("form.appNamePlaceholder")}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90">
                    {t("form.category")}
                  </label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#22C55E]/50 focus:ring-2 focus:ring-[#22C55E]/25"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t("form.categoryPlaceholder")}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/90">
                  {t("form.keywords")}
                </label>
                <textarea
                  className="min-h-[88px] w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#22C55E]/50 focus:ring-2 focus:ring-[#22C55E]/25"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={t("form.keywordsPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/90">
                  {t("form.features")}
                </label>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#22C55E]/50 focus:ring-2 focus:ring-[#22C55E]/25"
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  placeholder={t("form.featuresPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white/90">
                  {t("form.tone")}
                </label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#4285F4]/50 focus:ring-2 focus:ring-[#4285F4]/25 sm:max-w-xs"
                  value={toneStyle}
                  onChange={(e) => setToneStyle(e.target.value as ToneStyle)}
                >
                  <option value="professional">{t("form.toneProfessional")}</option>
                  <option value="friendly">{t("form.toneFriendly")}</option>
                  <option value="bold">{t("form.toneBold")}</option>
                  <option value="minimal">{t("form.toneMinimal")}</option>
                </select>
              </div>

              {error ? (
                <div
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white/80"
                  role="alert"
                >
                  <p className="font-medium text-[#22C55E]">{t("form.refiningTitle")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/50">{t("form.refiningHint")}</p>
                  <p className="mt-2 text-sm text-white/70">{error}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                >
                  {loading ? t("form.generating") : t("form.generate")}
                </button>
                {loading ? (
                  <span className="text-sm text-white/45">
                    {t("form.generatingHint")}
                  </span>
                ) : null}
              </div>
            </form>
          </section>

          {result ? (
            <section className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-xl font-semibold text-white">
                  {t("results.title")}
                </h2>
                {meta?.persisted === false ? (
                  <p className="text-xs text-amber-300/90">
                    {t("results.persistWarning")}
                  </p>
                ) : meta?.promptVersion ? (
                  <p className="text-xs text-white/45">
                    {t("results.metaPrompt", {
                      version: meta.promptVersion,
                      model: meta.model ?? "",
                    })}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-6">
                <ResultBlock
                  title={t("results.titleBlock")}
                  body={result.title}
                  hint={`${result.title.length}/50`}
                  onCopy={() => copyText("title", result.title)}
                />
                <ResultBlock
                  title={t("results.shortBlock")}
                  body={result.shortDescription}
                  hint={`${result.shortDescription.length}/80`}
                  onCopy={() =>
                    copyText("short description", result.shortDescription)
                  }
                />
                <ResultBlock
                  title={t("results.fullBlock")}
                  body={result.fullDescription}
                  hint={`${result.fullDescription.length}/4000`}
                  onCopy={() =>
                    copyText("full description", result.fullDescription)
                  }
                />
                <ResultList
                  title={t("results.keywordsList")}
                  items={result.keywordSuggestions}
                  copyLabel={t("results.copyAll")}
                  onCopyAll={() =>
                    copyText("keywords", result.keywordSuggestions.join(", "))
                  }
                />
                <ResultList
                  title={t("results.ctaList")}
                  items={result.ctaSuggestions}
                  copyLabel={t("results.copyAll")}
                  onCopyAll={() =>
                    copyText("CTAs", result.ctaSuggestions.join("\n"))
                  }
                />
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-10 text-center text-sm text-white/55 backdrop-blur-sm">
              {t("empty.body")}
            </section>
          )}
        </div>

        <aside className="flex justify-center lg:sticky lg:top-8 lg:justify-end">
          <LivePreviewPhone
            appName={appName}
            category={category}
            keywords={keywords}
            result={result}
            loading={loading}
          />
        </aside>
      </div>
    </div>
  );
}

function ResultBlock(props: {
  title: string;
  body: string;
  hint: string;
  onCopy: () => void | Promise<void>;
}) {
  const t = useTranslations("optimizer");
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.05] p-5 shadow-sm backdrop-blur-[12px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{props.title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/45">{props.hint}</span>
          <button
            type="button"
            onClick={async () => {
              await props.onCopy();
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/85 transition hover:bg-white/10"
          >
            {copied ? "✓" : t("results.copy")}
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
        {props.body}
      </p>
    </div>
  );
}

function ResultList(props: {
  title: string;
  items: string[];
  copyLabel: string;
  onCopyAll: () => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.05] p-5 shadow-sm backdrop-blur-[12px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{props.title}</h3>
        <button
          type="button"
          onClick={async () => {
            await props.onCopyAll();
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/85 transition hover:bg-white/10"
        >
          {copied ? "✓" : props.copyLabel}
        </button>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
        {props.items.map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
