import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

/**
 * Better Auth server configuration.
 *
 * Sessions live in our own Postgres, so `user.id` is a real foreign-key target
 * for every financial table (PLAN.md section 8). Alembic owns the schema — this
 * config must stay in sync with the auth tables migration, and Better Auth's
 * own migrate command is never run against our database.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// The API verifies these exact values, so they are shared config, not defaults.
export const JWT_ISSUER = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
export const JWT_AUDIENCE = "finance-tracker-api";

function createAuth() {
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    max: 5,
  });

  // localhost and 127.0.0.1 are the same machine but different origins, and
  // tooling disagrees about which to use. Trust both, but only when the app is
  // actually configured for local development — in production BETTER_AUTH_URL
  // is a real domain and this list stays empty.
  const isLocal =
    JWT_ISSUER.includes("localhost") || JWT_ISSUER.includes("127.0.0.1");

  return betterAuth({
    database: pool,
    baseURL: JWT_ISSUER,
    secret: requireEnv("BETTER_AUTH_SECRET"),
    trustedOrigins: isLocal
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : [],

    emailAndPassword: {
      enabled: true,
      // Single-user app: the owner account is seeded, and the signup route
      // stays closed so a public URL cannot be used to create accounts.
      disableSignUp: true,
      minPasswordLength: 12,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    },

    // Better Auth's `account` table would collide with our financial
    // `accounts`, so it is mapped to `auth_account` (PLAN.md section 5).
    account: {
      modelName: "auth_account",
    },

    plugins: [
      jwt({
        jwt: {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          // Short enough that revocation lag is irrelevant; the proxy re-mints
          // transparently on every request.
          expirationTime: "5m",
          definePayload: ({ user }) => ({
            email: user.email,
            name: user.name,
          }),
        },
        jwks: {
          // EdDSA/Ed25519: the API holds no shared secret, only public keys.
          keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
        },
      }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

/**
 * Lazily constructed so importing this module never opens a connection pool or
 * reads the environment. `next build` evaluates route modules to collect page
 * data, and the build has no DATABASE_URL — constructing eagerly would fail the
 * build while still leaving a misconfigured runtime undetected. Deferring to
 * first use keeps the fail-fast behaviour exactly where it belongs: the first
 * request.
 */
export const auth = new Proxy({} as Auth, {
  get(_target, property, receiver) {
    const target = getAuth();
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
