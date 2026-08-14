import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Refreshes the Supabase session on every matched request, and gates client
 * work behind an account. The server actions still do the real authorization —
 * this only avoids rendering a board shell for signed-out users.
 */
export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  if (user) {
    return supabaseResponse;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  const redirect = NextResponse.redirect(loginUrl);

  // Carry over any refreshed auth cookies so the redirect does not drop them.
  for (const cookie of supabaseResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

export const config = {
  matcher: ["/clients/:path*"],
};
