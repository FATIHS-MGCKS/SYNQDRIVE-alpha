#!/usr/bin/env bash
#
# restore-validation.selftest.sh — Unit + fixture drills (no production, no Docker required).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/restore-validation-lib.sh
source "${SCRIPT_DIR}/lib/restore-validation-lib.sh"

export RESTORE_VALIDATION_MODE=isolated
export RESTORE_VALIDATION_ALLOW_PRODUCTION=false
export RESTORE_VALIDATION_REPORT_DIR="${ROOT}/reports"
export RESTORE_VALIDATION_WORK_ROOT="${ROOT}/work"
export RESTORE_VALIDATION_GPG_PASSPHRASE_FILE="${ROOT}/passphrase"
export RESTORE_VALIDATION_ENV_BACKUP_DIR="${ROOT}/backups/env/daily"
export RESTORE_VALIDATION_UPLOADS_BACKUP_DIR="${ROOT}/backups/uploads/daily"
export RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR="${ROOT}/backups/documents/daily"
export RESTORE_VALIDATION_PG_BACKUP_DIR="${ROOT}/backups/postgresql/daily"
export RESTORE_VALIDATION_CH_BACKUP_DIR="${ROOT}/backups/clickhouse/daily"

echo "restore-validation passphrase" > "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}"
chmod 600 "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}"

rv_defaults
rv_assert_isolated_mode
rv_ensure_dirs
export RESTORE_VALIDATION_RUN_ID="${RV_RUN_ID}"
export RESTORE_VALIDATION_RESULTS_FILE="${RV_RESULTS_FILE}"

# --- lib checks ---
rv_assert_safe_db_name "synqdrive_restore_test123" || { echo "FAIL safe db"; exit 1; }
rv_assert_safe_db_name "synqdrive" && { echo "FAIL should reject prod db name"; exit 1; }

# --- env fixture ---
mkdir -p "${ROOT}/env-src" "${RESTORE_VALIDATION_ENV_BACKUP_DIR}"
cat > "${ROOT}/env-src/backend.env" <<'ENV'
DATABASE_URL=postgresql://x
REDIS_HOST=127.0.0.1
CLERK_SECRET_KEY=sk_test
ENV
echo 'VITE_X=1' > "${ROOT}/env-src/frontend.env"
ENV_TAR="${ROOT}/env.tar"
tar -cf "${ENV_TAR}" -C "${ROOT}/env-src" backend.env frontend.env
ENV_GPG="${RESTORE_VALIDATION_ENV_BACKUP_DIR}/env-daily-test.tar.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase-file "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}" \
  --output "${ENV_GPG}" "${ENV_TAR}"
printf '%s  %s\n' "$(rv_sha256 "${ENV_GPG}")" "$(basename "${ENV_GPG}")" > "${ENV_GPG}.sha256"

bash "${SCRIPT_DIR}/vps-restore-test-env.sh" --artifact "${ENV_GPG}"

# --- uploads fixture ---
mkdir -p "${ROOT}/uploads-src" "${RESTORE_VALIDATION_UPLOADS_BACKUP_DIR}"
echo upload > "${ROOT}/uploads-src/file.bin"
UP_TAR="${ROOT}/uploads.tar"
tar -cf "${UP_TAR}" -C "${ROOT}/uploads-src" .
UP_GPG="${RESTORE_VALIDATION_UPLOADS_BACKUP_DIR}/uploads-daily-test.tar.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase-file "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}" \
  --output "${UP_GPG}" "${UP_TAR}"
printf '%s  %s\n' "$(rv_sha256 "${UP_GPG}")" "$(basename "${UP_GPG}")" > "${UP_GPG}.sha256"
bash "${SCRIPT_DIR}/vps-restore-test-uploads.sh" --artifact "${UP_GPG}"

# --- documents fixture ---
mkdir -p "${ROOT}/docs-src/docs" "${RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR}"
echo pdf > "${ROOT}/docs-src/docs/sample.pdf"
DOC_TAR="${ROOT}/documents.tar"
tar -cf "${DOC_TAR}" -C "${ROOT}/docs-src" .
DOC_GPG="${RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR}/documents-daily-test.tar.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase-file "${RESTORE_VALIDATION_GPG_PASSPHRASE_FILE}" \
  --output "${DOC_GPG}" "${DOC_TAR}"
printf '%s  %s\n' "$(rv_sha256 "${DOC_GPG}")" "$(basename "${DOC_GPG}")" > "${DOC_GPG}.sha256"
bash "${SCRIPT_DIR}/vps-restore-test-documents.sh" --artifact "${DOC_GPG}"

# --- blocked tiers (no isolated PG/CH/Redis in selftest env) ---
rv_record_tier_result "postgresql" false 0 "blocked" "selftest: no isolated Postgres" ""
rv_record_tier_result "clickhouse" false 0 "blocked" "selftest: no isolated ClickHouse" ""
rv_record_tier_result "redis" false 0 "blocked" "selftest: no redis-check-rdb fixture" ""

rv_write_report >/dev/null
REPORT="${RESTORE_VALIDATION_REPORT_DIR}/restore-validation-${RV_RUN_ID}.json"
python3 - "${REPORT}" <<'PY'
import json, pathlib, sys
report = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert report["mode"] == "isolated"
assert len(report["tiers"]) >= 6
for tier in ("configuration", "uploads", "documents"):
    row = next(t for t in report["tiers"] if t["tier"] == tier)
    assert row["success"] is True, tier
print("restore-validation selftest: OK")
PY
