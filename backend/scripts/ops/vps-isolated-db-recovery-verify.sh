#!/usr/bin/env bash
# Isolated PostgreSQL restore + read-only verification for P0 recovery.
# NEVER targets production database "synqdrive". Fail-closed by design.
set -euo pipefail

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${OPS_DIR}/../.." && pwd)"

EXPECTED_SHA256="28e21a2a5cb040ce39c99466540d0f8cbad4c65b821e1460fd667c79ae7da1b4"
DEFAULT_BACKUP="/opt/synqdrive/shared/backups/db-pre-deploy-20261017215527.sql.gz"

PRODUCTION_DB="synqdrive"
VERIFY_DB_PREFIX="synqdrive_recovery_verify_"

ALLOWLIST_VEHICLES=(
  "19fedd4b-c4e8-4de8-a125-dab293326e7e"
  "68868291-5478-42cd-b0c4-cc77b2a78e21"
  "8c850ff1-4201-432b-af2e-2711dbc7ca48"
  "c10351f8-b6a2-4258-947f-631aeaa6d359"
)

LOG_DIR="${SYNQDRIVE_ISOLATED_RECOVERY_LOG_DIR:-/opt/synqdrive/shared/backups/isolated-recovery-logs}"
BACKUP_FILE="${SYNQDRIVE_ISOLATED_RECOVERY_BACKUP:-$DEFAULT_BACKUP}"
TS="${SYNQDRIVE_ISOLATED_RECOVERY_TS:-$(date -u +%Y%m%d%H%M%S)}"
TARGET_DB="${SYNQDRIVE_ISOLATED_RECOVERY_TARGET_DB:-${VERIFY_DB_PREFIX}${TS}}"

fail() {
  echo "!! ABORT: $*" >&2
  exit 1
}

assert_target_db_safe() {
  local db=$1
  if [[ "$db" == "$PRODUCTION_DB" ]]; then
    fail "target database must not be production ${PRODUCTION_DB}"
  fi
  if [[ ! "$db" =~ ^synqdrive_recovery_verify_[0-9]{14}$ ]]; then
    fail "target database must match ${VERIFY_DB_PREFIX}<UTCYYYYMMDDHHMMSS> (got: ${db})"
  fi
  case "$db" in
    synqdrive_staging_brake | synqdrive_exp021_*)
      fail "target collides with reserved database name pattern: ${db}"
      ;;
  esac
}

assert_postgres_target() {
  local db=$1
  assert_target_db_safe "$db"
  local actual
  actual="$(sudo -u postgres psql -tAc "SELECT current_database()" -d "$db" 2>/dev/null || true)"
  actual="${actual//$'\n'/}"
  if [[ "$actual" != "$db" ]]; then
    fail "postgres session database is '${actual:-<none>}', expected exactly '${db}'"
  fi
}

guard_sql_file() {
  local sql=$1
  if grep -qiE '(DROP|ALTER)\s+DATABASE\s+"?synqdrive"?[^_]' "$sql" 2>/dev/null; then
    fail "backup/sql contains forbidden DROP/ALTER DATABASE on production name"
  fi
  if grep -qiE 'DROP\s+SCHEMA\s+"?public"?(\s+CASCADE)?' "$sql" 2>/dev/null; then
    echo "!! WARN: dump contains DROP SCHEMA public (expected in some dumps; restore targets isolated DB only)"
  fi
}

