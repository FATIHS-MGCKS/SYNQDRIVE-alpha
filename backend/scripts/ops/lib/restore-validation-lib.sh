#!/usr/bin/env bash
# SynqDrive — Restore validation shared library (Phase 2C.6).
# Isolated drills only — production data must never be mutated.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
RESTORE_VALIDATION_LIB_VERSION="2c6.1"

rv_defaults() {
  RESTORE_VALIDATION_MODE="${RESTORE_VALIDATION_MODE:-isolated}"
  RESTORE_VALIDATION_ALLOW_PRODUCTION="${RESTORE_VALIDATION_ALLOW_PRODUCTION:-false}"
  RESTORE_VALIDATION_REPORT_DIR="${RESTORE_VALIDATION_REPORT_DIR:-/opt/synqdrive/shared/backups/restore-validation/reports}"
  RESTORE_VALIDATION_STATE_DIR="${RESTORE_VALIDATION_STATE_DIR:-/opt/synqdrive/shared/backups/restore-validation/state}"
  RESTORE_VALIDATION_WORK_ROOT="${RESTORE_VALIDATION_WORK_ROOT:-/tmp/synqdrive-restore-validation}"
  RESTORE_VALIDATION_PRODUCTION_DB_NAMES="${RESTORE_VALIDATION_PRODUCTION_DB_NAMES:-synqdrive}"

  RESTORE_VALIDATION_PG_HOST="${RESTORE_VALIDATION_PG_HOST:-127.0.0.1}"
  RESTORE_VALIDATION_PG_PORT="${RESTORE_VALIDATION_PG_PORT:-55432}"
  RESTORE_VALIDATION_PG_USER="${RESTORE_VALIDATION_PG_USER:-synqdrive}"
  RESTORE_VALIDATION_PG_PASSWORD="${RESTORE_VALIDATION_PG_PASSWORD:-synqdrive}"
  RESTORE_VALIDATION_PG_ADMIN_DB="${RESTORE_VALIDATION_PG_ADMIN_DB:-postgres}"

  RESTORE_VALIDATION_CH_HOST="${RESTORE_VALIDATION_CH_HOST:-127.0.0.1}"
  RESTORE_VALIDATION_CH_PORT="${RESTORE_VALIDATION_CH_PORT:-59000}"
  RESTORE_VALIDATION_CH_USER="${RESTORE_VALIDATION_CH_USER:-synqdrive}"
  RESTORE_VALIDATION_CH_PASSWORD="${RESTORE_VALIDATION_CH_PASSWORD:-synqdrive_clickhouse_dev}"

  RESTORE_VALIDATION_UPLOADS_BACKUP_DIR="${RESTORE_VALIDATION_UPLOADS_BACKUP_DIR:-/opt/synqdrive/shared/backups/uploads/daily}"
  RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR="${RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR:-/opt/synqdrive/shared/backups/documents/daily}"
  RESTORE_VALIDATION_ENV_BACKUP_DIR="${RESTORE_VALIDATION_ENV_BACKUP_DIR:-/opt/synqdrive/shared/backups/env/daily}"

  RESTORE_VALIDATION_GPG_PASSPHRASE_FILE="${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE:-}"
  RESTORE_VALIDATION_GPG_RECIPIENT="${RESTORE_VALIDATION_GPG_RECIPIENT:-}"

  if [[ -n "${RESTORE_VALIDATION_RUN_ID:-}" ]]; then
    RV_RUN_ID="${RESTORE_VALIDATION_RUN_ID}"
  else
    RV_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
    RESTORE_VALIDATION_RUN_ID="${RV_RUN_ID}"
  fi

  RV_RESULTS_FILE=""
}

rv_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

rv_die() {
  rv_log "ERROR: $*"
  exit 1
}

rv_now_ms() {
  date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))'
}

rv_elapsed_ms() {
  local start="$1"
  local end
  end="$(rv_now_ms)"
  echo $((end - start))
}

rv_assert_isolated_mode() {
  [[ "${RESTORE_VALIDATION_MODE}" == "isolated" ]] || \
    rv_die "RESTORE_VALIDATION_MODE must be isolated (got ${RESTORE_VALIDATION_MODE})"
  [[ "${RESTORE_VALIDATION_ALLOW_PRODUCTION}" == "false" ]] || \
    rv_die "RESTORE_VALIDATION_ALLOW_PRODUCTION=false required for safe drills"
}

rv_assert_safe_db_name() {
  local db_name="$1"
  local prod
  for prod in ${RESTORE_VALIDATION_PRODUCTION_DB_NAMES}; do
    [[ "${db_name}" == "${prod}" ]] && return 1
  done
  [[ "${db_name}" == synqdrive_restore_* || "${db_name}" == synqdrive_drill_* ]] || return 1
  return 0
}

rv_require_safe_db_name() {
  local db_name="$1"
  rv_assert_safe_db_name "${db_name}" || rv_die "unsafe database name: ${db_name}"
}

rv_ensure_dirs() {
  mkdir -p "${RESTORE_VALIDATION_REPORT_DIR}" "${RESTORE_VALIDATION_STATE_DIR}" "${RESTORE_VALIDATION_WORK_ROOT}"
  chmod 700 "${RESTORE_VALIDATION_REPORT_DIR}" "${RESTORE_VALIDATION_STATE_DIR}" 2>/dev/null || true
  if [[ -z "${RESTORE_VALIDATION_RESULTS_FILE:-}" ]]; then
    RV_RESULTS_FILE="${RESTORE_VALIDATION_WORK_ROOT}/${RV_RUN_ID}/results.jsonl"
  else
    RV_RESULTS_FILE="${RESTORE_VALIDATION_RESULTS_FILE}"
  fi
  mkdir -p "$(dirname "${RV_RESULTS_FILE}")"
  touch "${RV_RESULTS_FILE}"
}

