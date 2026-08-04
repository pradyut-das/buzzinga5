import { NextRequest, NextResponse } from "next/server";

/**
 * Boards require an account. The session cookie is only checked for presence
 * here (middleware cannot reach the database); `BoardsLayout` and
 * `canAccessBoard()` do the real validation.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.get("session")) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/boards/:path*"],
};
