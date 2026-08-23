"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * No `baseURL` on purpose.
 *
 * Better Auth falls back to `window.location.origin`, which is always right:
 * the auth routes are Next route handlers served from this very origin, in
 * every environment.
 *
 * Setting it from `NEXT_PUBLIC_APP_URL` looked equivalent and was not. Next
 * inlines `NEXT_PUBLIC_*` into the client bundle at *build* time, so a value
 * supplied to the container at *run* time arrives too late — the bundle had
 * already baked in the localhost fallback, and every sign-in from production
 * was posted cross-origin to localhost:3000.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { signIn, signOut, useSession, twoFactor } = authClient;
