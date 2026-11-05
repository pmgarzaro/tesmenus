import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// First line of defence: a validly signed session cookie. Pages and routes
// then check the user still exists (requireUser / getCurrentUser).
export async function proxy(request: NextRequest) {
  const userId = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (userId !== null) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  // Keep the query: the OAuth consent page needs its parameters after login.
  if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|signup|api/health|health|mcp|oauth/register|oauth/token|oauth/revoke|\\.well-known|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|icon-192.png|icon-512.png).*)",
  ],
};
