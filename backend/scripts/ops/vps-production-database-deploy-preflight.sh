#!/usr/bin/env bash
# Production VPS deploy database preflight (read-only checks + backup content gate).
set -euo pipefail

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${OPS_DIR}/.." && pwd)"
# shellcheck source=lib/production-database-identity-guard.lib.sh
source "${OPS_DIR}/lib/production-database-identity-guard.lib.sh"
# shellcheck source=lib/production-database-backup-content-gate.lib.sh
source "${OPS_DIR}/lib/production-database-backup-content-gate.lib.sh"

BACKUP_FILE="${1:-}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "$DATABASE_URL" && -f /opt/synqdrive/shared/backend.env ]]; then
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | cut -d= -f2- | tr -d '"')"
  export DATABASE_URL
fi

export SYNQDRIVE_DATABASE_IDENTITY_PROFILE="${SYNQDRIVE_DATABASE_IDENTITY_PROFILE:-production_vps}"

echo "==> production database deploy preflight (profile=${SYNQDRIVE_DATABASE_IDENTITY_PROFILE})"
pdb_guard_assert_production_vps_target "$DATABASE_URL"

if [[ -n "$BACKUP_FILE" ]]; then
  pdb_backup_gate_assert_dump_file "$BACKUP_FILE"
  pdb_guard_assert_urls_match "$DATABASE_URL" "$DATABASE_URL"
fi

echo "==> production database deploy preflight PASS"
