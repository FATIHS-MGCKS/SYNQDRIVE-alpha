#!/usr/bin/env bash
# M3.3B.2 read-only strict cadence forensics — self-contained SQL in repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/battery-v2-m3-3b-cadence-forensics.sql"

if [[ "${1:-}" != "--local-vps" ]]; then
  echo "Run on production VPS: bash $0 --local-vps" >&2
  exit 1
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Missing SQL file: $SQL_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source /opt/synqdrive/shared/backend.env
set +a
DB="${DATABASE_URL%%\?*}"

psql "$DB" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
