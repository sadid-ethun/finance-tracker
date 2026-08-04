#!/usr/bin/env bash
#
# Database backup.
#
# The VM has no provider-managed snapshots behind it, so this is not a second
# copy — it is the only one. Run it on a schedule and get the output off the
# box, because a backup sitting on the disk it is meant to protect is not
# really a backup.
#
# deploy.sh takes its own dump immediately before every migration; this is the
# routine one, for everything that is not a deploy.
#
# Usage:
#   DATABASE_URL=postgresql://... ./infra/scripts/backup.sh [output-dir]
#
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${OUT_DIR}/finance-${STAMP}.dump"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

# Custom format (-Fc): compressed, and restorable table-by-table with pg_restore.
# --no-owner so the dump restores cleanly into a differently-named role.
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${FILE}"

SIZE="$(du -h "${FILE}" | cut -f1)"
echo "Wrote ${FILE} (${SIZE})"

# A zero-byte or truncated dump is worse than none, because it looks like a
# backup exists. Verify the archive is readable before declaring success.
if ! pg_restore --list "${FILE}" >/dev/null 2>&1; then
  echo "ERROR: ${FILE} is not a readable archive. Deleting." >&2
  rm -f "${FILE}"
  exit 1
fi

TABLES="$(pg_restore --list "${FILE}" | grep -c 'TABLE DATA' || true)"
echo "Verified: archive is readable, ${TABLES} tables with data."

# Keep 14 days locally; the offsite copy is the long-term one.
find "${OUT_DIR}" -name 'finance-*.dump' -type f -mtime +14 -delete 2>/dev/null || true
echo "Pruned local backups older than 14 days."
