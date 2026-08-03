#!/usr/bin/env bash
#
# Restore drill.
#
# Restores a backup into a THROWAWAY database and checks the data is actually
# there. Never touches the live database.
#
# An untested backup is a guess. PLAN.md section 11 asks for this quarterly;
# the first run is the one that finds the problem.
#
# Usage:
#   ADMIN_URL=postgresql://user:pass@host:5432/postgres \
#     ./infra/scripts/restore-drill.sh ./backups/finance-20260803T120000Z.dump
#
set -euo pipefail

DUMP="${1:?Usage: restore-drill.sh <dump-file>}"
DRILL_DB="finance_restore_drill_$(date -u +%H%M%S)"

if [[ -z "${ADMIN_URL:-}" ]]; then
  echo "ADMIN_URL is not set (needs CREATE DATABASE rights)." >&2
  exit 1
fi

if [[ ! -f "${DUMP}" ]]; then
  echo "No such dump: ${DUMP}" >&2
  exit 1
fi

BASE_URL="${ADMIN_URL%/*}"
cleanup() {
  echo "Dropping ${DRILL_DB}…"
  psql "${ADMIN_URL}" -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creating throwaway database ${DRILL_DB}…"
psql "${ADMIN_URL}" -c "CREATE DATABASE \"${DRILL_DB}\";" >/dev/null

echo "Restoring…"
pg_restore --dbname="${BASE_URL}/${DRILL_DB}" --no-owner --no-privileges "${DUMP}" \
  >/dev/null 2>&1 || echo "  (pg_restore reported warnings; checking data anyway)"

echo
echo "Row counts in the restored copy:"
psql "${BASE_URL}/${DRILL_DB}" -t -A -F' ' <<'SQL'
SELECT 'users', count(*) FROM "user"
UNION ALL SELECT 'accounts', count(*) FROM accounts
UNION ALL SELECT 'transactions', count(*) FROM transactions
UNION ALL SELECT 'budgets', count(*) FROM budgets
UNION ALL SELECT 'holdings', count(*) FROM holdings
UNION ALL SELECT 'plaid_items', count(*) FROM plaid_items;
SQL

# The drill passes only if the restored copy has the schema AND at least one
# user. A structurally valid but empty restore is the failure mode worth
# catching.
USERS="$(psql "${BASE_URL}/${DRILL_DB}" -t -A -c 'SELECT count(*) FROM "user";')"
if [[ "${USERS}" -lt 1 ]]; then
  echo
  echo "DRILL FAILED: restored database has no users." >&2
  exit 1
fi

echo
echo "DRILL PASSED: schema and data restored, ${USERS} user(s)."
echo "Note: PLAID_ENCRYPTION_KEY is NOT in this dump. Without the original key,"
echo "restored Plaid access tokens cannot be decrypted and every bank must be"
echo "re-linked. Back that key up separately."
