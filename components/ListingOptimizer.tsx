"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ImagePlus } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import type { ListingOptimizerHydrationPayload } from "@/lib/listing/latest-listing-hydration";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { AddAppModal, type CreatedWorkspaceApp } from "@/components/app/add-app-modal";
import { LivePreviewPhone } from "@/components/features/visualizer/live-preview-phone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  PlayConsoleExportDialog,
  type PlayConsoleExportCopyField,
} from "@/components/listing/play-console-export-dialog";
import { LogoGeneratorDialog } from "@/components/listing/logo-generator-dialog";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import type { AppLimitsData } from "@/hooks/use-app-limits";
import { useAppLimits, workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { precheckAddApp } from "@/lib/client/precheck-add-app";
import {
  AI_CREDIT_COSTS,
  KEYWORD_TRACK_AI_FREE_PER_GENERATION,
} from "@/lib/features/billing/credit-costs";
import { normalizePlan, PLAN_META, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";

type ToneStyle = "professional" | "friendly" | "bold" | "minimal";

type ApiSuccess = {
  ok: true;
  data: ListingGenerationOutput;
  meta?: {
    model?: string;
    promptVersion?: string;
    persisted?: boolean;
    generationId?: string;
    savedAt?: string;
  };
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

type AutofillField = "keywords" | "features";

type AutofillApiSuccess = {
  ok: true;
  data: { text: string; field: AutofillField };
  meta?: {
    model?: string;
    creditsCharged?: number;
    creditsRemaining?: number;
    persistedInputs?: boolean;
    generationId?: string;
    savedAt?: string;
  };
};

const LISTING_TITLE_MAX = 30;
const LISTING_SHORT_MAX = 80;
const LISTING_LONG_MAX = 4000;
/** Orange “close to limit” thresholds (green below, inclusive orange at/above until over max). */
const LISTING_TITLE_WARN_FROM = 26;
const LISTING_SHORT_WARN_FROM = 72;
const LISTING_LONG_WARN_FROM = Math.floor(
  (LISTING_LONG_MAX * LISTING_SHORT_WARN_FROM) / LISTING_SHORT_MAX,
);

/** Appended on one automatic retry when the API returns invalid model output (422). */
const LISTING_GENERATE_STRICT_RETRY_INSTRUCTION =
  "CRITICAL — Google Play HARD limits (count every character, including spaces): title ≤30, shortDescription ≤80 (never 81+), fullDescription ≤4000. Shorten shortDescription aggressively if required. Return only valid JSON with all required keys.";

function mergeListingGenerateRetryInstruction(existing?: string): string {
  const trimmed = existing?.trim();
  if (trimmed) {
    return `${LISTING_GENERATE_STRICT_RETRY_INSTRUCTION}\n\n${trimmed}`;
  }
  return LISTING_GENERATE_STRICT_RETRY_INSTRUCTION;
}

/** English instructions for Gemini (stable regardless of UI locale). */
const REGENERATE_MODEL_INSTRUCTIONS = {
  punchier:
    "Regenerate the full Play listing JSON. Make the copy punchier, more energetic, and more memorable. Keep honest claims, respect Google Play character limits, and preserve the same app facts and keyword intent.",
  professional:
    "Regenerate the full Play listing JSON. Use a more polished, enterprise-appropriate professional voice while staying approachable. Keep honest claims and character limits.",
  arabic:
    "Regenerate the full Play listing JSON. Translate every user-visible store string into natural modern Arabic suitable for MENA users on Google Play. Keep honest claims and character limits.",
  tone:
    "Regenerate the full Play listing JSON. Vary tone and phrasing with a fresh creative angle while keeping the same substance and keyword intent. Keep honest claims and character limits.",
} as const;

function clampListingTexts(title: string, short: string, long: string) {
  return {
    title: title.slice(0, LISTING_TITLE_MAX),
    shortDescription: short.slice(0, LISTING_SHORT_MAX),
    fullDescription: long.slice(0, LISTING_LONG_MAX),
  };
}

function listingCountTone(
  len: number,
  max: number,
  warnFrom: number,
): "ok" | "warn" | "over" {
  if (len > max) return "over";
  if (len >= warnFrom) return "warn";
  return "ok";
}

function charCountToneClass(tone: "ok" | "warn" | "over"): string {
  if (tone === "over") return "text-red-300/95";
  if (tone === "warn") return "text-amber-200/95";
  return "text-[#86efac]/90";
}

function metaString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads listing-related keys from `apps` row (column `icon_url` preferred, then `metadata`). */
function readAppListingMeta(
  metadata: Record<string, unknown> | null | undefined,
  iconUrlColumn?: string | null,
): { category: string; shortDescription: string; iconUrl: string } {
  if (!metadata || typeof metadata !== "object") {
    const col = metaString(iconUrlColumn);
    return { category: "", shortDescription: "", iconUrl: col };
  }
  const short =
    metaString(metadata.short_description) ||
    metaString(
      (metadata as { shortDescription?: unknown }).shortDescription,
    );
  const metaIcon =
    metaString(metadata.icon_url) ||
    metaString((metadata as { iconUrl?: unknown }).iconUrl);
  const colIcon = metaString(iconUrlColumn);
  const icon = colIcon || metaIcon;
  return {
    category: metaString(metadata.category),
    shortDescription: short,
    iconUrl: icon,
  };
}

function workspaceIdFromParams(
  raw: string | string[] | undefined,
): string | undefined {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const first = Array.isArray(raw) ? raw[0] : undefined;
  if (typeof first === "string" && first.trim()) return first.trim();
  return undefined;
}

function hasValidHttpsPreviewIcon(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function ListingOptimizer({
  workspaceId: workspaceIdProp,
  embedded,
  locale: localeProp,
  initialAppLimits,
  initialApps,
  initialAiCreditsRemaining,
  initialHydrationByApp,
  initialHydrationNoApp,
}: {
  /** When omitted (e.g. embedded reuse), derived from the `[workspaceId]` segment via `useParams`. */
  workspaceId?: string;
  embedded?: boolean;
  /** Route locale for RTL, typography, and API language hints (falls back to `useLocale()`). */
  locale?: "en" | "ar";
  /** Server snapshot from `canAddNewApp` — same shape as GET app-limits; avoids flash before client fetch. */
  initialAppLimits?: AppLimitsData;
  /** Server-fetched apps so the picker works before the client refetch. */
  initialApps?: {
    id: string;
    name: string;
    metadata?: Record<string, unknown> | null;
    icon_url?: string | null;
  }[];
  /** Workspace `ai_credits_remaining` for client-side autofill pre-check (optional). */
  initialAiCreditsRemaining?: number;
  /** Latest saved listing_generations per app (server-loaded for refresh restore). */
  initialHydrationByApp?: Record<string, ListingOptimizerHydrationPayload>;
  /** Latest workspace-wide generation without `app_id` (no workspace apps). */
  initialHydrationNoApp?: ListingOptimizerHydrationPayload | null;
}) {
  const params = useParams<{ workspaceId?: string | string[] }>();
  const workspaceId =
    (workspaceIdProp?.trim() ? workspaceIdProp.trim() : undefined) ??
    workspaceIdFromParams(params.workspaceId);

  const intlLocale = useLocale();
  const locale: "en" | "ar" =
    localeProp === "ar" || localeProp === "en"
      ? localeProp
      : intlLocale === "ar"
        ? "ar"
        : "en";
  const isRtl = locale === "ar";

  const t = useTranslations("optimizer");
  const tAddApp = useTranslations("addApp");
  const router = useRouter();
  const [appName, setAppName] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [features, setFeatures] = useState("");
  const [toneStyle, setToneStyle] = useState<ToneStyle>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListingGenerationOutput | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedShort, setEditedShort] = useState("");
  const [editedLong, setEditedLong] = useState("");
  const [meta, setMeta] = useState<ApiSuccess["meta"]>();
  const [listingGenerationId, setListingGenerationId] = useState<
    string | undefined
  >();
  const [trackKwBusy, setTrackKwBusy] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [exportPlayOpen, setExportPlayOpen] = useState(false);
  const [logoGenOpen, setLogoGenOpen] = useState(false);
  const [previewShortDesc, setPreviewShortDesc] = useState("");
  const [previewIconUrl, setPreviewIconUrl] = useState("");
  const [autofillBusy, setAutofillBusy] = useState<AutofillField | null>(null);
  const [autofillGate, setAutofillGate] = useState<{
    appName?: boolean;
    category?: boolean;
  }>({});
  const [aiCreditsRemaining, setAiCreditsRemaining] = useState<number | null>(
    typeof initialAiCreditsRemaining === "number"
      ? initialAiCreditsRemaining
      : null,
  );

  /** Last workspace-app id applied by the picker; used to detect real row changes vs refetch-only. */
  const workspacePickerPrevIdRef = useRef<string>("");
  /** One-time auto-select first workspace app so the picker is not left blank on first load. */
  const autoPickedInitialAppRef = useRef(false);
  const generateNoAppToastShownRef = useRef(false);
  const [pickAppGate, setPickAppGate] = useState(false);

  const [hydrationByApp, setHydrationByApp] = useState<
    Record<string, ListingOptimizerHydrationPayload>
  >(() => initialHydrationByApp ?? {});

  const [lastGeneratedAtIso, setLastGeneratedAtIso] = useState<string | null>(
    null,
  );

  const lastGeneratedLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale === "ar" ? "ar" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [intlLocale],
  );

  useEffect(() => {
    if (initialHydrationByApp) {
      setHydrationByApp(initialHydrationByApp);
    }
  }, [initialHydrationByApp]);

  const appliedNoAppHydrationRef = useRef(false);

  useEffect(() => {
    if (typeof initialAiCreditsRemaining === "number") {
      setAiCreditsRemaining(initialAiCreditsRemaining);
    }
  }, [initialAiCreditsRemaining]);

  useEffect(() => {
    if (!result) return;
    setEditedTitle(result.title);
    setEditedShort(result.shortDescription);
    setEditedLong(result.fullDescription);
  }, [result]);

  const queryClient = useQueryClient();
  const limits = useAppLimits(workspaceId, {
    initialData: initialAppLimits,
  });
  const appsQuery = useQuery({
    queryKey: workspaceAppsQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    ...(initialApps !== undefined ? { initialData: initialApps } : {}),
    /** Always reconcile with the API on mount — long `staleTime` hid failures and skipped refetch. */
    staleTime: 0,
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error(t("appContext.missingWorkspaceId"));
      }
      const res = await fetch(`/api/workspaces/${workspaceId}/apps`, {
        credentials: "include",
      });
      const raw = await res.text();
      let json: unknown;
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? t("appContext.appsErrorInvalid")
            : t("appContext.appsErrorStatus", { status: res.status }),
        );
      }
      const body = json as {
        ok?: boolean;
        apps?: {
          id: string;
          name: string;
          metadata?: Record<string, unknown> | null;
          icon_url?: string | null;
        }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? t("appContext.appsErrorStatus", { status: res.status }));
      }
      if (body.ok !== true) {
        throw new Error(body.error?.message ?? t("appContext.appsError"));
      }
      const rows = body.apps ?? [];
      return rows.map((a) => ({
        id: String((a as { id?: unknown }).id ?? ""),
        name: String((a as { name?: unknown }).name ?? ""),
        metadata:
          (a as { metadata?: Record<string, unknown> | null }).metadata ?? null,
        icon_url:
          typeof (a as { icon_url?: unknown }).icon_url === "string" &&
          (a as { icon_url: string }).icon_url.trim()
            ? (a as { icon_url: string }).icon_url.trim()
            : null,
      }));
    },
  });

  const appsList = appsQuery.data ?? [];
  const selectedAppRow = useMemo(() => {
    const list = appsQuery.data;
    if (!list) return undefined;
    return list.find((a) => a.id === selectedAppId);
  }, [appsQuery.data, selectedAppId]);
  const selectedPersistedIconUrl = useMemo(() => {
    if (!selectedAppRow) return "";
    return readAppListingMeta(
      selectedAppRow.metadata,
      selectedAppRow.icon_url,
    ).iconUrl;
  }, [selectedAppRow]);
  const showChangeLogoBtn = Boolean(
    selectedAppId &&
      (previewIconUrl.trim().length > 0 ||
        selectedPersistedIconUrl.trim().length > 0),
  );
  const appsBusy =
    (appsQuery.isLoading && initialApps === undefined) ||
    (appsQuery.isFetching && appsList.length === 0);

  const canSubmit = useMemo(() => {
    const appGateOk =
      appsList.length === 0 || Boolean(selectedAppId.trim());
    return (
      Boolean(workspaceId) &&
      appGateOk &&
      appName.trim().length > 0 &&
      category.trim().length > 0 &&
      keywords.trim().length > 0 &&
      features.trim().length > 0 &&
      !loading
    );
  }, [
    workspaceId,
    appsList.length,
    selectedAppId,
    appName,
    category,
    keywords,
    features,
    loading,
  ]);

  const planLabelForLimits = limits.data
    ? PLAN_META[normalizePlan(limits.data.plan)].label
    : "";

  function onWorkspaceAppChange(id: string) {
    setSelectedAppId(id);
    if (id) {
      generateNoAppToastShownRef.current = false;
    }
    if (!id) {
      workspacePickerPrevIdRef.current = "";
      setPreviewShortDesc("");
      setPreviewIconUrl("");
      setPickAppGate(false);
      return;
    }

    const row = appsQuery.data?.find((a) => a.id === id);
    if (!row) return;

    const prevPickerId = workspacePickerPrevIdRef.current;
    const switchingApps = prevPickerId !== id;
    workspacePickerPrevIdRef.current = id;

    const appRowMeta = readAppListingMeta(row.metadata, row.icon_url);
    const displayName = row.name.trim();

    const hyd = hydrationByApp[id];

    if (hyd) {
      setAppName(hyd.appName.trim() || displayName);
      setCategory(hyd.category.trim() || appRowMeta.category);
      setKeywords(hyd.keywordsText);
      setFeatures(hyd.appFeatures);
      setToneStyle(hyd.toneStyle);
      setListingGenerationId(hyd.generationId);
      setLastGeneratedAtIso(hyd.createdAt);
      setMeta(undefined);
      if (hyd.output) {
        setResult(hyd.output);
        setEditedTitle(hyd.output.title);
        setEditedShort(hyd.output.shortDescription);
        setEditedLong(hyd.output.fullDescription);
      } else {
        setResult(null);
        setEditedTitle("");
        setEditedShort("");
        setEditedLong("");
      }
      if (switchingApps || !previewShortDesc.trim()) {
        setPreviewShortDesc(appRowMeta.shortDescription);
      }
      if (switchingApps || !previewIconUrl.trim()) {
        setPreviewIconUrl(appRowMeta.iconUrl);
      }
      setPickAppGate(false);
      return;
    }

    // Picker-driven prefill: when the user selects a different workspace app,
    // always sync name + metadata-backed fields from that row (including default
    // Play titles like "Primary Google Play app" and empty metadata). When the
    // selection id is unchanged, only fill fields that are still empty so we do
    // not overwrite edits mid-session. (Native `<select>` only fires onChange on
    // real changes, so "switching apps" is the common path.)
    if (switchingApps || !appName.trim()) {
      setAppName(displayName);
    }
    if (switchingApps || !category.trim()) {
      setCategory(appRowMeta.category);
    }
    if (switchingApps || !previewShortDesc.trim()) {
      setPreviewShortDesc(appRowMeta.shortDescription);
    }
    if (switchingApps || !previewIconUrl.trim()) {
      setPreviewIconUrl(appRowMeta.iconUrl);
    }
    if (switchingApps) {
      setResult(null);
      setEditedTitle("");
      setEditedShort("");
      setEditedLong("");
      setListingGenerationId(undefined);
      setLastGeneratedAtIso(null);
      setMeta(undefined);
    }
    setPickAppGate(false);
  }

  useEffect(() => {
    if (appsBusy || appsQuery.isError) return;
    if (appsList.length === 0) return;
    if (selectedAppId) return;
    if (autoPickedInitialAppRef.current) return;
    autoPickedInitialAppRef.current = true;
    onWorkspaceAppChange(appsList[0].id);
    // `onWorkspaceAppChange` is stable enough for this one-shot init; listing deps would retrigger every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appsBusy, appsQuery.isError, appsList, selectedAppId]);

  useEffect(() => {
    if (appsBusy || appsQuery.isError) return;
    if (appsList.length > 0) return;
    if (!initialHydrationNoApp || appliedNoAppHydrationRef.current) return;
    appliedNoAppHydrationRef.current = true;
    const hyd = initialHydrationNoApp;
    setAppName(hyd.appName);
    setCategory(hyd.category);
    setKeywords(hyd.keywordsText);
    setFeatures(hyd.appFeatures);
    setToneStyle(hyd.toneStyle);
    setListingGenerationId(hyd.generationId);
    setLastGeneratedAtIso(hyd.createdAt);
    if (hyd.output) {
      setResult(hyd.output);
      setEditedTitle(hyd.output.title);
      setEditedShort(hyd.output.shortDescription);
      setEditedLong(hyd.output.fullDescription);
    }
  }, [
    appsBusy,
    appsQuery.isError,
    appsList.length,
    initialHydrationNoApp,
  ]);

  /** Keep Target Keywords / Features (and listing blocks) aligned with `listing_generations` after refresh and when switching apps. */
  useEffect(() => {
    const ws = workspaceId?.trim();
    const aid = selectedAppId.trim();
    if (!ws || !aid) return;
    if (appsBusy || appsQuery.isError) return;

    const ac = new AbortController();

    void (async () => {
      try {
        const res = await fetch(
          `/api/listings/latest?workspaceId=${encodeURIComponent(ws)}&appId=${encodeURIComponent(aid)}`,
          { credentials: "include", signal: ac.signal },
        );
        const raw = await res.text();
        let parsed: unknown;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          return;
        }
        const body = parsed as {
          ok?: boolean;
          data?: ListingOptimizerHydrationPayload | null;
        };
        if (ac.signal.aborted || body.ok !== true) return;

        const hyd = body.data;
        const row = appsList.find((a) => a.id === aid);
        const displayName = row?.name.trim() ?? "";
        const appRowMeta = row
          ? readAppListingMeta(row.metadata, row.icon_url)
          : { category: "", shortDescription: "", iconUrl: "" };

        if (!hyd) {
          setHydrationByApp((prev) => {
            const next = { ...prev };
            delete next[aid];
            return next;
          });
          if (row) {
            setAppName(displayName);
            setCategory(appRowMeta.category);
            setKeywords("");
            setFeatures("");
            setToneStyle("professional");
            setListingGenerationId(undefined);
            setLastGeneratedAtIso(null);
            setMeta(undefined);
            setResult(null);
            setEditedTitle("");
            setEditedShort("");
            setEditedLong("");
            setPreviewShortDesc(appRowMeta.shortDescription);
            setPreviewIconUrl(appRowMeta.iconUrl);
          }
          setPickAppGate(false);
          return;
        }

        setHydrationByApp((prev) => ({ ...prev, [aid]: hyd }));

        setAppName(hyd.appName.trim() || displayName);
        setCategory(hyd.category.trim() || appRowMeta.category);
        setKeywords(hyd.keywordsText);
        setFeatures(hyd.appFeatures);
        setToneStyle(hyd.toneStyle);
        setListingGenerationId(hyd.generationId);
        setLastGeneratedAtIso(hyd.createdAt);
        setMeta(undefined);
        if (hyd.output) {
          setResult(hyd.output);
          setEditedTitle(hyd.output.title);
          setEditedShort(hyd.output.shortDescription);
          setEditedLong(hyd.output.fullDescription);
        } else {
          setResult(null);
          setEditedTitle("");
          setEditedShort("");
          setEditedLong("");
        }
        setPreviewShortDesc(appRowMeta.shortDescription);
        setPreviewIconUrl(appRowMeta.iconUrl);
        setPickAppGate(false);
      } catch {
        /* aborted or network */
      }
    })();

    return () => ac.abort();
    // Intentionally omit appsList from deps — refetch only when workspace or selected app changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, selectedAppId, appsBusy, appsQuery.isError]);

  function tryOpenAddApp() {
    if (!workspaceId) return;
    const pre = precheckAddApp(limits);
    if (pre.outcome === "deny_wait") return;
    if (pre.outcome === "deny_limits_failed") return;
    if (pre.outcome === "deny_upgrade") {
      toast.message(t("appContext.atLimitToast"), {
        description: pre.snapshot.message ?? t("appContext.atLimitToastHint"),
      });
      setUpgradeOpen(true);
      return;
    }
    setAddAppOpen(true);
  }

  function applyCreatedApp(app: CreatedWorkspaceApp) {
    workspacePickerPrevIdRef.current = app.id;
    setSelectedAppId(app.id);
    setAppName(app.name.trim());
    const meta = readAppListingMeta(app.metadata, app.icon_url);
    setCategory(meta.category);
    setPreviewShortDesc(meta.shortDescription);
    setPreviewIconUrl(meta.iconUrl);
    toast.success(tAddApp("toast.success"));
  }

  function goToSettingsHome() {
    if (!workspaceId) return;
    router.push(`/app/${workspaceId}/settings`);
  }

  function clearAutofillGate(field: "appName" | "category") {
    setAutofillGate((g) => {
      const next = { ...g };
      delete next[field];
      return next;
    });
  }

  async function runAutofill(field: AutofillField) {
    if (!workspaceId) {
      setError(t("appContext.missingWorkspaceId"));
      return;
    }
    if (appsList.length > 0 && !selectedAppId.trim()) {
      setPickAppGate(true);
      if (!generateNoAppToastShownRef.current) {
        generateNoAppToastShownRef.current = true;
        toast.message(t("appContext.needAppToOptimize"));
      }
      return;
    }
    const nameOk = appName.trim().length > 0;
    const catOk = category.trim().length > 0;
    if (!nameOk || !catOk) {
      setAutofillGate({
        appName: !nameOk ? true : undefined,
        category: !catOk ? true : undefined,
      });
      toast.message(t("form.autofill.validationTitle"), {
        description: t("form.autofill.validationBody"),
      });
      return;
    }
    if (
      typeof aiCreditsRemaining === "number" &&
      aiCreditsRemaining < AI_CREDIT_COSTS.listing_optimizer_autofill
    ) {
      toast.message(t("form.autofill.insufficientTitle"), {
        description: `${t("form.creditsDetail", {
          rem: aiCreditsRemaining,
          req: AI_CREDIT_COSTS.listing_optimizer_autofill,
        })}${t("form.creditsSuffix")}`,
      });
      setUpgradeOpen(true);
      return;
    }
    setAutofillGate({});
    setAutofillBusy(field);
    setError(null);
    const autofillToastId = toast.loading(
      t("form.autofill.generatingToast", {
        credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
      }),
    );
    try {
      const res = await fetch("/api/listings/optimizer-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          appName: appName.trim(),
          category: category.trim(),
          field,
          language: locale,
          ...(selectedAppId.trim()
            ? {
                appId: selectedAppId.trim(),
                toneStyle,
                keywordsDraft: keywords,
                featuresDraft: features,
              }
            : {}),
        }),
      });
      const json = (await res.json()) as AutofillApiSuccess | ApiError;
      if (!json.ok) {
        if (res.status === 401) {
          toast.error(t("form.signInError"));
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
          toast.message(t("form.autofill.insufficientTitle"), {
            description: `${json.error.message}${suffix}${t("form.creditsSuffix")}`,
          });
          setUpgradeOpen(true);
          if (typeof rem === "number") {
            setAiCreditsRemaining(rem);
          }
        } else {
          toast.error(json.error.message || t("form.autofill.generationError"));
        }
        return;
      }
      const nextKeywords =
        field === "keywords" ? json.data.text : keywords;
      const nextFeatures =
        field === "features" ? json.data.text : features;
      if (field === "keywords") {
        setKeywords(json.data.text);
      } else {
        setFeatures(json.data.text);
      }

      const sid = selectedAppId.trim();
      const persistedOk = json.meta?.persistedInputs === true;
      const gid = json.meta?.generationId;
      const savedAtIso = json.meta?.savedAt;
      if (sid && persistedOk && gid && savedAtIso) {
        setListingGenerationId(gid);
        setHydrationByApp((prev) => ({
          ...prev,
          [sid]: {
            generationId: gid,
            createdAt: savedAtIso,
            appName: appName.trim(),
            category: category.trim(),
            keywordsText: nextKeywords.trim(),
            appFeatures: nextFeatures.trim(),
            toneStyle,
            output: prev[sid]?.output ?? null,
          },
        }));
      } else if (sid && json.meta?.persistedInputs === false) {
        toast.warning(t("form.autofill.persistFailed"));
      }

      const charged =
        json.meta?.creditsCharged ??
        AI_CREDIT_COSTS.listing_optimizer_autofill;
      const remaining = json.meta?.creditsRemaining;
      if (typeof remaining === "number") {
        setAiCreditsRemaining(remaining);
      }
      void router.refresh();
      toast.success(t("form.autofill.successTitle"), {
        description:
          typeof remaining === "number"
            ? t("form.autofill.successCredits", {
                used: charged,
                balance: remaining,
              })
            : t("form.autofill.successDescription"),
      });
    } catch {
      toast.error(t("form.networkError"));
    } finally {
      toast.dismiss(autofillToastId);
      setAutofillBusy(null);
    }
  }

  async function copyText(
    _label: string,
    text: string,
    playConsoleField?: PlayConsoleExportCopyField | "all",
  ) {
    try {
      await navigator.clipboard.writeText(text);
      if (playConsoleField) {
        const fieldName = t(
          `results.exportModal.fieldLabels.${playConsoleField}`,
        );
        toast.success(
          t("results.exportModal.copyToast", { field: fieldName }),
        );
      } else {
        toast.success(t("results.copiedTitle"), {
          description: t("results.copiedDescription"),
        });
      }
    } catch {
      window.prompt(t("results.copyPrompt"), text);
    }
  }

  function copyListingAllBlocks(data: {
    title: string;
    shortDescription: string;
    fullDescription: string;
  }) {
    const sep = "\n\n---\n\n";
    const parts = [
      `${t("results.exportModal.fieldLabels.appNameTitle")}\n${data.title}`,
      `${t("results.exportModal.fieldLabels.shortDescription")}\n${data.shortDescription}`,
      `${t("results.exportModal.fieldLabels.fullDescription")}\n${data.fullDescription}`,
    ];
    return parts.join(sep);
  }

  function downloadPlayConsoleExport() {
    if (!result) return;
    const data = clampedListing;
    const payload = {
      format: "playstore.xyz-listing-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      locale,
      appName: appName.trim(),
      category: category.trim(),
      title: data.title,
      shortDescription: data.shortDescription,
      fullDescription: data.fullDescription,
      keywordSuggestions: result.keywordSuggestions,
      ctaSuggestions: result.ctaSuggestions,
    };
    const json = JSON.stringify(payload, null, 2);
    const txt = [
      "=== Google Play listing export (PlayStore.xyz) ===",
      `Exported (UTC): ${payload.exportedAt}`,
      `App name: ${payload.appName}`,
      `Category: ${payload.category}`,
      "",
      "--- TITLE (Play Console) ---",
      data.title,
      "",
      "--- SHORT DESCRIPTION ---",
      data.shortDescription,
      "",
      "--- FULL DESCRIPTION ---",
      data.fullDescription,
      "",
      "--- ASO KEYWORD SUGGESTIONS ---",
      result.keywordSuggestions.join(", "),
      "",
      "--- CTA SUGGESTIONS ---",
      result.ctaSuggestions.join("\n"),
      "",
      "--- JSON (same data, machine-readable) ---",
      json,
    ].join("\n");

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `play-console-listing-${workspaceId ?? "export"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("results.exportSuccess"));
  }

  async function runListingGeneration(opts: {
    mode: "fresh" | "regenerate";
    userInstruction?: string;
    targetArabicOverride?: boolean;
    /** Internal: at most one automatic retry after `invalid_model_output` / 422. */
    _listingGenRetry?: boolean;
  }) {
    if (!workspaceId) {
      setError(t("appContext.missingWorkspaceId"));
      return;
    }
    if (appsList.length > 0 && !selectedAppId.trim()) {
      setPickAppGate(true);
      if (!generateNoAppToastShownRef.current) {
        generateNoAppToastShownRef.current = true;
        toast.message(t("appContext.needAppToOptimize"));
      }
      return;
    }
    if (
      appName.trim().length === 0 ||
      category.trim().length === 0 ||
      keywords.trim().length === 0 ||
      features.trim().length === 0
    ) {
      return;
    }
    if (loading) return;

    setError(null);
    if (opts.mode === "fresh") {
      setResult(null);
      setMeta(undefined);
      setListingGenerationId(undefined);
      setLastGeneratedAtIso(null);
    }

    if (
      typeof aiCreditsRemaining === "number" &&
      aiCreditsRemaining < AI_CREDIT_COSTS.listing_generation
    ) {
      toast.message(t("form.autofill.insufficientTitle"), {
        description: `${t("form.creditsDetail", {
          rem: aiCreditsRemaining,
          req: AI_CREDIT_COSTS.listing_generation,
        })}${t("form.creditsSuffix")}`,
      });
      setUpgradeOpen(true);
      return;
    }
    const runToastId = toast.loading(
      t("form.generateStarting", {
        credits: AI_CREDIT_COSTS.listing_generation,
      }),
    );
    setLoading(true);
    try {
      const res = await fetch("/api/listings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...(selectedAppId.trim() ? { appId: selectedAppId.trim() } : {}),
          appName: appName.trim(),
          category: category.trim(),
          targetKeywords: keywords.trim(),
          appFeatures: features.trim(),
          toneStyle,
          targetArabic: opts.targetArabicOverride ?? locale === "ar",
          ...(opts.userInstruction
            ? { userInstruction: opts.userInstruction }
            : {}),
        }),
      });
      const json = (await res.json()) as ApiSuccess | ApiError;
      toast.dismiss(runToastId);
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
          setUpgradeOpen(true);
          if (typeof rem === "number") {
            setAiCreditsRemaining(rem);
          }
        } else if (
          (json.error.code === "invalid_model_output" ||
            res.status === 422) &&
          !opts._listingGenRetry
        ) {
          toast.message(t("form.invalidModelOutputRegenerating"));
          await runListingGeneration({
            ...opts,
            userInstruction: mergeListingGenerateRetryInstruction(
              opts.userInstruction,
            ),
            _listingGenRetry: true,
          });
        } else {
          setError(json.error.message || t("form.networkError"));
        }
        return;
      }
      const d = json.data;
      setResult(d);
      setEditedTitle(d.title);
      setEditedShort(d.shortDescription);
      setEditedLong(d.fullDescription);
      setMeta(json.meta);
      const generationIdFromApi = json.meta?.generationId;
      setListingGenerationId(generationIdFromApi);
      const savedIso =
        json.meta?.savedAt ?? new Date().toISOString();
      setLastGeneratedAtIso(savedIso);
      const sid = selectedAppId.trim();
      if (generationIdFromApi && sid) {
        const gid = generationIdFromApi;
        setHydrationByApp((prev) => ({
          ...prev,
          [sid]: {
            generationId: gid,
            createdAt: savedIso,
            appName: appName.trim(),
            category: category.trim(),
            keywordsText: keywords.trim(),
            appFeatures: features.trim(),
            toneStyle,
            output: d,
          },
        }));
      }
      if (json.meta?.persisted === false) {
        toast.warning(t("results.persistWarning"));
      } else {
        toast.success(t("form.generateSuccessToastSaved"));
      }
    } catch {
      toast.dismiss(runToastId);
      setError(t("form.networkError"));
    } finally {
      setLoading(false);
    }
  }

  async function trackKeywordsInKeywordTracker() {
    if (!workspaceId?.trim()) return;
    if (!selectedAppId.trim()) {
      toast.message(t("results.trackKeywords.needApp"));
      return;
    }
    if (!result?.keywordSuggestions?.length) return;
    if (!listingGenerationId) {
      toast.message(t("results.trackKeywords.persistHint"));
      return;
    }

    setTrackKwBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId.trim()}/keywords/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            terms: result.keywordSuggestions,
            appId: selectedAppId.trim(),
            listingGenerationId,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        creditsCharged?: number;
        creditsRemaining?: number;
        error?: {
          code?: string;
          message?: string;
          remaining?: number;
          required?: number;
        };
      };

      if (!res.ok || !json.ok) {
        if (
          res.status === 402 ||
          json.error?.code === "insufficient_credits"
        ) {
          toast.error(t("results.trackKeywords.insufficient"));
          setUpgradeOpen(true);
          if (typeof json.error?.remaining === "number") {
            setAiCreditsRemaining(json.error.remaining);
          }
          return;
        }
        toast.error(json.error?.message ?? t("results.trackKeywords.error"));
        return;
      }

      toast.success(t("results.trackKeywords.toastSaved"));
      if (typeof json.creditsRemaining === "number") {
        setAiCreditsRemaining(json.creditsRemaining);
      }
    } finally {
      setTrackKwBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runListingGeneration({ mode: "fresh" });
  }

  const shellClass = embedded
    ? "w-full min-h-0 max-w-full flex-1 rounded-2xl border border-white/[0.09] bg-gradient-to-b from-[#0a100d]/95 via-[#080c11]/98 to-[#06080c] px-0 py-7 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(34,197,94,0.08)] ring-1 ring-[#22C55E]/10 sm:py-9"
    : "min-h-screen bg-[#0B0E14] px-4 py-12 sm:px-6 lg:px-8";

  const showAppsEmpty =
    !appsQuery.isError && !appsBusy && appsList.length === 0;
  const previewConnected = Boolean(selectedAppId);
  const canRegenerate = Boolean(canSubmit && result);
  const resultsBusy = Boolean(loading && result);
  const logoGenTriggerDisabled =
    Boolean(resultsBusy) || !workspaceId || !selectedAppId.trim();
  const logoGenTriggerTitle = resultsBusy
    ? undefined
    : !workspaceId
      ? t("appContext.missingWorkspaceId")
      : !selectedAppId.trim()
        ? t("logo.selectAppFirstHint")
        : undefined;

  const clampedListing = useMemo(
    () => clampListingTexts(editedTitle, editedShort, editedLong),
    [editedTitle, editedShort, editedLong],
  );

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      className={cn(
        isRtl && "font-arabic",
        embedded && "flex min-h-0 w-full min-w-0 flex-1 flex-col",
        !embedded && "mx-auto max-w-5xl",
        shellClass,
      )}
    >
      <div
        className={cn(
          embedded && "flex min-h-0 min-w-0 flex-1 flex-col px-4 sm:px-6 lg:px-8",
        )}
      >
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        plan={limits.data?.plan ?? "free"}
        currentCount={limits.data?.currentCount ?? 0}
        appLimit={limits.data?.limit ?? 1}
      />
      {result ? (
        <PlayConsoleExportDialog
          open={exportPlayOpen}
          onOpenChange={setExportPlayOpen}
          dir={isRtl ? "rtl" : "ltr"}
          clamped={clampedListing}
          disabled={resultsBusy}
          onCopy={(field, text) => void copyText("export", text, field)}
          onCopyAllPlayConsole={() =>
            void copyText(
              "play-console-all",
              copyListingAllBlocks(clampedListing),
              "all",
            )
          }
          onDownloadTxt={() => downloadPlayConsoleExport()}
        />
      ) : null}

      {workspaceId ? (
        <AddAppModal
          open={addAppOpen}
          onOpenChange={setAddAppOpen}
          workspaceId={workspaceId}
          limits={limits}
          onRequestUpgrade={() => setUpgradeOpen(true)}
          onSuccess={applyCreatedApp}
          suppressSuccessToast
        />
      ) : null}

      {workspaceId && selectedAppId ? (
        <LogoGeneratorDialog
          open={logoGenOpen}
          onOpenChange={setLogoGenOpen}
          workspaceId={workspaceId}
          appId={selectedAppId}
          appName={appName.trim()}
          category={category.trim()}
          shortDescription={previewShortDesc}
          creditsRemaining={aiCreditsRemaining}
          onCreditsRemaining={setAiCreditsRemaining}
          onLogoSelected={(url) => {
            setPreviewIconUrl(url);
            if (workspaceId && selectedAppId) {
              queryClient.setQueryData(
                workspaceAppsQueryKey(workspaceId),
                (prev) => {
                  if (!Array.isArray(prev)) return prev;
                  return prev.map((a) =>
                    a.id === selectedAppId
                      ? {
                          ...a,
                          icon_url: url,
                          metadata: {
                            ...(typeof a.metadata === "object" && a.metadata
                              ? a.metadata
                              : {}),
                            icon_url: url,
                          },
                        }
                      : a,
                  );
                },
              );
            }
            void appsQuery.refetch();
            void router.refresh();
          }}
        />
      ) : null}

      <header className="mb-10 space-y-3 sm:mb-14 sm:space-y-3.5">
        {!embedded ? (
          <p className="text-sm font-semibold tracking-wide text-[#4ade80]">{t("eyebrow")}</p>
        ) : null}
        <h1
          className={cn(
            "font-semibold tracking-tight text-white",
            embedded ? "text-2xl sm:text-[1.65rem]" : "text-3xl sm:text-[2.125rem]",
          )}
        >
          {t("title")}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">{t("subtitle")}</p>
        <p
          className="flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium leading-relaxed text-[#86efac]/90 sm:text-[15px]"
          role="status"
          aria-label={[
            t("guidance.selectApp"),
            t("guidance.fillDetails"),
            t("guidance.aiAssist"),
            t("guidance.generate"),
          ].join(", ")}
        >
          <span>{t("guidance.selectApp")}</span>
          <span className="text-[#86efac]/45" aria-hidden>
            {isRtl ? t("guidance.sepRtl") : t("guidance.sepLtr")}
          </span>
          <span>{t("guidance.fillDetails")}</span>
          <span className="text-[#86efac]/45" aria-hidden>
            {isRtl ? t("guidance.sepRtl") : t("guidance.sepLtr")}
          </span>
          <span>{t("guidance.aiAssist")}</span>
          <span className="text-[#86efac]/45" aria-hidden>
            {isRtl ? t("guidance.sepRtl") : t("guidance.sepLtr")}
          </span>
          <span>{t("guidance.generate")}</span>
        </p>
      </header>

      <section
        dir={isRtl ? "rtl" : "ltr"}
        className="mb-11 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-[0_8px_28px_-16px_rgba(0,0,0,0.42)] backdrop-blur-sm sm:mb-14 sm:p-6"
        aria-label={t("appContext.label")}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4ade80]">
              {t("appContext.label")}
            </p>
            <p className="text-sm text-white/55">{t("appContext.hint")}</p>
          </div>
          {limits.data ? (
            <p className="text-xs text-white/45">
              {limits.data.limit === UNLIMITED_APP_SLOTS
                ? t("appContext.usageUnlimited", {
                    count: limits.data.currentCount,
                    plan: planLabelForLimits,
                  })
                : t("appContext.usage", {
                    count: limits.data.currentCount,
                    limit: limits.data.limit,
                    plan: planLabelForLimits,
                  })}
            </p>
          ) : limits.isLoading ? (
            <p className="text-xs text-white/40">{t("appContext.loadingLimits")}</p>
          ) : null}
        </div>

        {!workspaceId ? (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            {t("appContext.missingWorkspaceId")}
          </div>
        ) : null}

        {limits.isError ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
            <span>{t("appContext.limitsError")}</span>
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
              onClick={() => void limits.refetch()}
            >
              {t("appContext.retry")}
            </button>
          </div>
        ) : null}

        {appsQuery.isError ? (
          <div className="mt-4 space-y-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-4 text-sm text-red-100/90">
            <p className="font-medium">{t("appContext.appsError")}</p>
            {appsQuery.error instanceof Error && appsQuery.error.message ? (
              <p className="text-xs leading-relaxed text-red-200/75">{appsQuery.error.message}</p>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              onClick={() => void appsQuery.refetch()}
            >
              {t("appContext.retry")}
            </button>
          </div>
        ) : null}

        {appsBusy ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <p className="text-xs text-white/45">{t("appContext.loadingApps")}</p>
            <div className="h-4 w-40 animate-pulse rounded-md bg-white/10" />
            <div className="h-11 max-w-md animate-pulse rounded-xl bg-white/[0.08]" />
          </div>
        ) : null}

        {!appsQuery.isError && showAppsEmpty ? (
          <div className="mt-4 rounded-xl border border-white/[0.1] bg-[#05070c]/60 px-5 py-6 sm:px-6">
            <p className="text-sm font-semibold text-[#86efac]">{t("appContext.addFirstToOptimize")}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{t("appContext.emptyBody")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={tryOpenAddApp}
                disabled={limits.isLoading || limits.isError}
                className="inline-flex items-center justify-center rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("appContext.addAppCta")}
              </button>
              <button
                type="button"
                onClick={goToSettingsHome}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                {t("appContext.manageSettings")}
              </button>
            </div>
          </div>
        ) : null}

        {(appsQuery.isError ? appsList.length > 0 : !showAppsEmpty) && !appsBusy ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="text-xs font-medium text-white/70" htmlFor="workspace-app-select">
                {t("appContext.label")}
              </label>
              <select
                id="workspace-app-select"
                aria-invalid={pickAppGate ? true : undefined}
                aria-label={t("appContext.selectAria")}
                className={cn(
                  "w-full max-w-md rounded-xl border bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#22C55E]/25",
                  pickAppGate
                    ? "border-amber-400/45 focus:border-amber-400/55"
                    : "border-white/10 focus:border-[#22C55E]/50",
                )}
                value={selectedAppId}
                onChange={(e) => onWorkspaceAppChange(e.target.value)}
              >
                <option value="">—</option>
                {appsList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {pickAppGate ? (
                <p className="text-xs text-amber-200/90" role="status">
                  {t("appContext.needAppInline")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={tryOpenAddApp}
                disabled={limits.isLoading || limits.isError}
                className="inline-flex items-center justify-center rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 px-4 py-2.5 text-sm font-semibold text-[#86efac] transition hover:bg-[#22C55E]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("appContext.addApp")}
              </button>
              <button
                type="button"
                onClick={goToSettingsHome}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                {t("appContext.manageSettings")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid min-h-0 min-w-0 items-start gap-12 sm:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start lg:gap-x-12 lg:gap-y-12">
        <div className="flex min-h-0 min-w-0 flex-col gap-12 sm:gap-14">
          <section
            dir={isRtl ? "rtl" : "ltr"}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-6 shadow-[0_8px_32px_-18px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-8"
          >
            <form className="space-y-10 sm:space-y-11" onSubmit={onSubmit}>
              <div className="space-y-5">
                <h2
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50"
                  title={t("form.sectionStoreTitle")}
                >
                  {t("form.sectionStore")}
                </h2>
                <p className="text-xs leading-relaxed text-white/45">
                  {t("form.sectionStoreHelper")}
                </p>
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80" htmlFor="lo-app-name">
                      {t("form.appName")}
                    </label>
                    <input
                      id="lo-app-name"
                      aria-invalid={autofillGate.appName ? true : undefined}
                      className={cn(
                        "w-full rounded-xl border bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none ring-0 transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/22",
                        autofillGate.appName
                          ? "border-red-400/45 focus:border-red-400/55"
                          : "border-white/[0.09] focus:border-[#22C55E]/45",
                      )}
                      value={appName}
                      onChange={(e) => {
                        setAppName(e.target.value);
                        clearAutofillGate("appName");
                      }}
                      placeholder={t("form.appNamePlaceholder")}
                      autoComplete="off"
                    />
                    {autofillGate.appName ? (
                      <p className="text-xs text-red-300/90">{t("form.autofill.needAppName")}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80" htmlFor="lo-category">
                      {t("form.category")}
                    </label>
                    <input
                      id="lo-category"
                      aria-invalid={autofillGate.category ? true : undefined}
                      className={cn(
                        "w-full rounded-xl border bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/22",
                        autofillGate.category
                          ? "border-red-400/45 focus:border-red-400/55"
                          : "border-white/[0.09] focus:border-[#22C55E]/45",
                      )}
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        clearAutofillGate("category");
                      }}
                      placeholder={t("form.categoryPlaceholder")}
                      autoComplete="off"
                    />
                    {autofillGate.category ? (
                      <p className="text-xs text-red-300/90">{t("form.autofill.needCategory")}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <Separator className="bg-white/[0.07]" />

              <div className="space-y-6">
                <h2
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50"
                  title={t("form.sectionDiscoveryTitle")}
                >
                  {t("form.sectionDiscovery")}
                </h2>
                <p className="text-xs leading-relaxed text-white/45">
                  {t("form.sectionDiscoveryHelper")}
                </p>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <label
                        className="min-w-0 max-w-[min(100%,28rem)] text-sm font-medium text-white/80"
                        htmlFor="lo-keywords"
                        title={t("form.keywordsFieldTitle")}
                      >
                        {t("form.keywords")}
                      </label>
                      <div className="ms-auto flex min-w-0 flex-col items-end gap-1.5">
                        <button
                          type="button"
                          title={t("form.autofill.tooltip")}
                          disabled={Boolean(autofillBusy) || !workspaceId}
                          onClick={() => void runAutofill("keywords")}
                          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[#22C55E]/45 bg-[#22C55E]/[0.07] px-4 py-2.5 text-sm font-semibold tracking-tight text-[#d1fae5] shadow-none transition hover:bg-[#22C55E]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {autofillBusy === "keywords"
                            ? t("form.autofill.loadingKeywords")
                            : t("form.autofill.button")}
                        </button>
                        <p className="max-w-[16rem] text-end text-xs leading-snug text-white/45">
                          {t("form.autofill.usesCredits", {
                            credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
                          })}
                        </p>
                      </div>
                    </div>
                    <textarea
                      id="lo-keywords"
                      aria-busy={autofillBusy === "keywords" ? true : undefined}
                      className="min-h-[92px] w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#22C55E]/40 focus:ring-2 focus:ring-[#22C55E]/18 disabled:opacity-60"
                      value={keywords}
                      disabled={autofillBusy === "keywords"}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder={t("form.keywordsPlaceholder")}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <label
                        className="min-w-0 max-w-[min(100%,28rem)] text-sm font-medium text-white/80"
                        htmlFor="lo-features"
                        title={t("form.featuresFieldTitle")}
                      >
                        {t("form.features")}
                      </label>
                      <div className="ms-auto flex min-w-0 flex-col items-end gap-1.5">
                        <button
                          type="button"
                          title={t("form.autofill.tooltip")}
                          disabled={Boolean(autofillBusy) || !workspaceId}
                          onClick={() => void runAutofill("features")}
                          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[#22C55E]/45 bg-[#22C55E]/[0.07] px-4 py-2.5 text-sm font-semibold tracking-tight text-[#d1fae5] shadow-none transition hover:bg-[#22C55E]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {autofillBusy === "features"
                            ? t("form.autofill.loadingFeatures")
                            : t("form.autofill.button")}
                        </button>
                        <p className="max-w-[16rem] text-end text-xs leading-snug text-white/45">
                          {t("form.autofill.usesCredits", {
                            credits: AI_CREDIT_COSTS.listing_optimizer_autofill,
                          })}
                        </p>
                      </div>
                    </div>
                    <textarea
                      id="lo-features"
                      aria-busy={autofillBusy === "features" ? true : undefined}
                      className="min-h-[144px] w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#22C55E]/40 focus:ring-2 focus:ring-[#22C55E]/18 disabled:opacity-60"
                      value={features}
                      disabled={autofillBusy === "features"}
                      onChange={(e) => setFeatures(e.target.value)}
                      placeholder={t("form.featuresPlaceholder")}
                    />
                  </div>
                </div>
              </div>

              <Separator className="bg-white/[0.07]" />

              <div className="space-y-5 rounded-2xl border border-[#22C55E]/14 bg-gradient-to-br from-[#22C55E]/[0.05] to-transparent p-5 ring-1 ring-[#22C55E]/8 sm:space-y-6 sm:p-6">
                <h2
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50"
                  title={t("form.sectionVoiceTitle")}
                >
                  {t("form.sectionVoice")}
                </h2>
                <p className="text-xs leading-relaxed text-white/45">
                  {t("form.sectionVoiceHelper", {
                    credits: AI_CREDIT_COSTS.listing_generation,
                  })}
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/80" htmlFor="lo-tone">
                    {t("form.tone")}
                  </label>
                  <select
                    id="lo-tone"
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#22C55E]/40 focus:ring-2 focus:ring-[#22C55E]/18 sm:max-w-md"
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

                <p className="text-sm font-medium leading-relaxed text-white/82">
                  {t("form.generateLead")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-4 sm:gap-y-2">
                  <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-start">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      aria-busy={loading ? true : undefined}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-[#22C55E] px-8 py-3.5 text-base font-semibold text-white shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] ring-2 ring-[#22C55E]/25 transition hover:bg-[#16a34a] hover:shadow-[0_12px_32px_-8px_rgba(34,197,94,0.5)] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50 disabled:shadow-none disabled:ring-0 sm:w-auto sm:min-w-[260px]"
                    >
                      {loading ? t("form.generating") : t("form.generate")}
                    </button>
                    <p className="text-center text-xs font-medium text-white/55 sm:text-start">
                      {t("form.generateCostLabel", {
                        credits: AI_CREDIT_COSTS.listing_generation,
                      })}
                    </p>
                  </div>
                  {loading ? (
                    <span className="self-center text-sm text-white/45 sm:self-center">
                      {t("form.generatingHint")}
                    </span>
                  ) : null}
                </div>
              </div>
            </form>
          </section>

          {result ? (
            <section
              dir={isRtl ? "rtl" : "ltr"}
              className="relative flex min-h-0 min-w-0 flex-col gap-12 sm:gap-14"
              aria-labelledby="listing-results-heading"
            >
              {resultsBusy ? (
                <div
                  className="flex items-center gap-3 rounded-2xl border border-[#22C55E]/35 bg-[#22C55E]/10 px-4 py-3 text-sm text-[#bbf7d0] shadow-[inset_0_1px_0_0_rgba(34,197,94,0.12)]"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.6)]"
                    aria-hidden
                  />
                  {t("results.regenerating")}
                </div>
              ) : null}

              <div className="space-y-4 border-b border-white/[0.06] pb-11 sm:pb-12">
                <h2
                  id="listing-results-heading"
                  className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
                >
                  {t("results.heading")}
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-white/58 sm:text-[15px] sm:leading-[1.65]">
                  {t("results.subheading")}
                </p>
                {lastGeneratedAtIso && result ? (
                  <p className="text-xs font-medium text-emerald-300/88">
                    {t("results.lastGeneratedLine", {
                      date: lastGeneratedLabelFormatter.format(
                        new Date(lastGeneratedAtIso),
                      ),
                    })}
                  </p>
                ) : null}
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

              <div className="flex flex-col gap-12 sm:gap-14">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.028] p-6 shadow-[0_14px_48px_-26px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-7">
                  <label
                    className="block text-[15px] font-semibold tracking-tight text-white/92"
                    htmlFor="lo-res-title"
                  >
                    {t("results.titleBlock")}
                  </label>
                  <input
                    id="lo-res-title"
                    disabled={resultsBusy}
                    aria-invalid={
                      editedTitle.length > LISTING_TITLE_MAX ? true : undefined
                    }
                    aria-describedby="lo-res-title-count lo-res-title-hint"
                    className={cn(
                      "mt-4 w-full rounded-xl border bg-black/30 px-3.5 py-3.5 text-[15px] leading-snug text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/22 disabled:opacity-50",
                      editedTitle.length > LISTING_TITLE_MAX
                        ? "border-red-400/45 focus:border-red-400/55"
                        : "border-white/[0.09] focus:border-[#22C55E]/45",
                    )}
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span
                      id="lo-res-title-count"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className={cn(
                        "text-[13px] font-medium tabular-nums tracking-tight",
                        charCountToneClass(
                          listingCountTone(
                            editedTitle.length,
                            LISTING_TITLE_MAX,
                            LISTING_TITLE_WARN_FROM,
                          ),
                        ),
                      )}
                    >
                      {t("results.charCount", {
                        current: editedTitle.length,
                        max: LISTING_TITLE_MAX,
                      })}
                    </span>
                  </div>
                  <p
                    id="lo-res-title-hint"
                    className="mt-2.5 text-[12px] leading-relaxed text-white/44"
                  >
                    {t("results.titleLimitHint")}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.028] p-6 shadow-[0_14px_48px_-26px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-7">
                  <label
                    className="block text-[15px] font-semibold tracking-tight text-white/92"
                    htmlFor="lo-res-short"
                  >
                    {t("results.shortBlock")}
                  </label>
                  <textarea
                    id="lo-res-short"
                    rows={4}
                    disabled={resultsBusy}
                    aria-invalid={
                      editedShort.length > LISTING_SHORT_MAX ? true : undefined
                    }
                    aria-describedby="lo-res-short-count lo-res-short-hint"
                    className={cn(
                      "mt-4 min-h-[6.75rem] w-full resize-y rounded-xl border bg-black/30 px-3.5 py-3.5 text-[15px] leading-relaxed text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/22 disabled:opacity-50",
                      editedShort.length > LISTING_SHORT_MAX
                        ? "border-red-400/45 focus:border-red-400/55"
                        : "border-white/[0.09] focus:border-[#22C55E]/45",
                    )}
                    value={editedShort}
                    onChange={(e) => setEditedShort(e.target.value)}
                  />
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span
                      id="lo-res-short-count"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className={cn(
                        "text-[13px] font-medium tabular-nums tracking-tight",
                        charCountToneClass(
                          listingCountTone(
                            editedShort.length,
                            LISTING_SHORT_MAX,
                            LISTING_SHORT_WARN_FROM,
                          ),
                        ),
                      )}
                    >
                      {t("results.charCount", {
                        current: editedShort.length,
                        max: LISTING_SHORT_MAX,
                      })}
                    </span>
                  </div>
                  <p
                    id="lo-res-short-hint"
                    className="mt-2.5 text-[12px] leading-relaxed text-white/44"
                  >
                    {t("results.shortLimitHint")}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.028] p-6 shadow-[0_14px_48px_-26px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-7">
                  <label
                    className="block text-[15px] font-semibold tracking-tight text-white/92"
                    htmlFor="lo-res-long"
                  >
                    {t("results.fullBlock")}
                  </label>
                  <textarea
                    id="lo-res-long"
                    rows={14}
                    disabled={resultsBusy}
                    aria-invalid={
                      editedLong.length > LISTING_LONG_MAX ? true : undefined
                    }
                    aria-describedby="lo-res-long-count lo-res-long-helper lo-res-long-hint"
                    className={cn(
                      "mt-4 min-h-[min(28rem,52vh)] w-full resize-y rounded-xl border bg-black/30 px-3.5 py-3.5 text-[15px] leading-relaxed text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/22 disabled:opacity-50",
                      editedLong.length > LISTING_LONG_MAX
                        ? "border-red-400/45 focus:border-red-400/55"
                        : "border-white/[0.09] focus:border-[#22C55E]/45",
                    )}
                    value={editedLong}
                    onChange={(e) => setEditedLong(e.target.value)}
                  />
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span
                      id="lo-res-long-count"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className={cn(
                        "text-[13px] font-medium tabular-nums tracking-tight",
                        charCountToneClass(
                          listingCountTone(
                            editedLong.length,
                            LISTING_LONG_MAX,
                            LISTING_LONG_WARN_FROM,
                          ),
                        ),
                      )}
                    >
                      {t("results.charCount", {
                        current: editedLong.length,
                        max: LISTING_LONG_MAX,
                      })}
                    </span>
                  </div>
                  <p
                    id="lo-res-long-helper"
                    className="mt-3.5 text-[12px] leading-relaxed text-white/44"
                  >
                    {t("results.longDescriptionHint")}
                  </p>
                  <p
                    id="lo-res-long-hint"
                    className="mt-2 text-[12px] leading-relaxed text-white/40"
                  >
                    {t("results.longLimitHint")}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-x-2 sm:gap-y-2">
                  <button
                    type="button"
                    disabled={resultsBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#22C55E] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_-6px_rgba(34,197,94,0.45)] ring-2 ring-[#22C55E]/25 transition hover:bg-[#16a34a] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[132px]"
                    onClick={() =>
                      void copyText(
                        "all",
                        copyListingAllBlocks(clampedListing),
                      )
                    }
                  >
                    {t("results.copyAllPrimary")}
                  </button>
                  <button
                    type="button"
                    disabled={resultsBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/18 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#bbf7d0] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-0"
                    onClick={() =>
                      void copyText("title", clampedListing.title)
                    }
                  >
                    {t("results.copyTitleButton")}
                  </button>
                  <button
                    type="button"
                    disabled={resultsBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/18 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#bbf7d0] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-0"
                    onClick={() =>
                      void copyText(
                        "short",
                        clampedListing.shortDescription,
                      )
                    }
                  >
                    {t("results.copyShortDescription")}
                  </button>
                  <button
                    type="button"
                    disabled={resultsBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/18 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#bbf7d0] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-0"
                    onClick={() =>
                      void copyText(
                        "long",
                        clampedListing.fullDescription,
                      )
                    }
                  >
                    {t("results.copyLongDescription")}
                  </button>
                  <button
                    type="button"
                    disabled={resultsBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/18 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-[#22C55E]/40 hover:bg-[#22C55E]/10 hover:text-[#bbf7d0] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-0"
                    onClick={() => setExportPlayOpen(true)}
                  >
                    {t("results.exportPlayConsole")}
                  </button>
                </div>
                <div className="flex w-full shrink-0 lg:w-auto lg:justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={!canRegenerate || resultsBusy}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/88 transition hover:border-[#22C55E]/35 hover:bg-[#22C55E]/10 hover:text-[#bbf7d0] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                      >
                        {t("results.regenerate.label")}
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[14rem] border border-white/10 bg-[#10141c] p-1 text-white shadow-xl"
                    >
                      <DropdownMenuItem
                        className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-[#22C55E]/15 focus:text-white"
                        onSelect={() =>
                          void runListingGeneration({
                            mode: "regenerate",
                            userInstruction: REGENERATE_MODEL_INSTRUCTIONS.punchier,
                          })
                        }
                      >
                        {t("results.regenerate.punchier")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-[#22C55E]/15 focus:text-white"
                        onSelect={() =>
                          void runListingGeneration({
                            mode: "regenerate",
                            userInstruction: REGENERATE_MODEL_INSTRUCTIONS.professional,
                          })
                        }
                      >
                        {t("results.regenerate.professional")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-[#22C55E]/15 focus:text-white"
                        onSelect={() =>
                          void runListingGeneration({
                            mode: "regenerate",
                            userInstruction: REGENERATE_MODEL_INSTRUCTIONS.arabic,
                            targetArabicOverride: true,
                          })
                        }
                      >
                        {t("results.regenerate.arabic")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-[#22C55E]/15 focus:text-white"
                        onSelect={() =>
                          void runListingGeneration({
                            mode: "regenerate",
                            userInstruction: REGENERATE_MODEL_INSTRUCTIONS.tone,
                          })
                        }
                      >
                        {t("results.regenerate.tone")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex w-full justify-center border-t border-white/[0.06] pt-8 sm:pt-9">
                <div
                  className={cn(
                    "relative w-full max-w-lg rounded-2xl p-[1px]",
                    "bg-gradient-to-br from-[#22C55E]/55 via-[#22C55E]/18 to-[#22C55E]/42",
                    "shadow-[0_0_52px_-14px_rgba(34,197,94,0.45),0_0_0_1px_rgba(34,197,94,0.14)_inset]",
                    "transition-[box-shadow,filter] duration-300 ease-out",
                    "hover:shadow-[0_0_64px_-12px_rgba(34,197,94,0.52),0_0_0_1px_rgba(34,197,94,0.2)_inset]",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-col items-stretch gap-2 rounded-[0.9375rem] bg-[#0a100e]/95 px-4 py-3.5 sm:items-center sm:px-5 sm:py-4",
                      "ring-1 ring-inset ring-white/[0.04]",
                    )}
                  >
                    <button
                      type="button"
                      disabled={logoGenTriggerDisabled}
                      title={logoGenTriggerTitle}
                      aria-label={
                        logoGenTriggerTitle
                          ? `${t("logo.openButton")}. ${logoGenTriggerTitle}`
                          : t("logo.openButton")
                      }
                      aria-describedby="lo-logo-cta-microcopy"
                      onClick={() => {
                        if (!logoGenTriggerDisabled) setLogoGenOpen(true);
                      }}
                      className={cn(
                        "relative inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border border-[#22C55E]/44 bg-[#22C55E]/[0.1] px-5 py-3 text-sm font-semibold text-[#86efac]",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_24px_-14px_rgba(34,197,94,0.35)]",
                        "ring-2 ring-[#22C55E]/22 transition-[border-color,box-shadow,ring-color,transform,background-color,color] duration-200 ease-out",
                        "hover:border-[#22C55E]/58 hover:bg-[#22C55E]/16 hover:text-[#d1fae5] hover:shadow-[0_10px_36px_-12px_rgba(34,197,94,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] hover:ring-[#22C55E]/38",
                        "active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[min(100%,17.5rem)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a100e]",
                      )}
                    >
                      {t("logo.openButton")}
                    </button>
                    <p
                      id="lo-logo-cta-microcopy"
                      className="text-start text-[11px] leading-relaxed text-white/52 sm:text-xs"
                    >
                      {t("logo.ctaMicrocopy", {
                        credits: AI_CREDIT_COSTS.listing_logo_generation,
                      })}
                    </p>
                    {result &&
                    workspaceId &&
                    !resultsBusy &&
                    !selectedAppId.trim() ? (
                      <p className="text-start text-xs font-medium leading-relaxed text-amber-200/90" role="status">
                        {appsList.length > 0
                          ? t("logo.selectAppFirstHint")
                          : t("logo.addWorkspaceAppForLogo")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-7 sm:gap-8">
                <ResultList
                  title={t("results.keywordsList")}
                  items={result.keywordSuggestions}
                  copyLabel={t("results.copyAll")}
                  onCopyAll={() =>
                    copyText("keywords", result.keywordSuggestions.join(", "))
                  }
                />
                {workspaceId &&
                selectedAppId.trim() &&
                listingGenerationId &&
                !resultsBusy ? (
                  <div
                    className={cn(
                      "rounded-2xl border border-emerald-500/30 bg-[#07120e]/90 p-6 shadow-[0_0_40px_-18px_rgba(34,197,94,0.35)] ring-1 ring-emerald-500/15",
                      isRtl && "text-end",
                    )}
                  >
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-emerald-400/95">
                      {t("results.trackKeywords.kicker")}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-200/95">
                      {t("results.trackKeywords.pricingLine", {
                        free: KEYWORD_TRACK_AI_FREE_PER_GENERATION,
                        per: AI_CREDIT_COSTS.keyword_track_ai_per_keyword,
                      })}
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                      <button
                        type="button"
                        disabled={trackKwBusy}
                        onClick={() => void trackKeywordsInKeywordTracker()}
                        className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_-8px_rgba(34,197,94,0.45)] ring-2 ring-emerald-500/25 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                      >
                        {trackKwBusy
                          ? t("results.trackKeywords.busy")
                          : t("results.trackKeywords.cta")}
                      </button>
                      <Link
                        href={`/app/${workspaceId}/keywords`}
                        className="text-center text-sm font-medium text-emerald-300/95 underline-offset-4 hover:text-emerald-200 hover:underline sm:text-start"
                      >
                        {t("results.trackKeywords.secondaryLink")}
                      </Link>
                    </div>
                  </div>
                ) : workspaceId &&
                  selectedAppId.trim() &&
                  !listingGenerationId &&
                  !resultsBusy ? (
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                    {t("results.trackKeywords.persistHint")}
                  </p>
                ) : null}
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
            <section className="rounded-2xl border border-dashed border-white/[0.14] bg-white/[0.025] px-6 py-10 text-center text-sm leading-relaxed text-white/52 ring-1 ring-inset ring-[#22C55E]/10 backdrop-blur-sm">
              {t("empty.body")}
            </section>
          )}
        </div>

        <aside className="flex w-full flex-col items-center gap-5 lg:sticky lg:top-8 lg:max-h-[min(calc(100dvh-5rem),920px)] lg:w-auto lg:overflow-y-auto lg:self-start lg:overscroll-contain">
          <div className="relative w-full max-w-[360px] overflow-visible">
            {showChangeLogoBtn ? (
              <button
                type="button"
                onClick={() => setLogoGenOpen(true)}
                aria-label={t("preview.clickToChangeLogo")}
                title={t("preview.clickToChangeLogo")}
                className={cn(
                  "absolute end-2 top-2 z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#22C55E]/38 bg-[#22C55E]/14 text-[#d1fae5] shadow-[0_4px_14px_-6px_rgba(34,197,94,0.35)] backdrop-blur-sm",
                  "transition-[transform,box-shadow,border-color,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-[#22C55E]/55 motion-safe:hover:bg-[#22C55E]/22 motion-safe:hover:shadow-[0_8px_22px_-8px_rgba(34,197,94,0.45)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080f0d]",
                )}
              >
                <ImagePlus className="size-3.5 shrink-0 opacity-95" aria-hidden />
              </button>
            ) : null}
            <div
              className={cn(
                "w-full max-w-[360px] rounded-2xl border bg-gradient-to-b from-[#0a1210]/96 via-[#080f0d] to-[#050807] p-5 shadow-[0_8px_28px_-16px_rgba(0,0,0,0.42),inset_0_1px_0_0_rgba(34,197,94,0.06)] backdrop-blur-md sm:p-6",
                previewConnected
                  ? "border-[#22C55E]/32 ring-1 ring-[#22C55E]/22 shadow-[0_12px_36px_-18px_rgba(34,197,94,0.16)]"
                  : "border-white/[0.07] ring-1 ring-[#22C55E]/10",
              )}
            >
              <LivePreviewPhone
                appName={appName}
                category={category}
                keywords={keywords}
                featuresDraft={features}
                draftShortDescription={previewShortDesc}
                iconUrl={previewIconUrl}
                previewFieldsOverride={
                  result ? clampedListing : null
                }
                result={result}
                loading={loading}
                scanActive={loading || autofillBusy !== null}
                previewDir={isRtl ? "rtl" : "ltr"}
                showEmptyIconAsoHint={!hasValidHttpsPreviewIcon(previewIconUrl)}
                onLogoSquircleClick={
                  !logoGenTriggerDisabled
                    ? () => setLogoGenOpen(true)
                    : undefined
                }
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.045] p-6 shadow-[0_10px_36px_-18px_rgba(0,0,0,0.45)] ring-1 ring-[#22C55E]/10 backdrop-blur-[12px] transition-[border-color,box-shadow] duration-200 hover:border-[#22C55E]/20 hover:shadow-[0_14px_40px_-16px_rgba(34,197,94,0.12)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight text-white/95">{props.title}</h3>
        <button
          type="button"
          onClick={async () => {
            await props.onCopyAll();
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-white/14 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/85 transition hover:border-[#22C55E]/35 hover:bg-[#22C55E]/10 hover:text-[#bbf7d0]"
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
