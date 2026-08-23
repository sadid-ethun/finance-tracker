/**
 * Seeds the single owner account.
 *
 * Signup is disabled in the Better Auth config, so this is the only way an
 * account is created. Run once per environment:
 *
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' \
 *     pnpm --filter web seed:owner
 *
 * Safe to re-run: it exits without changes if the account already exists.
 */
import { loadEnvConfig } from "@next/env";

// Must run before importing auth, which reads DATABASE_URL on first use.
// Uses Next's own resolution order (.env.local, .env, ...) so this script and
// the running app always agree on configuration.
loadEnvConfig(process.cwd());

async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  const name = process.env.OWNER_NAME ?? "Owner";

  if (!email || !password) {
    console.error("OWNER_EMAIL and OWNER_PASSWORD are required.");
    process.exit(1);
  }

  if (password.length < 10) {
    console.error("OWNER_PASSWORD must be at least 10 characters.");
    process.exit(1);
  }

  // Imported here rather than at module scope so loadEnvConfig has already run.
  const { auth } = await import("../src/lib/auth");
  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) {
    console.log(`Owner already exists: ${email}`);
    process.exit(0);
  }

  // Goes through the internal adapter because the public signup route is
  // disabled, and hashes the password with Better Auth's own algorithm.
  const user = await ctx.internalAdapter.createUser({
    email,
    name,
    emailVerified: true,
  });

  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  console.log(`Created owner: ${email} (${user.id})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
