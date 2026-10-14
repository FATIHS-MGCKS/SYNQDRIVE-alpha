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

if [[ "${VO_SIG_B1_SKIP_PREFLIGHT_AND_BACKUP:-}" == "1" ]]; then
  echo "VO_SIG_B1_SKIP_PREFLIGHT_AND_BACKUP=1 — resuming at Phase 3 (backup already completed)"
else
echo "=== PHASE 2 BACKUP ==="
sudo bash "${BACKEND}/scripts/ops/vps-backup-postgresql.sh" | tee /tmp/vo-sig-b1-backup.log
BACKUP_FILE="$(grep -E 'backup SUCCESS:' /tmp/vo-sig-b1-backup.log | tail -1 | sed 's/.*backup SUCCESS: //')"
[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || fail "backup file missing"
[[ -s "$BACKUP_FILE" ]] || fail "backup empty"
echo "BACKUP_FILENAME=$BACKUP_FILE"
fi

echo "=== PHASE 3 PREPARE SQL ==="
RUN_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
VERIFIED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
AUTH_REF="${VO_SIG_B1_AUTH_REF:-OWNER_RECONFIRMED_VO_SIG_B1_FINAL_EXECUTION_2026-10-14}"
OPERATOR_REF="${VO_SIG_B1_OPERATOR_REF:-cursor-cloud-agent-owner-authorized}"

vo_sig_b1_normalize_sql_for_diff() {
  sed '/^SELECT set_config/d; /^-- Owner replaces/d; s/^COMMIT;/ROLLBACK;/' "$1" | awk 'NF { blank=0; print; next } { if (blank++ == 0) print "" }'
}

awk -v run_id="$RUN_ID" -v auth_ref="$AUTH_REF" -v operator_ref="$OPERATOR_REF" -v verified_at="$VERIFIED_AT" -v prod_sha="$APPROVED_PROD_SHA" '
  /^BEGIN;/ {
    print
    print "SELECT set_config('\''vo_sig_b1.run_id'\'', '\''" run_id "'\'', false);"
    print "SELECT set_config('\''vo_sig_b1.authorization_reference'\'', '\''" auth_ref "'\'', false);"
    print "SELECT set_config('\''vo_sig_b1.operator_reference'\'', '\''" operator_ref "'\'', false);"
    print "SELECT set_config('\''vo_sig_b1.verified_at_iso'\'', '\''" verified_at "'\'', false);"
    print "SELECT set_config('\''vo_sig_b1.production_release_sha'\'', '\''" prod_sha "'\'', false);"
    next
  }
  /^ROLLBACK;/ { print "COMMIT;"; next }
  { print }
' "$APPROVED_SQL_PATH" > "$EXEC_SQL_PATH"

vo_sig_b1_normalize_sql_for_diff "$EXEC_SQL_PATH" > /tmp/vo-sig-b1-exec-normalized.sql
vo_sig_b1_normalize_sql_for_diff "$APPROVED_SQL_PATH" > /tmp/vo-sig-b1-approved-normalized.sql
diff -u /tmp/vo-sig-b1-approved-normalized.sql /tmp/vo-sig-b1-exec-normalized.sql >/tmp/vo-sig-b1-sql-diff.txt || true
if [[ -s /tmp/vo-sig-b1-sql-diff.txt ]]; then
  cat /tmp/vo-sig-b1-sql-diff.txt
  fail "execution SQL differs beyond allowed session settings and COMMIT"
fi

echo "RUN_ID=$RUN_ID"
echo "VERIFIED_AT=$VERIFIED_AT"
echo "AUTH_REF=$AUTH_REF"
echo "OPERATOR_REF=$OPERATOR_REF"

echo "=== PHASE 4 EXECUTE ==="
psql "$DBURL" -v ON_ERROR_STOP=1 -f "$EXEC_SQL_PATH" || fail "SQL execution failed"
echo "COMMIT_CONFIRMED=YES"

echo "=== PHASE 5 POST-COMMIT ==="
bash "${SCRIPT_DIR}/vo-sig-b1-owner-postcommit-verify.sh" "$RUN_ID"
