#!/usr/bin/env bash
# Read-only: compare Prisma migration folder names vs ledger successful distinct names.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT}/prisma/migrations"
CONTRACT="${SYNQDRIVE_PRODUCTION_DB_CONTRACT:-${ROOT}/scripts/ops/contracts/production-database-identity.v1.json}"

list_folder_names() {
  find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort
}

ledger_names() {
  local db="${1:-synqdrive}"
  sudo -u postgres psql -d "$db" -tAc \
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1"
}

echo "==> Prisma migration history name parity (read-only)"
echo "contract: ${CONTRACT}"
folder_count="$(list_folder_names | wc -l | tr -d ' ')"
echo "migration_folders_in_tree: ${folder_count}"

if [[ -n "${DATABASE_URL:-}" ]] || sudo -u postgres psql -d synqdrive -tAc 'SELECT 1' >/dev/null 2>&1; then
  db="$(python3 - "${DATABASE_URL:-}" <<'PY' 2>/dev/null || echo synqdrive
import os, sys, urllib.parse
url = os.environ.get("DATABASE_URL") or "postgresql://synqdrive@localhost:5432/synqdrive"
p = urllib.parse.urlparse(url.replace("postgresql://","postgres://"))
print((p.path or "/synqdrive").lstrip("/").split("/")[0] or "synqdrive")
PY
)"
  ledger_ok="$(ledger_names "$db" | sed '/^$/d' | sort -u)"
  ledger_distinct="$(echo "$ledger_ok" | wc -l | tr -d ' ')"
  total_rows="$(sudo -u postgres psql -d "$db" -tAc 'SELECT count(*) FROM _prisma_migrations' | tr -d ' ')"
  rolled_back="$(sudo -u postgres psql -d "$db" -tAc 'SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL' | tr -d ' ')"
  echo "ledger_database: ${db}"
  echo "ledger_rows_total: ${total_rows}"
  echo "ledger_successful_distinct: ${ledger_distinct}"
  echo "ledger_rolled_back_rows: ${rolled_back}"

  comm -23 <(echo "$ledger_ok") <(list_folder_names) > /tmp/pdb_ledger_not_in_tree.txt
  comm -23 <(list_folder_names) <(echo "$ledger_ok") > /tmp/pdb_tree_not_in_ledger.txt

  echo "--- ledger_successful_not_in_release_tree (first 40) ---"
  head -40 /tmp/pdb_ledger_not_in_tree.txt
  echo "--- release_tree_not_in_ledger_successful (pending deploy) ---"
  cat /tmp/pdb_tree_not_in_ledger.txt
else
  echo "WARN: no ledger database reachable; folder-only mode"
fi