preflight() {
  local phase="${1:-create}"
  if [[ "${SYNQDRIVE_ISOLATED_RECOVERY_AUTHORIZED:-}" != "1" ]]; then
    fail "SYNQDRIVE_ISOLATED_RECOVERY_AUTHORIZED=1 required (owner GO for isolated verify restore)"
  fi

  assert_target_db_safe "$TARGET_DB"

  [[ -f "$BACKUP_FILE" ]] || fail "backup missing: ${BACKUP_FILE}"

  local sha
  sha="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
  if [[ "$sha" != "$EXPECTED_SHA256" ]]; then
    fail "SHA-256 mismatch (got ${sha}, expected ${EXPECTED_SHA256})"
  fi
  gzip -t "$BACKUP_FILE" || fail "gzip integrity check failed"

  local need_mb
  need_mb=$(( $(stat -c%s "$BACKUP_FILE") / 1024 / 1024 * 4 + 512 ))
  local avail_mb
  avail_mb="$(df -BM / | tail -1 | awk '{print $4}' | tr -d M)"
  if [[ "$avail_mb" -lt "$need_mb" ]]; then
    fail "insufficient disk (need ~${need_mb}MB, avail ${avail_mb}MB on /)"
  fi

  local exists
  exists="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" | tr -d '[:space:]')"
  if [[ "$phase" == "create" && "$exists" == "1" ]]; then
    fail "target database already exists: ${TARGET_DB} (pick new TS or drop with separate owner GO)"
  fi
  if [[ "$phase" == "verify" && "$exists" != "1" ]]; then
    fail "target database does not exist for verify: ${TARGET_DB}"
  fi
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PRODUCTION_DB}'" | grep -q 1; then
    echo "==> production database ${PRODUCTION_DB} present (unchanged by this script)"
  fi

  mkdir -p "$LOG_DIR"
  chmod 1777 "$LOG_DIR" 2>/dev/null || true
  echo "==> Preflight OK backup=${BACKUP_FILE} target=${TARGET_DB} log_dir=${LOG_DIR} phase=${phase}"
}

create_verify_database() {
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres \
    -c "CREATE DATABASE \"${TARGET_DB}\" OWNER synqdrive;"
  assert_postgres_target "$TARGET_DB"
}

restore_backup() {
  local log="${LOG_DIR}/restore-${TARGET_DB}-${TS}.log"
  local err="${LOG_DIR}/restore-${TARGET_DB}-${TS}.err"
  echo "==> Restoring into ${TARGET_DB} (log: ${log})"
  assert_postgres_target "$TARGET_DB"

  # Scan first 2MB of decompressed stream for forbidden production DB mutations (best-effort).
  local head_scan
  head_scan="$(mktemp)"
  gunzip -c "$BACKUP_FILE" | head -c 2097152 >"$head_scan"
  guard_sql_file "$head_scan"
  rm -f "$head_scan"

  set +o pipefail
  set +e
  gunzip -c "$BACKUP_FILE" | sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$TARGET_DB" >"$log" 2>"$err"
  local rc=${PIPESTATUS[1]:-$?}
  set -e
  set -o pipefail
  if [[ $rc -ne 0 ]]; then
    echo "!! RESTORE FAILED rc=${rc} — see ${log} and ${err}" >&2
    exit 2
  fi
  if [[ -s "$err" ]]; then
    echo "!! WARN: restore stderr non-empty (${err})"
  fi
  echo "==> Restore finished without psql abort"
}

