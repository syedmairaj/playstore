import { formatAdminGateDebugLine, resolveAdminAccess } from "@/lib/admin/gate";
import {
  fetchProfileAccountStatus,
  isProfileAccessBlocked,
  suspendedAccountJsonResponse,
} from "@/lib/auth/profile-access";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const LISTING_GENERATE_API_PATH = "/api/listings/generate";

function isListingGenerateApi(pathname: string): boolean {
  return pathname === LISTING_GENERATE_API_PATH;
}

function forwardCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

function createSupabaseMiddlewareClient(
  request: NextRequest,
  response: NextResponse,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  return createServerClient(url, anon, {
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
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as never);
        });
      },
    },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicApi =
    pathname.startsWith("/api/feature-flags") ||
    pathname.startsWith("/api/auth");

  if (pathname.startsWith("/api") && !isPublicApi) {
    const debugListingGenerate = isListingGenerateApi(pathname);
    if (debugListingGenerate) {
      console.log(
        "--- [DEBUG] Middleware: entering protected API path",
        pathname,
      );
    }
    const apiResponse = NextResponse.next({ request });
    const supabase = createSupabaseMiddlewareClient(request, apiResponse);
    if (supabase) {
      try {
        if (debugListingGenerate) {
          console.log("[DEBUG] Middleware: before supabase.auth.getUser()");
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (debugListingGenerate) {
          console.log("[DEBUG] Middleware: after supabase.auth.getUser()", {
            hasUser: Boolean(user),
          });
        }
        if (user) {
          if (debugListingGenerate) {
            console.log("[DEBUG] Middleware: before fetchProfileAccountStatus()");
          }
          const status = await fetchProfileAccountStatus(supabase, user.id);
          if (debugListingGenerate) {
            console.log("[DEBUG] Middleware: after fetchProfileAccountStatus()", {
              status,
            });
          }
          if (isProfileAccessBlocked(status)) {
            return NextResponse.json(suspendedAccountJsonResponse(), {
              status: 403,
            });
          }
        }
      } catch (error) {
        if (debugListingGenerate) {
          const message =
            error instanceof Error ? error.message : "unknown middleware error";
          console.warn("[DEBUG] Middleware: API auth block failed (fail-open)", {
            message,
          });
        }
        // Supabase auth fetch can fail on cold-start or network blip in the
        // edge runtime. Fail open — let the API route's own auth check handle it.
      }
    } else if (debugListingGenerate) {
      console.warn(
        "[DEBUG] Middleware: Supabase client unavailable (missing env)",
      );
    }
    if (debugListingGenerate) {
      console.log("[DEBUG] Middleware: forwarding to route handler");
    }
    return apiResponse;
  }

  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_vercel")
  ) {
    return NextResponse.next();
  }

  const intlResponse = intlMiddleware(request);
  const intlRedirectLocation = intlResponse.headers.get("location");
  /** `next-intl` can emit redirects; never skip Supabase + `/admin` gate for locale-prefixed admin URLs. */
  const isLocalePrefixedAdmin = /^\/(en|ar)\/admin(\/|$)/.test(pathname);
  if (intlRedirectLocation && !isLocalePrefixedAdmin) {
    return intlResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return intlResponse;
  }

  const response =
    intlRedirectLocation && isLocalePrefixedAdmin
      ? NextResponse.next({ request })
      : intlResponse;

  const supabase = createSupabaseMiddlewareClient(request, response);
  if (!supabase) {
    return response;
  }

  // Supabase auth can throw "fetch failed" on cold-starts in the edge runtime.
  // Wrap both calls so a transient network error doesn't break page navigation.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
    // Refreshes the session cookie when needed (SSR pattern).
    await supabase.auth.getSession();
  } catch {
    // Fail open — auth routes below will redirect to login if needed.
  }

  const pathWithoutLocale = pathname.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";
  const locale = pathname.match(/^\/(en|ar)/)?.[1] ?? routing.defaultLocale;

  if (user) {
    const accountStatus = await fetchProfileAccountStatus(supabase, user.id);
    if (isProfileAccessBlocked(accountStatus)) {
      const blockedApp =
        pathWithoutLocale.startsWith("/app") ||
        pathWithoutLocale === "/onboarding" ||
        pathWithoutLocale.startsWith("/admin");
      if (blockedApp) {
        const loginUrl = new URL(`/${locale}/login`, request.url);
        loginUrl.searchParams.set("frozen", "1");
        const toLogin = NextResponse.redirect(loginUrl);
        forwardCookies(response, toLogin);
        return toLogin;
      }
    }
  }

  // `/admin/*`: signed-in + (`ADMIN_EMAILS` match OR `profiles.role = 'admin'` OR `profiles.is_admin`); see `.env.example`.
  // Server layout re-checks with the same rules (RLS-safe user client).
  // Runs before the login/signup → onboarding redirect so admin targets (`?next=/…/admin`) are not dropped.
  if (pathWithoutLocale.startsWith("/admin")) {
    if (!user) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("next", pathname);
      const toLogin = NextResponse.redirect(loginUrl);
      forwardCookies(response, toLogin);
      return toLogin;
    }
    const resolution = await resolveAdminAccess(supabase, user);
    const { allowed } = resolution;
    const debugAdmin =
      process.env.NODE_ENV !== "production" ||
      process.env.DEBUG_ADMIN_MIDDLEWARE === "1";
    if (debugAdmin) {
      console.log(formatAdminGateDebugLine(resolution));
    }
    if (!allowed) {
      const home = NextResponse.redirect(new URL(`/${locale}`, request.url));
      forwardCookies(response, home);
      return home;
    }
  }

  if (user && (pathWithoutLocale === "/login" || pathWithoutLocale === "/signup")) {
    const rawNext = request.nextUrl.searchParams.get("next");
    let safeNext = rawNext?.trim() ?? "";
    if (safeNext) {
      let prev = "";
      while (safeNext !== prev) {
        prev = safeNext;
        try {
          safeNext = decodeURIComponent(safeNext.replace(/\+/g, " "));
        } catch {
          break;
        }
      }
    }
    let nextTargetsAdmin = false;
    if (safeNext.startsWith("/") && !safeNext.startsWith("//")) {
      try {
        const nextUrl = new URL(safeNext, request.url);
        if (nextUrl.origin === request.nextUrl.origin) {
          const noLoc =
            nextUrl.pathname.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";
          nextTargetsAdmin =
            noLoc === "/admin" || noLoc.startsWith("/admin/");
        }
      } catch {
        nextTargetsAdmin = false;
      }
    }
    if (nextTargetsAdmin) {
      const toAdmin = NextResponse.redirect(new URL(safeNext, request.url));
      forwardCookies(response, toAdmin);
      return toAdmin;
    }

    const toOnboarding = NextResponse.redirect(
      new URL(`/${locale}/onboarding`, request.url),
    );
    forwardCookies(response, toOnboarding);
    return toOnboarding;
  }

  const needsAuth =
    pathWithoutLocale.startsWith("/app") || pathWithoutLocale === "/onboarding";

  if (needsAuth && !user) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("next", pathname);
    const toLogin = NextResponse.redirect(loginUrl);
    forwardCookies(response, toLogin);
    return toLogin;
  }

  return response;
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(en|ar)/:path*"],
};
