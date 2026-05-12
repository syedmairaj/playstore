import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const DEFAULT_FALLBACK = `/${routing.defaultLocale}/app`;

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
  return path;
}

function loginCallbackFailedRedirect(request: NextRequest) {
  return NextResponse.redirect(
    new URL(
      `/${routing.defaultLocale}/login?error=auth_callback_failed`,
      request.url,
    ),
  );
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const nextPath = decodeNextPath(requestUrl.searchParams.get("next"));

    if (!url || !anon) {
      console.error("[auth/callback] Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
      return loginCallbackFailedRedirect(request);
    }

    if (!code) {
      return loginCallbackFailedRedirect(request);
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

    let exchangeError: { message: string } | null = null;
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchangeError = error;
    } catch (err) {
      console.error("[auth/callback] exchangeCodeForSession threw:", err);
      return loginCallbackFailedRedirect(request);
    }

    if (exchangeError) {
      console.error(
        "[auth/callback] exchangeCodeForSession:",
        exchangeError.message,
      );
      return loginCallbackFailedRedirect(request);
    }

    return response;
  } catch (e) {
    console.error("[auth/callback] unexpected error:", e);
    return loginCallbackFailedRedirect(request);
  }
}