verify_read_only() {
  local report="${LOG_DIR}/verify-${TARGET_DB}-${TS}.json"
  assert_postgres_target "$TARGET_DB"

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$TARGET_DB" <<'SQL' | tee "${report}.txt"
\pset tuples_only on
\pset format unaligned
SELECT 'prisma_migrations_count' AS k, count(*)::text AS v FROM _prisma_migrations;
SELECT 'organizations_count' AS k, count(*)::text AS v FROM organizations;
SELECT 'vehicles_count' AS k, count(*)::text AS v FROM vehicles;
SELECT 'vehicle_trips_count' AS k, count(*)::text AS v FROM vehicle_trips;
SELECT 's4_work_items_count' AS k, count(*)::text AS v FROM di_v0_s4_work_items;
SELECT 's4_completed_primary' AS k, count(*)::text AS v FROM di_v0_s4_work_items
  WHERE status = 'COMPLETED' AND run_purpose = 'PRIMARY' AND purpose_discriminator = 'PRIMARY';
SELECT 's4_evidence_snapshots' AS k, count(*)::text AS v FROM di_v0_s4_evidence_snapshots;
SELECT 'public_table_count' AS k, count(*)::text AS v FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT 'hv_battery_evidence' AS k,
  CASE WHEN to_regclass('public.battery_evidence') IS NULL THEN 'TABLE_MISSING'
       ELSE (SELECT count(*)::text FROM battery_evidence) END AS v;
SELECT 'dtc_events' AS k,
  CASE WHEN to_regclass('public.vehicle_dtc_events') IS NULL THEN 'TABLE_MISSING'
       ELSE (SELECT count(*)::text FROM vehicle_dtc_events) END AS v;
SELECT 'trip_fsm_shadow_runs' AS k,
  CASE WHEN to_regclass('public.trip_detection_shadow_runs') IS NULL THEN 'TABLE_MISSING'
       ELSE (SELECT count(*)::text FROM trip_detection_shadow_runs) END AS v;
SQL

  for vid in "${ALLOWLIST_VEHICLES[@]}"; do
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$TARGET_DB" -tAc \
      "SELECT '${vid}', status, registry_lifecycle FROM vehicles WHERE id='${vid}';"
  done

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$TARGET_DB" -tAc \
    "SELECT count(*) FROM di_v0_s4_work_items wi
     LEFT JOIN organizations o ON o.id = wi.organization_id
     WHERE o.id IS NULL;"

  echo "==> Verification report: ${report}.txt"
}

prisma_migrate_status_readonly() {
  local release_dir="${SYNQDRIVE_ISOLATED_RECOVERY_RELEASE_DIR:-/opt/synqdrive/current}"
  [[ -d "${release_dir}/backend" ]] || fail "release backend missing: ${release_dir}/backend"
  assert_postgres_target "$TARGET_DB"

  local url
  url="$(grep -m1 '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | cut -d= -f2- | tr -d '"')"
  [[ -n "$url" ]] || fail "cannot read DATABASE_URL template from shared env"
  local verify_url
  verify_url="$(URL="$url" TARGET="$TARGET_DB" python3 - <<'PY'
import os, re, sys
u = os.environ["URL"]
db = os.environ["TARGET"]
if not re.match(r"^synqdrive_recovery_verify_[0-9]{14}$", db):
    sys.exit(2)
m = re.sub(r"/([^/?]+)(\?.*)?$", f"/{db}", u, count=1)
path_db = m.split("/")[-1].split("?")[0]
if path_db != db:
    sys.exit(3)
print(m)
PY
)" || fail "refusing prisma DATABASE_URL rewrite (target must be isolated verify DB)"

  (
    cd "${release_dir}/backend"
    DATABASE_URL="$verify_url" npx prisma migrate status 2>&1 | tee "${LOG_DIR}/prisma-migrate-status-${TARGET_DB}-${TS}.log"
  ) || fail "prisma migrate status failed (see log)"
}

usage() {
  cat <<EOF
Usage: SYNQDRIVE_ISOLATED_RECOVERY_AUTHORIZED=1 $0 <preflight|restore|verify|all>

  preflight  — checksum, disk, target name guards (no DB create)
  restore    — create ${VERIFY_DB_PREFIX}<ts> and pg_restore via psql
  verify     — read-only SQL checks + prisma migrate status (verify DB only)
  all        — preflight + restore + verify

Env:
  SYNQDRIVE_ISOLATED_RECOVERY_TARGET_DB  (default ${VERIFY_DB_PREFIX}<UTC ts>)
  SYNQDRIVE_ISOLATED_RECOVERY_BACKUP     (default ${DEFAULT_BACKUP})
EOF
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    preflight) preflight create ;;
    restore) preflight create; create_verify_database; restore_backup ;;
    verify) preflight verify; verify_read_only; prisma_migrate_status_readonly ;;
    all) preflight create; create_verify_database; restore_backup; verify_read_only; prisma_migrate_status_readonly ;;
    *) usage; exit 1 ;;
  esac
}

main "${1:-}"
