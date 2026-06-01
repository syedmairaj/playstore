"use client";

/**
 * BrandAssetsClient — Brand Assets page.
 *
 * Fetches the workspace apps list client-side (same pattern as ListingOptimizer)
 * so the selected app's id/name/category are always fresh and correct.
 *
 * Logo tab: shared AppIconGenerator component.
 * Banner tab: inline generate → pick → download.
 * Brand Kit CTA: fires logo + banner in parallel.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, ArrowLeft, Check, Lock, Image as ImageIcon, Layers, Zap, ChevronDown, Archive } from "lucide-react";
import { toast } from "sonner";
import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import { workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { parseLogoGeneratorMetadata } from "@/lib/apps/logo-generator-metadata";
import { saveGeneratedAssetsToVault } from "@/lib/brand-assets/save-to-vault";
import { VaultGrid } from "@/components/brand-assets/VaultGrid";
import { cn } from "@/lib/utils";
import { AppIconGenerator } from "@/components/shared/AppIconGenerator";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "logo" | "banner";
type Page = 1 | 2;

type AppRow = { id: string; name: string; category?: string | null; short_description?: string | null; metadata?: Record<string, unknown> | null };
type GenOk = { ok: true; images: string[]; meta?: { creditsCharged?: number; creditsRemaining?: number } };
type GenErr = { ok: false; error: { code?: string; message: string; remaining?: number; required?: number } };

// ── Skeleton tile (banner only) ───────────────────────────────────────────────
function BannerSkeleton() {
  return (
    <div className="relative aspect-[2/1] overflow-hidden rounded-xl border border-white/[0.08] bg-black/30" aria-hidden>
      <div className="absolute inset-0 animate-logo-skeleton-shimmer bg-gradient-to-r from-transparent via-white/[0.09] to-transparent bg-[length:180%_100%]" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function BrandAssetsClient(props: {
  workspaceId: string;
  /** Initial app data from SSR — used as seed only; client fetches fresh list. */
  initialAppId?: string;
  creditsRemaining: number;
  plan?: string;
  onCreditsRemaining?: (n: number) => void;
  onRequestUpgrade?: () => void;
}) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("brandAssets");
  const isFreePlan = !props.plan || props.plan === "free";

  // ── Credits state ─────────────────────────────────────────────────────────
  const [credits, setCredits] = useState(props.creditsRemaining);
  function updateCredits(n: number) { setCredits(n); props.onCreditsRemaining?.(n); }

  // ── Fetch workspace apps (same pattern as ListingOptimizer) ───────────────
  const appsQuery = useQuery({
    queryKey: workspaceAppsQueryKey(props.workspaceId),
    enabled: Boolean(props.workspaceId),
    staleTime: 0,
    queryFn: async (): Promise<AppRow[]> => {
      const res = await fetch(`/api/workspaces/${props.workspaceId}/apps`, { credentials: "include" });
      const raw = await res.text();
      let json: unknown;
      try { json = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`Apps fetch failed (${res.status})`); }
      const body = json as { ok?: boolean; apps?: AppRow[]; rows?: AppRow[] };
      if (!res.ok || body.ok === false) throw new Error("Could not load apps");
      return body.apps ?? body.rows ?? [];
    },
  });

  const appsList: AppRow[] = appsQuery.data ?? [];

  // ── Selected app ──────────────────────────────────────────────────────────
  const [selectedAppId, setSelectedAppId] = useState<string>(props.initialAppId ?? "");

  // Auto-select first app once list loads
  useEffect(() => {
    if (appsList.length > 0 && !selectedAppId) {
      setSelectedAppId(appsList[0].id);
    }
  }, [appsList, selectedAppId]);

  const selectedApp = appsList.find((a) => a.id === selectedAppId) ?? null;
  const appId = selectedApp?.id ?? "";
  const appName = selectedApp?.name ?? "";
  const category = selectedApp?.category ?? "";
  const shortDescription = selectedApp?.short_description ?? "";

  // ── Top-level mode: Generate vs My Vault ────────────────────────────────
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"generate" | "vault">(
    searchParams.get("mode") === "vault" ? "vault" : "generate",
  );

  // ── Tab state (within Generate mode) ─────────────────────────────────────
  const [tab, setTab] = useState<Tab>("logo");

  // ── Banner state ──────────────────────────────────────────────────────────
  const [bannerPage, setBannerPage] = useState<Page>(1);
  const [bannerImages, setBannerImages] = useState<string[]>([]);
  const [bannerSelected, setBannerSelected] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerTheme, setBannerTheme] = useState("");
  const [bannerStyle, setBannerStyle] = useState("Modern");
  const [bannerColor, setBannerColor] = useState("");

  // ── Brand Kit state ───────────────────────────────────────────────────────
  const [kitBusy, setKitBusy] = useState(false);

  // Reset banner results when app changes
  useEffect(() => {
    setBannerImages([]); setBannerSelected(null); setBannerPage(1);
  }, [selectedAppId]);

  // ── Guard: require selected app ───────────────────────────────────────────
  function requireApp(): boolean {
    if (!appId || !appName) {
      toast.message(t("noAppTitle"), { description: t("noAppBody") });
      return false;
    }
    return true;
  }

  // ── Banner generate ───────────────────────────────────────────────────────
  async function runBannerGenerate() {
    if (!requireApp()) return;
    const cost = AI_CREDIT_COSTS.banner_generation;
    if (credits < cost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return;
    }
    setBannerBusy(true); setBannerImages([]); setBannerSelected(null); setBannerPage(2);
    const toastId = toast.loading(t("generatingBanners"));
    try {
      const body: Record<string, unknown> = {
        workspaceId: props.workspaceId, appId, appName, category, style: bannerStyle,
      };
      if (shortDescription.trim()) body.shortDescription = shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(bannerColor)) body.brandColor = bannerColor;
      if (bannerTheme.trim()) body.theme = bannerTheme.trim();

      const res = await fetch("/api/brand-assets/banner-generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = (await res.json()) as GenOk | GenErr;
      toast.dismiss(toastId);
      if (!json.ok) {
        setBannerPage(1);
        const err = (json as GenErr).error;
        if (err.code === "insufficient_credits") {
          if (typeof err.remaining === "number") updateCredits(err.remaining);
          toast.message(t("insufficientTitle"), { description: typeof err.remaining === "number" ? t("insufficientBody", { rem: err.remaining, req: err.required ?? cost }) : err.message });
        } else { toast.error(err.message?.trim() || t("generationFailed")); }
        return;
      }
      const ok = json as GenOk;
      const urls = ok.images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4);
      setBannerImages(urls);
      if (urls.length > 0) {
        void saveGeneratedAssetsToVault({
          workspaceId: props.workspaceId,
          appId,
          assetType: "banner",
          imageUrls: urls,
          meta: { style: bannerStyle, brandColor: bannerColor || undefined, theme: bannerTheme || undefined },
        });
      }
      if (typeof ok.meta?.creditsRemaining === "number") updateCredits(ok.meta.creditsRemaining);
      toast.success(t("bannersReady"));
    } catch { toast.dismiss(toastId); toast.error(t("networkError")); setBannerPage(1); }
    finally { setBannerBusy(false); }
  }

  // ── Brand Kit batch ───────────────────────────────────────────────────────
  async function runBrandKit() {
    if (!requireApp()) return;
    const cost = AI_CREDIT_COSTS.brand_kit_batch;
    if (credits < cost) {
      toast.message(t("insufficientTitle"), { description: t("insufficientBody", { rem: credits, req: cost }) }); return;
    }
    setKitBusy(true);
    setBannerImages([]); setBannerSelected(null);
    const toastId = toast.loading(t("generatingKit"));
    try {
      const logoBody: Record<string, unknown> = {
        workspaceId: props.workspaceId, appId, appName, category, style: bannerStyle,
      };
      if (shortDescription.trim()) logoBody.shortDescription = shortDescription.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(bannerColor)) logoBody.brandColor = bannerColor;

      const bannerBody = { ...logoBody };
      if (bannerTheme.trim()) (bannerBody as Record<string, unknown>).theme = bannerTheme.trim();

      const [logoRes, bannerRes] = await Promise.all([
        fetch("/api/listings/logo-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logoBody) }),
        fetch("/api/brand-assets/banner-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bannerBody) }),
      ]);
      const [logoJson, bannerJson] = await Promise.all([
        logoRes.json() as Promise<GenOk | GenErr>,
        bannerRes.json() as Promise<GenOk | GenErr>,
      ]);
      toast.dismiss(toastId);

      const bannerUrls = bannerJson.ok ? (bannerJson as GenOk).images.filter((u) => /^https:\/\//i.test(u)).slice(0, 4) : [];
      setBannerImages(bannerUrls);

      const lastCredits = bannerJson.ok ? (bannerJson as GenOk).meta?.creditsRemaining
        : logoJson.ok ? (logoJson as GenOk).meta?.creditsRemaining : undefined;
      if (typeof lastCredits === "number") updateCredits(lastCredits);

      if ((logoJson.ok && (logoJson as GenOk).images.length > 0) || bannerUrls.length > 0) {
        toast.success(t("kitReady"));
        if (bannerUrls.length > 0) { setTab("banner"); setBannerPage(2); }
        else setTab("logo");
      } else { toast.error(t("kitFailed")); }
    } catch { toast.dismiss(toastId); toast.error(t("networkError")); }
    finally { setKitBusy(false); }
  }

  // ── Download helper ───────────────────────────────────────────────────────
  function triggerDownload(url: string, filename: string) {
    const a = Object.assign(document.createElement("a"), { href: url, download: filename, rel: "noopener" });
    document.body.appendChild(a); a.click(); a.remove();
  }

  const anyBusy = bannerBusy || kitBusy;
  const appsLoading = appsQuery.isLoading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir={isAr ? "rtl" : "ltr"} className={cn("min-h-full w-full", isAr && "font-arabic")}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">

        {/* Page header */}
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("pageTitle")}</h1>
          <p className="text-sm leading-relaxed text-white/55 sm:text-base">{t("pageSubtitle")}</p>
        </div>

        {/* ── Generate / My Vault top tabs ─────────────────────────────── */}
        <div className="mb-8 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {([
            { key: "generate" as const, label: t("modeGenerate"), icon: <Sparkles className="size-4 shrink-0" aria-hidden /> },
            { key: "vault"    as const, label: t("modeVault"),    icon: <Archive className="size-4 shrink-0" aria-hidden /> },
          ]).map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => setMode(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none",
                mode === key ? "bg-[#22C55E]/15 text-[#86efac] ring-1 ring-[#22C55E]/30" : "text-white/45 hover:text-white/70",
              )}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── My Vault ─────────────────────────────────────────────────── */}
        {mode === "vault" && (
          <VaultGrid workspaceId={props.workspaceId} appId={appId || undefined} />
        )}

        {/* ── Generate mode ────────────────────────────────────────────── */}
        {mode === "generate" && (<>

        {/* ── App selector ────────────────────────────────────────────────── */}
        <div className="mb-8">
          {appsLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <Loader2 className="size-4 animate-spin text-white/40" aria-hidden />
              <span className="text-sm text-white/40">{t("loadingApps")}</span>
            </div>
          ) : appsList.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-300/70" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-amber-200/90">{t("noAppTitle")}</p>
                <p className="mt-0.5 text-xs leading-snug text-amber-200/60">{t("noAppBody")}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="ba-app-select" className="text-xs font-medium text-white/55">
                {t("appSelectorLabel")}
              </label>
              <div className="relative">
                <select
                  id="ba-app-select"
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  disabled={anyBusy}
                  className="w-full appearance-none rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 pe-10 text-sm text-white outline-none transition focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40"
                >
                  {appsList.map((app) => (
                    <option key={app.id} value={app.id} className="bg-[#0c1018]">
                      {app.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
              </div>
            </div>
          )}
        </div>

        {/* Brand Kit CTA */}
        <div className="mb-8 rounded-2xl border border-[#22C55E]/20 bg-[#22C55E]/[0.06] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="size-4 shrink-0 text-[#86efac]" aria-hidden />
                <span className="text-sm font-semibold text-[#86efac]">{t("brandKitTitle")}</span>
              </div>
              <p className="text-xs leading-relaxed text-white/55">{t("brandKitSubtitle")}</p>
              <p className="text-xs text-amber-200/70">{t("brandKitCredits", { credits: AI_CREDIT_COSTS.brand_kit_batch })}</p>
            </div>
            <button
              type="button"
              disabled={anyBusy || !appId || appsLoading}
              onClick={() => { void runBrandKit(); }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55"
            >
              {kitBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
              {kitBusy ? t("generating") : t("brandKitCta")}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {(["logo", "banner"] as Tab[]).map((id) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none",
                tab === id ? "bg-[#22C55E]/15 text-[#86efac] ring-1 ring-[#22C55E]/30" : "text-white/45 hover:text-white/70",
              )}>
              {id === "logo" ? <ImageIcon className="size-4 shrink-0" aria-hidden /> : <Layers className="size-4 shrink-0" aria-hidden />}
              {t(id === "logo" ? "tabLogo" : "tabBanner")}
            </button>
          ))}
        </div>

        {/* ════════ LOGO TAB — powered by shared AppIconGenerator ═══════════ */}
        {tab === "logo" && (
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0c1018]">
            {appId ? (
              <AppIconGenerator
                key={appId}
                workspaceId={props.workspaceId}
                appId={appId}
                appName={appName}
                category={category}
                shortDescription={shortDescription}
                creditsRemaining={credits}
                onCreditsRemaining={updateCredits}
                onIconSelected={() => { /* page mode: no live mockup to update */ }}
                onIconPersisted={() => { void appsQuery.refetch(); }}
                initialLogoGenerator={parseLogoGeneratorMetadata(selectedApp?.metadata ?? null)}
                plan={props.plan}
                onRequestUpgrade={props.onRequestUpgrade}
              />
            ) : (
              <div className="p-8 text-center text-sm text-white/40">
                {appsLoading ? t("loadingApps") : t("noAppTitle")}
              </div>
            )}
          </div>
        )}

        {/* ════════ BANNER TAB ══════════════════════════════════════════════ */}
        {tab === "banner" && (
          <div className="space-y-6">
            {/* Step bar */}
            <div className="flex items-stretch rounded-xl border border-white/[0.07] bg-white/[0.02]">
              {([1, 2] as Page[]).map((p, idx) => (
                <button key={p} type="button"
                  onClick={() => { if (p === 1 || bannerImages.length > 0) setBannerPage(p); }}
                  disabled={p === 2 && bannerImages.length === 0 && !bannerBusy}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors focus-visible:outline-none disabled:cursor-default",
                    idx === 0 ? "rounded-s-xl" : "rounded-e-xl",
                    bannerPage === p ? "border-[#22C55E] text-[#86efac]"
                      : bannerImages.length > 0 && p === 1 ? "border-transparent text-white/40 hover:text-white/60"
                        : "border-transparent text-white/25",
                  )}>
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    bannerPage === p ? "bg-[#22C55E] text-white"
                      : bannerPage === 2 && p === 1 ? "bg-[#22C55E]/20 text-[#86efac]"
                        : "bg-white/[0.08] text-white/35",
                  )}>
                    {bannerPage === 2 && p === 1 ? <Check className="size-2.5" /> : p}
                  </span>
                  {t(p === 1 ? "step1Label" : "step2Label")}
                </button>
              ))}
            </div>

            {/* Banner page 1 — Configure */}
            {bannerPage === 1 && (
              <div className="space-y-6">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-1.5 text-xs font-medium text-amber-200/85">
                  <Sparkles className="size-3 shrink-0" aria-hidden />{t("bannerCredits")}
                </div>
                <div className="space-y-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                  {/* Style chips */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-medium text-white/60">{t("styleLabel")}</span>
                    <div className="flex flex-wrap gap-2">
                      {["Minimalist","Modern","Bold","Playful","Professional","Flat Design"].map((s) => (
                        <button key={s} type="button" disabled={bannerBusy} onClick={() => setBannerStyle(s)}
                          className={cn(
                            "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            bannerStyle === s ? "border-[#22C55E]/50 bg-[#22C55E]/12 text-[#86efac]" : "border-white/[0.1] bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white/80",
                          )}>
                          {t(`styles.${s}` as Parameters<typeof t>[0])}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Brand colour */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-white/60">{t("brandColorLabel")}</span>
                      {bannerColor && <button type="button" onClick={() => setBannerColor("")} className="ms-auto text-[10px] text-white/35 hover:text-white/60">{t("brandColorNone")}</button>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[{ hex: "#1A73E8" }, { hex: "#0B8043" }, { hex: "#D93025" }, { hex: "#E37400" }, { hex: "#7B1FA2" }].map(({ hex }) => (
                        <button key={hex} type="button" disabled={bannerBusy}
                          onClick={() => setBannerColor(bannerColor === hex ? "" : hex)}
                          className={cn("size-7 rounded-full border-2 transition-[border-color,transform,box-shadow] disabled:opacity-40",
                            bannerColor === hex ? "scale-110 border-white/80 shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "border-white/20 hover:border-white/50 hover:scale-105")}
                          style={{ backgroundColor: hex }} />
                      ))}
                      {bannerColor && <span className="ms-1 font-mono text-[11px] text-white/40">{bannerColor.toUpperCase()}</span>}
                    </div>
                  </div>
                  {/* Theme */}
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-white/60">{t("bannerThemeLabel")}</span>
                    <input type="text" maxLength={150} value={bannerTheme}
                      onChange={(e) => setBannerTheme(e.target.value)} disabled={bannerBusy}
                      placeholder={t("bannerThemePlaceholder")}
                      className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 disabled:opacity-40" />
                    <p className="text-[11px] text-white/35">{t("bannerThemeHint")}</p>
                  </div>
                </div>
                <button type="button" disabled={bannerBusy || !appId} onClick={() => { void runBannerGenerate(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55">
                  {bannerBusy ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t("generating")}</> : <><Layers className="size-4" aria-hidden />{bannerImages.length ? t("regenerate") : t("generateBanners")}</>}
                </button>
                <p className="text-[11px] text-white/35">{t("bannerSizeNote")}</p>
              </div>
            )}

            {/* Banner page 2 — Pick */}
            {bannerPage === 2 && (
              <div className="space-y-5">
                <p className="text-sm text-white/55">{t("pickBannerHint")}</p>
                {bannerBusy && bannerImages.length === 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[0,1,2,3].map((i) => <BannerSkeleton key={i} />)}</div>
                )}
                {bannerImages.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {bannerImages.map((src, i) => (
                      <button key={`${i}-${src.slice(0,48)}`} type="button" disabled={bannerBusy}
                        onClick={() => setBannerSelected(src)}
                        className={cn(
                          "group relative aspect-[2/1] overflow-hidden rounded-xl border p-1 transition-[border-color,box-shadow] duration-200 focus:outline-none motion-safe:hover:-translate-y-[2px] motion-safe:hover:border-[#22C55E]/45",
                          bannerSelected === src ? "border-[#22C55E]/60 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.28)] ring-2 ring-[#22C55E]/40" : "border-white/[0.08] hover:border-white/[0.15]",
                          bannerBusy && "pointer-events-none opacity-55",
                        )}>
                        {bannerSelected === src && (
                          <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full bg-[#22C55E]">
                            <Check className="size-3 text-white" />
                          </span>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full rounded-lg object-cover transition duration-200 motion-safe:group-hover:scale-[1.02]" />
                      </button>
                    ))}
                  </div>
                )}
                {bannerImages.length > 0 && (
                  isFreePlan ? (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                      <Lock className="size-4 shrink-0 text-amber-300/75" aria-hidden />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-amber-200/90">{t("downloadLockedTitle")}</p>
                        <p className="mt-0.5 text-[11px] text-amber-200/55">{t("downloadLockedBody")}</p>
                      </div>
                      {props.onRequestUpgrade && (
                        <button type="button" onClick={props.onRequestUpgrade}
                          className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300/90 hover:bg-amber-400/18">
                          {t("upgrade")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button type="button" disabled={!bannerSelected}
                      onClick={() => bannerSelected && triggerDownload(bannerSelected, `banner-${appName.replace(/\s+/g, "-").toLowerCase()}-1024x500.png`)}
                      className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] py-2.5 text-xs font-semibold text-white/80 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#ecfdf5] disabled:cursor-not-allowed disabled:opacity-45">
                      {t("downloadBanner")}
                    </button>
                  )
                )}
                <p className="text-[11px] text-white/35">{t("bannerDownloadHint")}</p>
                <div className="border-t border-white/[0.06] pt-4">
                  <button type="button" onClick={() => setBannerPage(1)}
                    className="flex items-center gap-1.5 text-xs text-white/38 transition hover:text-white/60">
                    <ArrowLeft className="size-3.5" aria-hidden />{t("backToConfigure")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>)} {/* end Generate mode */}
      </div>
    </div>
  );
}
