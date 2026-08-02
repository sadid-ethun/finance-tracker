import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Authenticating reverse proxy to the FastAPI service.
 *
 * The browser never calls the API directly: it sends its httpOnly session
 * cookie here, and this route exchanges it for a short-lived JWT that the API
 * verifies via JWKS. That keeps tokens out of JavaScript entirely and means the
 * API can stay on Railway's private network (PLAN.md section 1).
 */

const API_BASE = process.env.API_INTERNAL_URL;

// Hop-by-hop and identity headers must not be forwarded — the upstream sets
// its own, and forwarding the cookie would leak the session to the API.
//
// `expect` matters in particular: undici's fetch rejects it outright with
// UND_ERR_NOT_SUPPORTED, and clients like curl add `Expect: 100-continue`
// automatically for larger bodies, which would turn every such request into a
// 502.
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "cookie",
  "authorization",
  "content-length",
  "expect",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-authenticate",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

function problem(status: number, code: string, detail: string) {
  return NextResponse.json(
    { type: `about:blank#${code.toLowerCase()}`, title: code, status, detail, code },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

async function handler(request: NextRequest) {
  if (!API_BASE) {
    return problem(500, "MISCONFIGURED", "API_INTERNAL_URL is not set.");
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return problem(401, "UNAUTHENTICATED", "Not signed in.");
  }

  // Minted per request and valid for 5 minutes, so there is no refresh flow.
  const { token } = await auth.api.getToken({ headers: request.headers });
  if (!token) {
    return problem(401, "UNAUTHENTICATED", "Could not issue an API token.");
  }

  const url = new URL(request.url);
  const upstreamPath = url.pathname.replace(/^\/api\/proxy/, "");
  const upstreamUrl = `${API_BASE}${upstreamPath}${url.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set("authorization", `Bearer ${token}`);

  const hasBody = !["GET", "HEAD"].includes(request.method);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (error) {
    // Log the cause: a swallowed fetch error here is undebuggable from the
    // client, which only ever sees a bare 502.
    console.error("[proxy] upstream fetch failed", {
      url: upstreamUrl,
      method: request.method,
      error: error instanceof Error ? error.message : String(error),
      cause: error instanceof Error ? error.cause : undefined,
    });
    return problem(502, "UPSTREAM_UNAVAILABLE", "The API is unreachable.");
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
