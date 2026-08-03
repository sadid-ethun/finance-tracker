# Finance Tracker

A personal finance dashboard: bank accounts, credit cards, loans, and investments
aggregated in one place via Plaid, with transactions, simple budgeting, and cash-flow
views. Mobile-first.

Full technical design: [PLAN.md](PLAN.md).

**Status: Phase 9 (Production Cutover) — code complete, deployment pending.**
Everything in PLAN.md is built. What remains is infrastructure only: creating the
Railway project, pointing a domain at it, and switching Plaid to Production.
See [Going to production](#going-to-production).

> **Turn on two-factor before connecting real bank accounts.** Settings → Security.
> PLAN.md section 8 treats this as a prerequisite for Plaid Production, not an option.

## Plaid setup

1. Create a free account at [dashboard.plaid.com](https://dashboard.plaid.com) and
   copy your **Sandbox** keys from Developers → Keys.
2. Generate an encryption key for access tokens at rest:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

3. Put `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENCRYPTION_KEY` in `apps/api/.env`,
   then restart the API. Settings → Connections will offer "Connect a bank".
   In Sandbox, log in with username `user_good` and password `pass_good`.

**Apply for Production access early.** Approval takes days to weeks and is the
biggest schedule risk in this project — apply from the Plaid dashboard while still
building against Sandbox. Cutover is then: swap `PLAID_SECRET`, set
`PLAID_ENV=production`, set `PLAID_WEBHOOK_URL` to your public HTTPS URL, and
re-link each institution.

> Losing `PLAID_ENCRYPTION_KEY` means every connected bank must be re-linked.
> Back it up somewhere other than this repository.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui |
| Backend | FastAPI, Python 3.12+, SQLAlchemy 2 (async), Alembic |
| Database | PostgreSQL 16, Redis |
| Auth | Better Auth (Phase 1) |
| Bank data | Plaid (Phase 4) |
| Deploy | Railway, Docker, GitHub Actions |

## Layout

```
apps/web     Next.js frontend
apps/api     FastAPI backend (also runs the worker, same image)
infra/       Railway topology reference
```

## Prerequisites

- Node 22+ and pnpm 11 (`npm install -g pnpm`)
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Docker Desktop (for Postgres/Redis and the full stack)

## Getting started

```bash
cp .env.example .env
```

Install dependencies:

```bash
pnpm install && cd apps/api && uv sync
```

Run the whole stack in Docker:

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

### Running without Docker

Start Postgres and Redis yourself, then in two terminals:

```bash
cd apps/api && uv run uvicorn app.main:app --reload
```

```bash
pnpm --filter web dev
```

## Common tasks

Run the web tests:

```bash
pnpm --filter web test
```

Run the API tests:

```bash
cd apps/api && uv run pytest
```

Apply migrations:

```bash
cd apps/api && uv run alembic upgrade head
```

Seed the owner account (signup is disabled, so this is the only way to create one).
The script reads `apps/web/.env.local` itself, so only the owner variables are needed:

```bash
cd apps/web && OWNER_EMAIL=you@example.com OWNER_PASSWORD='at-least-12-chars' npx tsx scripts/seed-owner.ts
```

Prefer a password unique to this app — anything typed on the command line lands in
your shell history. To rotate it later, delete the row and re-seed:
`psql -h 127.0.0.1 -p 5433 -U finance -d finance -c 'DELETE FROM "user" WHERE email = ...'`

Regenerate the API contract after changing any endpoint or schema:

```bash
cd apps/api && uv run python scripts/export_openapi.py ../../packages/shared/openapi.json
```

```bash
pnpm --filter web gen:api-types
```

Create a migration after changing models:

```bash
cd apps/api && uv run alembic revision --autogenerate -m "add accounts"
```

A `Makefile` wraps these (`make help`) if you have `make` available.

## Conventions

These are load-bearing — see PLAN.md for the reasoning.

- **Money is integer minor units** (cents) plus an ISO currency code. Never floats.
- **Liability balances are stored positive** and negated when rolling into net worth.
- **Routes stay thin.** All business logic lives in `apps/api/app/services/`.
- **`user_id` is never a request parameter.** It comes from the verified token.
- **The browser never calls the API directly.** It talks to `/api/proxy/*`, which
  exchanges the httpOnly session cookie for a 5-minute JWT. Tokens never reach JavaScript.
- **`src/proxy.ts` is not a security boundary.** It only avoids showing the shell to
  signed-out visitors; the API verifies every request independently.
- **Alembic owns the auth schema.** Better Auth's own migrate command is never run
  against this database — change `apps/web/src/lib/auth.ts` and the migration together.

## Going to production

Everything below needs your accounts and credentials, so none of it is done yet.
Work top to bottom — the order matters.

### 1. Turn on two-factor first

Settings → Security. PLAN.md section 8 treats this as a prerequisite for
Production Plaid, not an option: from here on the app holds read access to real
bank data.

### 2. Create the Railway project

Four services from this repo, plus Postgres and Redis. `infra/railway.json`
documents the intended build and deploy settings for each.

| Service | Dockerfile | Start | Healthcheck |
|---|---|---|---|
| `api` | `apps/api/Dockerfile` | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | `/health` |
| `worker` | `apps/api/Dockerfile` | `arq app.workers.main.WorkerSettings` | — |
| `web` | `apps/web/Dockerfile` | `node apps/web/server.js` | `/api/health` |

Set `alembic upgrade head` as the **pre-deploy command on `api` only**. Running it
from the app entrypoint would race across replicas.

### 3. Set environment variables

Generate fresh secrets for production — never reuse the local ones:

```bash
openssl rand -base64 32
```

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Required on `api` and `worker`: `ENVIRONMENT=production`, `DATABASE_URL`,
`REDIS_URL`, `WEB_URL`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=production`,
`PLAID_ENCRYPTION_KEY`, `PLAID_WEBHOOK_URL`.

Required on `web`: `DATABASE_URL`, `API_INTERNAL_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`.

> **Back up `PLAID_ENCRYPTION_KEY` somewhere outside Railway and outside this
> repo.** It is not in database dumps. Lose it and every connected bank must be
> re-linked, because the stored access tokens become undecryptable.

### 4. Deploy

Push to `main`. `.github/workflows/deploy.yml` re-runs the full suite, deploys all
three services, and fails the run if the production healthcheck never passes.
It needs `RAILWAY_TOKEN` as a secret and `PRODUCTION_URL` as a variable.

### 5. Switch Plaid to Production

1. Confirm Production access is approved in the Plaid dashboard.
2. Set `PLAID_SECRET` to the Production secret and `PLAID_ENV=production`.
3. Set `PLAID_WEBHOOK_URL` to `https://<your-api-domain>/webhooks/plaid`.
4. Re-link each institution through Settings → Connections. Sandbox items do not
   carry over; their access tokens are only valid in Sandbox.
5. After the first sync, run Dashboard → snapshot to backfill the net-worth chart.

### 6. Verify with real data

Reconcile before trusting anything:

```bash
curl -s https://<your-domain>/api/proxy/api/v1/accounts/summary
```

Net worth should equal the sum of your account balances, with credit cards and
loans subtracting. If it does not, check for transfers that detection has not
paired — Settings shows unpaired activity as ordinary spending.

### 7. Back up, and prove the backup works

```bash
DATABASE_URL=<production-url> ./infra/scripts/backup.sh ./backups
```

```bash
ADMIN_URL=<admin-url> ./infra/scripts/restore-drill.sh ./backups/<file>.dump
```

The drill restores into a throwaway database, prints row counts, and drops it.
It fails loudly if the restore is structurally valid but empty. Run it quarterly —
an untested backup is a guess.

## Known limitations

Honest list of what is not production-hardened yet:

- **The rate limiter is in-memory.** Correct on a single instance. Running more
  than one `api` replica means each enforces its own quota, so the effective
  limit becomes N times what is configured. Move it to Redis before scaling.
- **Sentry is not wired.** PLAN.md section 17 calls for it; it needs a DSN from
  your account. Deliberately left absent rather than stubbed, so nothing looks
  like monitoring that is not.
- **No DB-backed integration tests.** The suite is unit tests plus in-process API
  tests. PLAN.md section 18 calls for testcontainers Postgres; several bugs found
  during development were only caught by manual live runs.
- **Investment cost basis depends on the institution.** Plaid does not always
  report one; those positions are excluded from gain figures and counted
  separately rather than being treated as pure profit.
