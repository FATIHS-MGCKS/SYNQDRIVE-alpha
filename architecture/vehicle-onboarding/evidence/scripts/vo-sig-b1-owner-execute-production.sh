#!/usr/bin/env bash
# Owner-authorized VO-SIG B1 one-time repair orchestrator (production VPS only).
# Set VO_SIG_B1_PREFLIGHT_ONLY=1 to run Phase 1 only (no backup, no SQL).
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vo-sig-b1-load-production-backend-env.sh
source "${SCRIPT_DIR}/vo-sig-b1-load-production-backend-env.sh"

APPROVED_SQL_SHA256="aa09f9063d5780d6d96f4063dd753da544daae51c85efdab97d388c1fd49735c"
APPROVED_MANIFEST="f9f2a17be4c361be04dc88afd4e12bb3034a4b64e84a504641a999a06cddef73"
APPROVED_PROD_SHA="b3107b44831cf10add09c067b2ae738f35a1fde1"
ORG_ID="faa710c9-6d91-4079-a7d5-91fdccdec14a"
LINK_IDS=(
  "6fcca9d4-99d5-4be8-8985-e9369c53b7f6"
  "9ff5e350-cd4b-4e3a-956a-4f1770b017f2"
  "805b271c-ba87-4776-9e39-23e24d595c53"
  "71b75519-3053-4836-8bcd-554680d592b2"
)

RELEASE_DIR="$(readlink -f /opt/synqdrive/current)"
BACKEND="${RELEASE_DIR}/backend"
APPROVED_SQL_PATH="${VO_SIG_B1_APPROVED_SQL_PATH:-/tmp/VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.approved.sql}"
EXEC_SQL_PATH="/tmp/VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.execute.sql"
LOG="/tmp/vo-sig-b1-owner-execute.log"

exec > >(tee -a "$LOG") 2>&1

echo "=== VO-SIG B1 owner repair start $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

vo_sig_b1_load_production_database_url || exit 1
DBURL="${DATABASE_URL%%\?*}"

fail() { echo "BLOCKER: $*"; exit 1; }

echo "=== PHASE 1 PREFLIGHT ==="
bash "${SCRIPT_DIR}/vo-sig-b1-owner-preflight-production.sh" || fail "preflight failed"

if [[ "${VO_SIG_B1_PREFLIGHT_ONLY:-}" == "1" ]]; then
  echo "VO_SIG_B1_PREFLIGHT_ONLY=1 — stopping before backup/SQL"
  exit 0
fi

echo "=== PHASE 2 BACKUP ==="
sudo bash "${BACKEND}/scripts/ops/vps-backup-postgresql.sh" | tee /tmp/vo-sig-b1-backup.log
BACKUP_FILE="$(grep -E 'backup SUCCESS:' /tmp/vo-sig-b1-backup.log | tail -1 | sed 's/.*backup SUCCESS: //')"
[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || fail "backup file missing"
[[ -s "$BACKUP_FILE" ]] || fail "backup empty"
echo "BACKUP_FILENAME=$BACKUP_FILE"

echo "=== PHASE 3 PREPARE SQL ==="
RUN_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
VERIFIED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
AUTH_REF="${VO_SIG_B1_AUTH_REF:-OWNER_EXPLICIT_VO_SIG_B1_ONE_TIME}"
OPERATOR_REF="${VO_SIG_B1_OPERATOR_REF:-cursor-cloud-agent-owner-authorized}"

PREAMBLE="
SELECT set_config('vo_sig_b1.run_id', '${RUN_ID}', false);
SELECT set_config('vo_sig_b1.authorization_reference', '${AUTH_REF}', false);
SELECT set_config('vo_sig_b1.operator_reference', '${OPERATOR_REF}', false);
SELECT set_config('vo_sig_b1.verified_at_iso', '${VERIFIED_AT}', false);
SELECT set_config('vo_sig_b1.production_release_sha', '${APPROVED_PROD_SHA}', false);
"

awk -v preamble="$PREAMBLE" '
  /^BEGIN;/ { print; print preamble; next }
  /^ROLLBACK;/ { print "COMMIT;"; next }
  { print }
' "$APPROVED_SQL_PATH" > "$EXEC_SQL_PATH"

grep -vE '^SELECT set_config' "$EXEC_SQL_PATH" | sed 's/^COMMIT;/ROLLBACK;/' > /tmp/vo-sig-b1-exec-normalized.sql
diff -u "$APPROVED_SQL_PATH" /tmp/vo-sig-b1-exec-normalized.sql >/tmp/vo-sig-b1-sql-diff.txt || true
if [[ -s /tmp/vo-sig-b1-sql-diff.txt ]]; then
  cat /tmp/vo-sig-b1-sql-diff.txt
  fail "execution SQL differs beyond allowed session settings and COMMIT"
fi

echo "=== PHASE 4 EXECUTE ==="
psql "$DBURL" -v ON_ERROR_STOP=1 -f "$EXEC_SQL_PATH" || fail "SQL execution failed"

echo "=== PHASE 5 POST-COMMIT (see runbook) ==="