rv_workdir() {
  local tier="$1"
  local dir="${RESTORE_VALIDATION_WORK_ROOT}/${RV_RUN_ID}/${tier}"
  mkdir -p "${dir}"
  printf '%s' "${dir}"
}

rv_verify_checksum_sidecar() {
  local artifact="$1"
  local sidecar="${artifact}.sha256"
  [[ -f "${sidecar}" ]] || return 1
  local dir base
  dir="$(dirname "${artifact}")"
  base="$(basename "${artifact}")"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${dir}" && sha256sum -c "${base}.sha256" >/dev/null 2>&1)
  else
    (cd "${dir}" && shasum -a 256 -c "${base}.sha256" >/dev/null 2>&1)
  fi
}

rv_sha256() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${f}" | awk '{print $1}'
  else
    shasum -a 256 "${f}" | awk '{print $1}'
  fi
}

rv_decrypt_gpg() {
  local encrypted="$1"
  local output="$2"
  if [[ -n "${RESTORE_VALIDATION_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --decrypt --output "${output}" "${encrypted}"
  elif [[ -f "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --passphrase-file "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}" \
      --decrypt --output "${output}" "${encrypted}"
  else
    return 1
  fi
}

rv_latest_artifact() {
  local dir="$1"
  local pattern="$2"
  local f
  shopt -s nullglob
  local newest=""
  for f in "${dir}"/${pattern}; do
    [[ -f "${f}" ]] || continue
    newest="${f}"
  done
  shopt -u nullglob
  [[ -n "${newest}" ]] && printf '%s' "${newest}"
}

rv_pg_url() {
  local db_name="$1"
  printf 'postgresql://%s:%s@%s:%s/%s' \
    "${RESTORE_VALIDATION_PG_USER}" "${RESTORE_VALIDATION_PG_PASSWORD}" \
    "${RESTORE_VALIDATION_PG_HOST}" "${RESTORE_VALIDATION_PG_PORT}" "${db_name}"
}

rv_pg_admin_psql() {
  PGPASSWORD="${RESTORE_VALIDATION_PG_PASSWORD}" psql \
    -h "${RESTORE_VALIDATION_PG_HOST}" -p "${RESTORE_VALIDATION_PG_PORT}" \
    -U "${RESTORE_VALIDATION_PG_USER}" -d "${RESTORE_VALIDATION_PG_ADMIN_DB}" \
    -v ON_ERROR_STOP=1 "$@"
}

rv_record_tier_result() {
  local tier="$1"
  local success="$2"
  local duration_ms="$3"
  local integrity="$4"
  local errors="${5:-}"
  local details="${6:-}"
  TIER="${tier}" SUCCESS="${success}" DURATION_MS="${duration_ms}" INTEGRITY="${integrity}" \
    ERRORS="${errors}" DETAILS="${details}" MODE="${RESTORE_VALIDATION_MODE}" \
    python3 - <<'PY' >> "${RV_RESULTS_FILE}"
import json, os, datetime
print(json.dumps({
  "tier": os.environ["TIER"],
  "success": os.environ["SUCCESS"].lower() == "true",
  "duration_ms": int(os.environ["DURATION_MS"]),
  "integrity": os.environ["INTEGRITY"],
  "errors": os.environ.get("ERRORS") or None,
  "details": os.environ.get("DETAILS") or None,
  "mode": os.environ["MODE"],
  "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}))
PY
}

rv_write_report() {
  local report_path="${RESTORE_VALIDATION_REPORT_DIR}/restore-validation-${RV_RUN_ID}.json"
  local latest_path="${RESTORE_VALIDATION_REPORT_DIR}/latest-report.json"
  RUN_ID="${RV_RUN_ID}" MODE="${RESTORE_VALIDATION_MODE}" HOST="$(hostname -f 2>/dev/null || hostname)" \
    RESULTS_FILE="${RV_RESULTS_FILE}" REPORT_PATH="${report_path}" \
    python3 - <<'PY'
import json, datetime, os, pathlib

results = []
path = pathlib.Path(os.environ["RESULTS_FILE"])
if path.exists():
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            results.append(json.loads(line))

report = {
    "run_id": os.environ["RUN_ID"],
    "mode": os.environ["MODE"],
    "host": os.environ["HOST"],
    "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "tiers": results,
    "overall_success": all(r.get("success") for r in results) if results else False,
}
out = pathlib.Path(os.environ["REPORT_PATH"])
out.write_text(json.dumps(report, indent=2) + "\n")
out.chmod(0o600)
PY
  cp -f "${report_path}" "${latest_path}"
  chmod 600 "${latest_path}" 2>/dev/null || true
  rv_log "report: ${report_path}"
  printf '%s\n' "${report_path}"
}

rv_exit_code_from_results() {
  python3 - <<PY
import json, pathlib, sys
path = pathlib.Path("${RV_RESULTS_FILE}")
if not path.exists():
    sys.exit(1)
for line in path.read_text().splitlines():
    if not line.strip():
        continue
    if not json.loads(line).get("success"):
        sys.exit(1)
sys.exit(0)
PY
}
