# Finance Tracker

A personal finance dashboard: bank accounts, credit cards, loans, and investments
aggregated in one place via Plaid, with transactions, simple budgeting, and cash-flow
views. Mobile-first.

Full technical design: [PLAN.md](PLAN.md).

**Status: Phase 9 (Production Cutover) — code complete, deployment pending.**
Everything in PLAN.md is built. What remains is infrastructure only: creating the
VM, pointing a domain at it, and switching Plaid to Production.
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
| Deploy | Docker Compose on a single VM, Caddy, GitHub Actions |

## Layout

```
apps/web     Next.js frontend
apps/api     FastAPI backend (also runs the worker, same image)
infra/       Caddy config, provisioning and deploy scripts
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

### 2. Create the VM

The app is five processes — `web`, `api`, `worker`, Postgres, Redis — and the
`worker` runs cron (nightly balance and net-worth snapshots), so it has to be
always-on. Platform-as-a-service free tiers host one web service that sleeps;
that combination silently skips the snapshot jobs and the net-worth chart stops
filling in. One small VM running `docker-compose.prod.yml` is both cheaper and
simpler here.

**Oracle Cloud Always Free** gives an Ampere ARM VM at no cost — 2 OCPU / 12 GB
as of June 2026, roughly six times what this needs. Any arm64 or x86 host works
the same way; Hetzner CX22 at ~€4/mo is the fallback if Oracle's capacity or
signup fights you.

1. Create an **Ampere A1** instance, Ubuntu 24.04, and save the SSH key.
2. Point your domain's **A record** at the instance's public IP. Do this before
   deploying — Caddy cannot obtain a certificate until the name resolves.
3. In the Oracle console, **VCN → Security List → add ingress** for TCP 80 and
   443 from `0.0.0.0/0`.
4. SSH in and run the provisioner:

```bash
curl -fsSL https://raw.githubusercontent.com/sadid-ethun/finance-tracker/main/infra/scripts/provision-oracle.sh | bash
```

It installs Docker, adds swap, clones the repo, and opens 80/443 in the host
firewall. That last part is not redundant with step 3: Oracle's Ubuntu images
ship an iptables ruleset ending in `REJECT`, so packets reach the VM and get
dropped locally even when the cloud Security List allows them. Both halves are
required, and nothing logs it when only one is done.

Log out and back in afterwards so the `docker` group takes effect.

### 3. Fill in the environment

`provision-oracle.sh` copies `.env.production.example` to `~/finance-tracker/.env`.
Fill in every value. Generate the two secrets **fresh** — the dev ones have sat
in plaintext on your laptop, which was fine for sandbox data and is not fine for
real bank data:

```bash
openssl rand -base64 32
```

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

`docker-compose.prod.yml` declares every secret as `${VAR:?}`, so a missing value
fails the command outright rather than starting with an empty default.

> **Back up `PLAID_ENCRYPTION_KEY` somewhere outside the VM and outside this
> repo.** It is not in database dumps. Lose it and every connected bank must be
> re-linked, because the stored access tokens become undecryptable.

### 4. Deploy

First deploy is by hand, so you can watch it:

```bash
cd ~/finance-tracker && ./infra/scripts/deploy.sh
```

That pulls `main`, builds the images **on the VM**, waits for Postgres, takes a
verified pre-deploy dump, runs `alembic upgrade head` as a one-off, and brings
everything up behind Caddy. Migrations are deliberately not in the `api`
entrypoint — a crash-looping container would otherwise re-enter them mid-flight.

Images build on the box rather than in CI because cross-building arm64 under
QEMU in GitHub Actions turns the Next.js build into a tens-of-minutes job, and
shipping the result would need a registry to move an image onto the same
machine that could have built it directly.

Afterwards, pushes to `main` deploy automatically. Under
**Settings → Secrets and variables → Actions**, set:

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_HOST` | Secret | VM public IP or hostname |
| `DEPLOY_USER` | Secret | `ubuntu` |
| `DEPLOY_SSH_KEY` | Secret | Private key with access to the VM |
| `DEPLOY_KNOWN_HOSTS` | Secret | Output of `ssh-keyscan <host>` |
| `PRODUCTION_URL` | Variable | `https://<your-domain>` — no trailing slash |

Use a **deploy-only SSH key**, not your personal one:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/finance-deploy -C "github-actions-deploy"
```

Append the public half to `~/.ssh/authorized_keys` on the VM and put the private
half in `DEPLOY_SSH_KEY`. `DEPLOY_KNOWN_HOSTS` pins the host key — without it the
workflow would need `StrictHostKeyChecking=no`, which hands the deploy session to
whoever answers on port 22.

Add `PRODUCTION_URL` **last**. The deploy job is gated on it being non-empty, so
until then every push runs the verify suite and cleanly skips deployment. That is
what keeps `main` green while the server is still being set up; adding it is what
arms real deploys.

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
