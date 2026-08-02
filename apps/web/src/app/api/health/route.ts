import { NextResponse } from "next/server";

/**
 * Liveness probe for the web service (Railway healthcheck target).
 * Deliberately does not touch the database or the API — it answers
 * "is this Node process serving requests", nothing more.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "web",
    timestamp: new Date().toISOString(),
  });
}
