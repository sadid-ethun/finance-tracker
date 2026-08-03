import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 renamed Middleware to Proxy; the behaviour is unchanged.
 *
 * This is an optimistic check only — it looks for the session cookie without
 * validating it, purely to avoid flashing the app shell at signed-out visitors.
 * The real gate is the API verifying the JWT on every request (PLAN.md
 * section 8). Never add authorization logic here.
 */
export function proxy(request: NextRequest) {
  const hasSession = getSessionCookie(request) !== null;
  const { pathname, search } = request.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!hasSession && !isLoginPage) {
    const url = new URL("/login", request.url);
    // Send the visitor back where they were headed after signing in.
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API routes, static assets, and image optimisation.
  // manifest.webmanifest must be listed explicitly: browsers fetch it
  // while signed out to decide whether the app is installable, and
  // redirecting it to /login silently disables the install prompt. Found
  // by requesting it against a running container — a build cannot catch it.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|.*\\.(?:svg|png|jpg|jpeg|webp|ico|webmanifest)$).*)",
  ],
};
