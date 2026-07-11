import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function assertSupabaseEnv(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, anon };
}

function createClientFromRequest(request: NextRequest): SupabaseClient {
  const { url, anon } = assertSupabaseEnv();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Route handlers rely on middleware for cookie refresh; read-only here.
      },
    },
  });
}

export function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
}

/**
 * Resolve the signed-in user for API route handlers.
 * Tries cookie auth (next/headers, then request cookies), then Bearer token.
 */
export async function resolveAuthenticatedUser(
  request: NextRequest,
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const cookieClient = await createClient();
  const {
    data: { user: headerCookieUser },
  } = await cookieClient.auth.getUser();
  if (headerCookieUser) {
    return { supabase: cookieClient, user: headerCookieUser };
  }

  const requestClient = createClientFromRequest(request);
  const {
    data: { user: requestCookieUser },
  } = await requestClient.auth.getUser();
  if (requestCookieUser) {
    return { supabase: requestClient, user: requestCookieUser };
  }

  const bearer = extractBearerToken(request);
  if (bearer) {
    const {
      data: { user: bearerUser },
      error,
    } = await cookieClient.auth.getUser(bearer);
    if (bearerUser && !error) {
      return { supabase: cookieClient, user: bearerUser };
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[auth] resolveAuthenticatedUser: no session", {
      hasSupabaseCookie: hasSupabaseAuthCookie(request),
      hasAuthorizationHeader: Boolean(bearer),
    });
  }

  return { supabase: cookieClient, user: null };
}
