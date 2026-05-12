import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

function forwardCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_vercel")
  ) {
    return NextResponse.next();
  }

  const intlResponse = intlMiddleware(request);
  if (intlResponse.headers.get("location")) {
    return intlResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return intlResponse;
  }

  let response = intlResponse;

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
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as never);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathWithoutLocale = pathname.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";
  const locale = pathname.match(/^\/(en|ar)/)?.[1] ?? routing.defaultLocale;

  if (user && (pathWithoutLocale === "/login" || pathWithoutLocale === "/signup")) {
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
