# Finance Tracker

A personal finance dashboard: bank accounts, credit cards, loans, and investments
aggregated in one place via Plaid, with transactions, simple budgeting, and cash-flow
views. Mobile-first.

Full technical design: [PLAN.md](PLAN.md).

**Status: Phase 2 (Accounts & Manual Data) complete.** A fully usable manual finance
tracker: add accounts, record transactions, categorise them, and see net worth.
Search, splits, and transfers land in Phase 3; Plaid in Phase 4.

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
