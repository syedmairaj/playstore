import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const DEFAULT_FALLBACK = `/${routing.defaultLocale}/app`;
const IS_DEV = process.env.NODE_ENV !== "production";

function decodeNextPath(raw: string | null): string {
  if (raw == null || raw.trim() === "") {
    return DEFAULT_FALLBACK;
  }
  let path = raw.trim();
  let prev = "";
  while (path !== prev) {
    prev = path;
    try {
      path = decodeURIComponent(path.replace(/\+/g, " "));
    } catch {
      break;
    }
  }
  if (!path.startsWith("/")) {
    return DEFAULT_FALLBACK;
  }
  if (path.startsWith("//")) {
    return DEFAULT_FALLBACK;
  }
  // Locale-prefixed routes use /[locale]/app/...; bare /app is invalid here.
  if (path === "/app" || path.startsWith("/app/")) {
    const rest = path === "/app" ? "" : path.slice("/app/".length);
    return rest
      ? `/${routing.defaultLocale}/app/${rest}`
      : DEFAULT_FALLBACK;
  }
  // App routes live under `/[locale]/admin/*`; bare `/admin` from OAuth `next` must be prefixed.
  if (path === "/admin" || path.startsWith("/admin/")) {
    const rest = path === "/admin" ? "" : path.slice("/admin/".length);
    return rest
      ? `/${routing.defaultLocale}/admin/${rest}`
      : `/${routing.defaultLocale}/admin`;
  }
  return path;
}

/**
 * Whether a decoded `next` path is safe to round-trip through the login error
 * redirect. We only forward in-app paths (no protocol/host) to avoid open
 * redirect vectors when surfacing `?error=...` on the login screen.
 */
function isSafeNextForLogin(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

/**
 * Build the locale-prefixed login URL with the `database_sync_issue` flag
 * (and preserved `next` when safe). The whole app is served under
 * `/[locale]/*` via next-intl with `localePrefix: "always"`, so a bare
 * `/login?...` would 404 — we always prefix with `routing.defaultLocale`
 * here (middleware/i18n picks up the user's real locale on the next request).
 */
function buildLoginUrl(request: NextRequest, opts: { next?: string }) {
  const url = new URL(`/${routing.defaultLocale}/login`, request.url);
  url.searchParams.set("error", "database_sync_issue");
  if (opts.next && isSafeNextForLogin(opts.next)) {
    url.searchParams.set("next", opts.next);
  }
  return url;
}

function loginCallbackFailedRedirect(
  request: NextRequest,
  opts: { next?: string } = {},
) {
  return NextResponse.redirect(buildLoginUrl(request, opts));
}

/**
 * Log the caught error with enough detail to debug, but never echo the raw
 * Supabase response (which can contain the one-time code/token). We surface
 * the message + stack in dev; in production we keep it short.
 */
function logCallbackError(label: string, err: unknown) {
  if (err instanceof Error) {
    if (IS_DEV) {
      console.error(`[auth/callback] ${label}: ${err.message}\n${err.stack ?? ""}`);
    } else {
      console.error(`[auth/callback] ${label}: ${err.message}`);
    }
    return;
  }
  if (err && typeof err === "object" && "message" in err) {
    console.error(`[auth/callback] ${label}:`, (err as { message: unknown }).message);
    return;
  }
  console.error(`[auth/callback] ${label}: unknown error`);
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Parsed up front so we can preserve `next` even if the request body / env is broken.
  let rawNext: string | null = null;
  let nextPath = DEFAULT_FALLBACK;
  try {
    const requestUrl = new URL(request.url);
    rawNext = requestUrl.searchParams.get("next");
    nextPath = decodeNextPath(rawNext);
  } catch (err) {
    logCallbackError("failed to parse request URL", err);
  }

  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");

    if (!url || !anon) {
      console.error("[auth/callback] Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
      return loginCallbackFailedRedirect(request, { next: nextPath });
    }

    if (!code) {
      return loginCallbackFailedRedirect(request, { next: nextPath });
    }

    const destination = new URL(nextPath, requestUrl.origin);
    const response = NextResponse.redirect(destination);

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as never);
          });
        },
      },
    });

    // Supabase PKCE / magic-link exchange: failures here surface as either a
    // thrown error (network, malformed code) or a structured `{ error }` payload
    // (e.g. "Database error saving new user" from the auth trigger). Treat both
    // as a `database_sync_issue` for the user and log details server-side.
    let exchangeError: { message: string } | null = null;
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchangeError = error;
    } catch (err) {
      logCallbackError("exchangeCodeForSession threw", err);
      return loginCallbackFailedRedirect(request, { next: nextPath });
    }

    if (exchangeError) {
      logCallbackError("exchangeCodeForSession returned error", exchangeError);
      return loginCallbackFailedRedirect(request, { next: nextPath });
    }

    if (IS_DEV) {
      const targetsAdmin =
        nextPath === `/${routing.defaultLocale}/admin` ||
        nextPath.startsWith(`/${routing.defaultLocale}/admin/`) ||
        /^\/(en|ar)\/admin(\/|$)/.test(nextPath);
      console.log(
        `[auth/callback] redirect nextPath=${nextPath} targetsAdmin=${targetsAdmin} rawNext=${rawNext ?? "(none)"}`,
      );
    }

    return response;
  } catch (e) {
    logCallbackError("unexpected error", e);
    return loginCallbackFailedRedirect(request, { next: nextPath });
  }
}
