#!/usr/bin/env bash
#
# Deploy on the VM. Invoked over SSH by .github/workflows/deploy.yml, and safe
# to run by hand when you want to ship without pushing.
#
# Images are built here rather than in CI. The alternative — building arm64 in
# GitHub Actions under QEMU — takes tens of minutes for the Next.js build, and
# paying for a registry to move an image onto the same box that could have
# built it is motion without progress.
#
# Usage (on the VM):
#   cd ~/finance-tracker && ./infra/scripts/deploy.sh
#
set -euo pipefail

# Everything lives in main() because this script git-resets its own working
# tree. Bash reads a script incrementally, so a plain top-to-bottom script that
# rewrites itself mid-run resumes at a byte offset into different content and
# executes garbage. Wrapping the body means the whole file is parsed before the
# first line of it runs.
main() {
  local compose_file="docker-compose.prod.yml"
  local backup_dir="${HOME}/backups"
  local compose=(docker compose -f "${compose_file}")

  cd "$(dirname "$0")/../.."

  if [[ ! -f .env ]]; then
    echo "ERROR: .env is missing. Copy .env.production.example and fill it in." >&2
    exit 1
  fi

  echo "==> Fetching latest main"
  git fetch --quiet origin main
  git checkout --quiet main
  git reset --hard --quiet origin/main
  echo "    now at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

  echo "==> Building images"
  "${compose[@]}" build

  echo "==> Starting datastores"
  "${compose[@]}" up -d postgres redis

  # Compose returns as soon as the container is created, not when Postgres is
  # accepting connections, so migrating immediately is a race.
  echo "==> Waiting for Postgres"
  local ready=""
  for _ in $(seq 1 30); do
    if "${compose[@]}" exec -T postgres pg_isready -U finance -d finance >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  if [[ -z "${ready}" ]]; then
    echo "ERROR: Postgres did not become ready within 60s." >&2
    exit 1
  fi

  # A migration is the one step here that can destroy data, and this box has no
  # provider-managed snapshots behind it. Take the dump first.
  echo "==> Backing up before migrating"
  mkdir -p "${backup_dir}"
  local dump="${backup_dir}/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
  "${compose[@]}" exec -T postgres \
    pg_dump -U finance -d finance --format=custom --no-owner --no-privileges \
    > "${dump}"
  # A truncated dump is worse than none, because it looks like a backup exists.
  # pg_restore reads stdin when given no file argument; run it in the container
  # because the host has no postgres client installed.
  if ! "${compose[@]}" exec -T postgres pg_restore --list < "${dump}" >/dev/null 2>&1; then
    echo "ERROR: pre-deploy dump at ${dump} is not readable. Refusing to migrate." >&2
    exit 1
  fi
  echo "    wrote ${dump} ($(du -h "${dump}" | cut -f1)), archive verified"

  # Run migrations as a one-off rather than from the api entrypoint, so a
  # crash-looping container cannot re-enter them halfway through.
  echo "==> Running migrations"
  "${compose[@]}" run --rm --no-deps api alembic upgrade head

  echo "==> Starting services"
  "${compose[@]}" up -d --remove-orphans

  echo "==> Waiting for the web app to report healthy"
  local healthy=""
  for _ in $(seq 1 30); do
    if "${compose[@]}" exec -T web curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
      healthy=1
      break
    fi
    sleep 3
  done
  if [[ -z "${healthy}" ]]; then
    echo "ERROR: web never reported healthy. Recent logs:" >&2
    "${compose[@]}" logs --tail 40 web >&2
    exit 1
  fi
  echo "    healthy"

  # Old build layers accumulate fast on a 47GB boot volume; without this the
  # disk fills after a few dozen deploys and Postgres is the first thing to
  # notice. Volumes are never pruned — that is where the database lives.
  echo "==> Pruning dangling images"
  docker image prune -f >/dev/null

  # Keep two weeks of pre-deploy dumps, matching backup.sh.
  find "${backup_dir}" -name 'pre-deploy-*.dump' -type f -mtime +14 -delete 2>/dev/null || true

  echo "==> Done"
  "${compose[@]}" ps
}

main "$@"
