"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UpgradeModal } from "@/components/ui/upgrade-modal";
import type { AppLimitsData } from "@/hooks/use-app-limits";
import { appLimitsQueryKey, workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { useRouter } from "@/i18n/navigation";
import { normalizePlan, PLAN_META, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import { PLAY_STORE_CATEGORIES } from "@/lib/play-categories";
import { cn } from "@/lib/utils";
import { ANDROID_PACKAGE_NAME_REGEX } from "@/lib/validation/api";

const SHORT_DESCRIPTION_MAX = 80;

export type CreatedWorkspaceApp = {
  id: string;
  name: string;
  package_name: string | null;
  metadata: Record<string, unknown> | null;
  play_store_url?: string | null;
  target_countries?: string[] | null;
  created_at?: string;
};

type ApiErr = {
  ok: false;
  error: {
    code?: string;
    message: string;
    remaining?: number;
    required?: number;
    details?: unknown;
  };
};

function validHttpsAppIconUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s || !/^https:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AddAppModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  limits: {
    data: AppLimitsData | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  onRequestUpgrade?: () => void;
  onSuccess?: (app: CreatedWorkspaceApp) => void;
  /** When true, skip the success toast (caller shows `addApp.toast.success`, e.g. Listing Optimizer). */
  suppressSuccessToast?: boolean;
}) {
  const t = useTranslations("addApp");
  const intlLocale = useLocale();
  const isRtl = intlLocale === "ar";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [category, setCategory] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [iconPreviewBroken, setIconPreviewBroken] = useState(false);
  const [packageTouched, setPackageTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const packageError = useMemo(() => {
    const p = packageName.trim();
    if (!p) return null;
    if (p.length > 200) return t("errors.packageTooLong");
    if (!ANDROID_PACKAGE_NAME_REGEX.test(p)) {
      return t("errors.packageInvalid");
    }
    return null;
  }, [packageName, t]);

  const iconTrimmed = iconUrl.trim();
  const showIconPreview = validHttpsAppIconUrl(iconTrimmed) && !iconPreviewBroken;

  useEffect(() => {
    if (!props.open) return;
    setName("");
    setPackageName("");
    setCategory("");
    setShortDesc("");
    setIconUrl("");
    setIconPreviewBroken(false);
    setPackageTouched(false);
    setCategoryTouched(false);
    setNameTouched(false);
    setSubmitting(false);
    setServerError(null);
    submitLockRef.current = false;
    const id = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [props.open]);

  useEffect(() => {
    setIconPreviewBroken(false);
  }, [iconTrimmed]);

  function toastFirstSubmitError(): boolean {
    if (!name.trim()) {
      toast.error(t("errors.nameRequired"));
      return true;
    }
    if (!packageName.trim()) {
      toast.error(t("errors.packageRequired"));
      return true;
    }
    if (packageError) {
      toast.error(packageError);
      return true;
    }
    if (!category.trim()) {
      toast.error(t("errors.categoryRequired"));
      return true;
    }
    if (iconTrimmed && !validHttpsAppIconUrl(iconTrimmed)) {
      toast.error(t("errors.iconInvalid"));
      return true;
    }
    return false;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || submitLockRef.current) return;
    setNameTouched(true);
    setPackageTouched(true);
    setCategoryTouched(true);
    if (toastFirstSubmitError()) {
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      const nameTrimmed = name.trim();
      const packageTrimmed = packageName.trim();
      const short = shortDesc.trim().slice(0, SHORT_DESCRIPTION_MAX);

      /** Matches POST /api/workspaces/:workspaceId/apps — flat body; server maps into `metadata`. */
      const res = await fetch(`/api/workspaces/${props.workspaceId}/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: nameTrimmed,
          package_name: packageTrimmed,
          category: category.trim(),
          ...(short ? { short_description: short } : {}),
          ...(iconTrimmed ? { icon_url: iconTrimmed } : {}),
        }),
      });
      const json = (await res.json()) as
        | { ok: true; app: CreatedWorkspaceApp }
        | ApiErr;

      if (!json.ok) {
        const code = json.error.code;
        const errMsg = json.error.message?.trim() || t("errors.createFailed");

        if (res.status === 401) {
          const msg = t("errors.signIn");
          setServerError(msg);
          toast.error(msg);
          return;
        }

        if (res.status === 403 && code === "plan_app_limit") {
          setUpgradeOpen(true);
          props.onRequestUpgrade?.();
          toast.message(t("errors.atLimit"), {
            description: errMsg,
          });
          return;
        }

        if (res.status === 403 && code === "permission_denied") {
          const msg = t("errors.noPermission");
          setServerError(msg);
          toast.error(msg);
          return;
        }

        if (res.status === 403 && code === "forbidden") {
          const msg = t("errors.noWorkspaceAccess");
          setServerError(msg);
          toast.error(msg);
          return;
        }

        setServerError(errMsg);
        toast.error(errMsg);
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: workspaceAppsQueryKey(props.workspaceId),
      });
      await queryClient.refetchQueries({
        queryKey: workspaceAppsQueryKey(props.workspaceId),
      });
      await queryClient.invalidateQueries({
        queryKey: appLimitsQueryKey(props.workspaceId),
      });
      void router.refresh();
      if (!props.suppressSuccessToast) {
        toast.success(t("toast.success"));
      }
      props.onSuccess?.(json.app);
      props.onOpenChange(false);
    } catch {
      toast.error(t("errors.network"));
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  const limitsSnapshot = props.limits.data;

  const planLabel = limitsSnapshot
    ? PLAN_META[normalizePlan(limitsSnapshot.plan)].label
    : "";

  const nameInvalid = nameTouched && !name.trim();
  const packageEmptyInvalid = packageTouched && !packageName.trim();
  const categoryInvalid = categoryTouched && !category.trim();
  const iconInvalid = Boolean(iconTrimmed) && !validHttpsAppIconUrl(iconTrimmed);

  const submitDisabled =
    submitting ||
    !name.trim() ||
    !packageName.trim() ||
    Boolean(packageError) ||
    !category.trim() ||
    iconInvalid;

  return (
    <>
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        plan={limitsSnapshot?.plan ?? "free"}
        currentCount={limitsSnapshot?.currentCount ?? 0}
        appLimit={limitsSnapshot?.limit ?? 1}
      />
      <Dialog
        open={props.open}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          props.onOpenChange(open);
        }}
      >
        <DialogContent
          dir={isRtl ? "rtl" : "ltr"}
          lang={intlLocale}
          onPointerDownOutside={(e) => {
            if (submitting) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (submitting) e.preventDefault();
          }}
          overlayClassName="bg-black/70 backdrop-blur-md"
          closeButtonClassName="text-white/60 hover:text-white hover:bg-white/10"
          className={cn(
            "max-h-[min(92dvh,760px)] gap-0 overflow-y-auto border border-white/[0.1] bg-[#080c11]/96 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:max-w-lg sm:rounded-2xl sm:pb-0",
            isRtl && "font-arabic",
          )}
        >
          <DialogHeader className="space-y-2.5 border-b border-white/[0.07] px-5 py-6 text-start sm:space-y-3 sm:px-7 sm:py-7">
            <DialogTitle className="text-start text-lg font-semibold tracking-tight text-white sm:text-xl">
              {t("title")}
            </DialogTitle>
            <DialogDescription className="text-start text-sm leading-relaxed text-white/52 sm:text-[15px]">
              {t("subtitle")}
            </DialogDescription>
            {limitsSnapshot ? (
              <p className="text-start text-xs text-white/40">
                {limitsSnapshot.limit === UNLIMITED_APP_SLOTS
                  ? t("usageUnlimited", {
                      count: limitsSnapshot.currentCount,
                      plan: planLabel,
                    })
                  : t("usage", {
                      count: limitsSnapshot.currentCount,
                      limit: limitsSnapshot.limit,
                      plan: planLabel,
                    })}
              </p>
            ) : null}
            {serverError ? (
              <p
                className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-start text-sm text-red-200/95"
                role="alert"
              >
                {serverError}
              </p>
            ) : null}
          </DialogHeader>

          <form
            onSubmit={onSubmit}
            aria-busy={submitting}
            className="px-5 py-6 text-start sm:px-7 sm:py-7"
          >
            <div className="space-y-5 sm:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="add-app-name" className="text-sm font-medium text-white/88">
                  {t("fields.appName")}
                </Label>
                <input
                  ref={nameInputRef}
                  id="add-app-name"
                  required
                  aria-invalid={nameInvalid || undefined}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  className={cn(
                    "w-full rounded-xl border bg-white/[0.05] px-3.5 py-2.5 text-start text-sm text-white outline-none ring-0 transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/20 sm:py-3",
                    nameInvalid
                      ? "border-red-400/50 focus:border-red-400/55"
                      : "border-white/[0.1] focus:border-[#22C55E]/45",
                  )}
                  placeholder={t("placeholders.appName")}
                  autoComplete="off"
                  autoCapitalize="words"
                  enterKeyHint="next"
                />
                {nameInvalid ? (
                  <p className="text-start text-xs text-red-300/90">{t("errors.nameRequired")}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-app-package" className="text-sm font-medium text-white/88">
                  {t("fields.packageName")}
                </Label>
                <input
                  id="add-app-package"
                  dir="ltr"
                  required
                  value={packageName}
                  onChange={(e) => {
                    setPackageName(e.target.value);
                    setPackageTouched(true);
                  }}
                  onBlur={() => {
                    setPackageTouched(true);
                    setPackageName((p) => p.trim());
                  }}
                  className={cn(
                    "w-full rounded-xl border bg-white/[0.05] px-3.5 py-2.5 text-start font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/20 sm:py-3",
                    packageTouched && (packageError || packageEmptyInvalid)
                      ? "border-red-400/50 focus:border-red-400/55"
                      : "border-white/[0.1] focus:border-[#22C55E]/45",
                  )}
                  placeholder={t("placeholders.package")}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                />
                {packageTouched && packageError ? (
                  <p className="text-start text-xs text-red-300/90">{packageError}</p>
                ) : packageEmptyInvalid ? (
                  <p className="text-start text-xs text-red-300/90">{t("errors.packageRequired")}</p>
                ) : (
                  <div className="space-y-1 text-start">
                    <p className="text-xs leading-relaxed text-white/38">{t("hints.package")}</p>
                    <p className="font-mono text-[11px] leading-relaxed text-white/32" dir="ltr">
                      {t("hints.packageExample")}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-app-category" className="text-sm font-medium text-white/88">
                  {t("fields.category")}
                </Label>
                <select
                  id="add-app-category"
                  required
                  aria-invalid={categoryInvalid || undefined}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  onBlur={() => setCategoryTouched(true)}
                  className={cn(
                    "w-full rounded-xl border bg-white/[0.05] px-3.5 py-2.5 text-start text-sm text-white outline-none focus:ring-2 focus:ring-[#22C55E]/20 sm:py-3",
                    categoryInvalid
                      ? "border-red-400/50 focus:border-red-400/55"
                      : "border-white/[0.1] focus:border-[#22C55E]/45",
                  )}
                >
                  <option value="" disabled>
                    {t("placeholders.category")}
                  </option>
                  {PLAY_STORE_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-[#0a0e14]">
                      {c}
                    </option>
                  ))}
                </select>
                {categoryInvalid ? (
                  <p className="text-start text-xs text-red-300/90">{t("errors.categoryRequired")}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
                  <Label htmlFor="add-app-short" className="text-sm font-medium text-white/88">
                    {t("fields.shortDescription")}
                  </Label>
                  <span
                    className="text-xs tabular-nums text-white/40"
                    dir="ltr"
                    aria-live="polite"
                  >
                    {shortDesc.length} / {SHORT_DESCRIPTION_MAX}
                  </span>
                </div>
                <p className="text-start text-xs text-white/38">{t("hints.shortDescription")}</p>
                <textarea
                  id="add-app-short"
                  value={shortDesc}
                  onChange={(e) =>
                    setShortDesc(e.target.value.slice(0, SHORT_DESCRIPTION_MAX))
                  }
                  maxLength={SHORT_DESCRIPTION_MAX}
                  rows={3}
                  className="min-h-[88px] w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.05] px-3.5 py-2.5 text-start text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#22C55E]/45 focus:ring-2 focus:ring-[#22C55E]/20 sm:py-3"
                  placeholder={t("placeholders.shortDescription")}
                  enterKeyHint="done"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-app-icon" className="text-sm font-medium text-white/88">
                  {t("fields.iconUrl")}
                </Label>
                <p className="text-start text-xs text-white/38">{t("hints.iconUrl")}</p>
                <input
                  id="add-app-icon"
                  type="url"
                  inputMode="url"
                  dir="ltr"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  className={cn(
                    "w-full rounded-xl border bg-white/[0.05] px-3.5 py-2.5 text-start font-mono text-sm text-white outline-none transition placeholder:text-white/35 focus:ring-2 focus:ring-[#22C55E]/20 sm:py-3",
                    iconTrimmed && iconInvalid
                      ? "border-red-400/50 focus:border-red-400/55"
                      : "border-white/[0.1] focus:border-[#22C55E]/45",
                  )}
                  placeholder={t("placeholders.iconUrl")}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                />
                {iconTrimmed && iconInvalid ? (
                  <p className="text-start text-xs text-red-300/90">{t("errors.iconInvalid")}</p>
                ) : null}
                {showIconPreview ? (
                  <div className="flex items-center gap-3 pt-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote user-supplied preview URL */}
                    <img
                      src={iconTrimmed}
                      alt=""
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-xl border border-white/[0.12] bg-white/[0.04] object-cover"
                      onError={() => setIconPreviewBroken(true)}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter
              className={cn(
                "mt-7 gap-3 border-t border-white/[0.07] pt-6 sm:mt-8 sm:gap-3 sm:pt-7",
                isRtl ? "sm:flex-row-reverse sm:justify-start" : "sm:flex-row sm:justify-end",
              )}
            >
              <Button
                type="button"
                variant="outline"
                className="w-full touch-manipulation border-white/15 bg-transparent text-white/85 hover:bg-white/[0.06] sm:w-auto"
                onClick={() => props.onOpenChange(false)}
                disabled={submitting}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={submitDisabled}
                aria-busy={submitting}
                className="w-full touch-manipulation bg-[#22C55E] font-semibold text-white shadow-[0_6px_20px_-4px_rgba(34,197,94,0.45)] ring-1 ring-[#22C55E]/30 hover:bg-[#16a34a] disabled:opacity-55 sm:w-auto sm:min-w-[140px]"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    {t("actions.adding")}
                  </span>
                ) : (
                  t("actions.add")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
