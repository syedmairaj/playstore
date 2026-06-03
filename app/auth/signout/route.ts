import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Server-side Supabase sign-out so httpOnly auth cookies are cleared on the response.
 * Client navigates here (full load) after closeAuth() so the auth modal does not reopen.
 */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const home = new URL("/", request.url);

  if (!url || !anon) {
    return NextResponse.redirect(home);
  }

  try {
    const response = NextResponse.redirect(home);
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

    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      console.error("[auth/signout]", error.message);
    }
    return response;
  } catch (e) {
    console.error("[auth/signout]", e);
    return NextResponse.redirect(home);
  }
}
