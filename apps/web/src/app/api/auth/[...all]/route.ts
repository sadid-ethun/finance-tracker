import { auth } from "@/lib/auth";

/**
 * Serves sign-in/sign-out/session plus the JWT plugin's /token and /jwks.
 *
 * The handler is resolved per request rather than at module scope so that
 * `next build`, which evaluates this module to collect page data, never
 * constructs the auth instance (and never needs DATABASE_URL).
 */

export async function GET(request: Request) {
  return auth.handler(request);
}

export async function POST(request: Request) {
  return auth.handler(request);
}
