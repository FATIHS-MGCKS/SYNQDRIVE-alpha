#!/usr/bin/env bash
#
# restore-validation.local.sh — Isolated restore drill using Docker (dev/CI).
# Creates synthetic backups, runs full vps-restore-validation.sh, never touches production.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ROOT="${RESTORE_VALIDATION_LOCAL_ROOT:-/tmp/synqdrive-restore-validation-local}"
PASSPHRASE_FILE="${ROOT}/gpg-passphrase"
GPG_RECIPIENT=""
export RESTORE_VALIDATION_GPG_PASSPHRASE_FILE="${PASSPHRASE_FILE}"

PG_CONTAINER="synqdrive-rv-pg"
CH_CONTAINER="synqdrive-rv-ch"
REDIS_CONTAINER="synqdrive-rv-redis"

mkdir -p "${ROOT}"/{backups/{postgresql,clickhouse,redis,env,uploads,documents}/daily,work,gpg-home}
chmod 700 "${ROOT}"
echo "restore-validation-local-passphrase" > "${PASSPHRASE_FILE}"
chmod 600 "${PASSPHRASE_FILE}"

export GNUPGHOME="${ROOT}/gpg-home"
chmod 700 "${GNUPGHOME}"
if [[ ! -f "${GNUPGHOME}/pubring.kbx" ]]; then
  gpg --batch --yes --passphrase-file "${PASSPHRASE_FILE}" --quick-generate-key \
    "restore-test@synqdrive.local" default default >/dev/null 2>&1
fi
GPG_RECIPIENT="$(gpg --list-keys --with-colons 2>/dev/null | awk -F: '/^uid:/ {print $10; exit}')"
export RESTORE_VALIDATION_GPG_RECIPIENT="${GPG_RECIPIENT}"

export RESTORE_VALIDATION_MODE=isolated
export RESTORE_VALIDATION_ALLOW_PRODUCTION=false
export RESTORE_VALIDATION_REPORT_DIR="${ROOT}/reports"
export RESTORE_VALIDATION_WORK_ROOT="${ROOT}/work"
export RESTORE_VALIDATION_PG_BACKUP_DIR="${ROOT}/backups/postgresql/daily"
export RESTORE_VALIDATION_CH_BACKUP_DIR="${ROOT}/backups/clickhouse/daily"
export RESTORE_VALIDATION_REDIS_BACKUP_DIR="${ROOT}/backups/redis/daily"
export RESTORE_VALIDATION_ENV_BACKUP_DIR="${ROOT}/backups/env/daily"
export RESTORE_VALIDATION_UPLOADS_BACKUP_DIR="${ROOT}/backups/uploads/daily"
export RESTORE_VALIDATION_DOCUMENTS_BACKUP_DIR="${ROOT}/backups/documents/daily"

export RESTORE_VALIDATION_PG_HOST=127.0.0.1
export RESTORE_VALIDATION_PG_PORT=55432
export RESTORE_VALIDATION_PG_USER=synqdrive
export RESTORE_VALIDATION_PG_PASSWORD=synqdrive
export RESTORE_VALIDATION_PG_ADMIN_DB=postgres

export RESTORE_VALIDATION_CH_HOST=127.0.0.1
export RESTORE_VALIDATION_CH_PORT=59000
export RESTORE_VALIDATION_CH_USER=synqdrive
export RESTORE_VALIDATION_CH_PASSWORD=synqdrive_clickhouse_dev
export RESTORE_VALIDATION_CH_BACKUP_MOUNT="${ROOT}/ch-backups"
export RESTORE_VALIDATION_CH_SOURCE_DB=synqdrive

export REDIS_BACKUP_ROOT="${ROOT}/backups/redis"
export REDIS_BACKUP_ARCHIVE_DIR="${ROOT}/backups/redis/daily"
export REDIS_BACKUP_STAGING_DIR="${ROOT}/backups/redis/staging"
export REDIS_BACKUP_STATE_DIR="${ROOT}/backups/redis/state"
export REDIS_BACKUP_GPG_PASSPHRASE_FILE="${PASSPHRASE_FILE}"
export REDIS_BACKUP_ALLOW_UNENCRYPTED=false
export REDIS_BACKUP_MIN_BYTES=1

log() { printf '[local-drill] %s\n' "$*"; }

cleanup() {
  docker rm -f "${PG_CONTAINER}" "${CH_CONTAINER}" "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "starting isolated Postgres on :55432"
docker rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
docker run -d --name "${PG_CONTAINER}" \
  -e POSTGRES_USER=synqdrive -e POSTGRES_PASSWORD=synqdrive -e POSTGRES_DB=postgres \
  -p 55432:5432 postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  PGPASSWORD=synqdrive psql -h 127.0.0.1 -p 55432 -U synqdrive -d postgres -c 'SELECT 1' >/dev/null 2>&1 && break
  sleep 1
done

log "seed source database"
PGPASSWORD=synqdrive psql -h 127.0.0.1 -p 55432 -U synqdrive -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE DATABASE synqdrive_source OWNER synqdrive;
SQL
PGPASSWORD=synqdrive psql -h 127.0.0.1 -p 55432 -U synqdrive -d synqdrive_source -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE organizations (id UUID PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT, finished_at TIMESTAMPTZ);
CREATE TABLE "Document" (id UUID PRIMARY KEY, "objectKey" TEXT);
INSERT INTO organizations VALUES ('11111111-1111-1111-1111-111111111111', 'Drill Org');
INSERT INTO _prisma_migrations VALUES ('m1', 'abc', NOW());
INSERT INTO "Document" VALUES ('22222222-2222-2222-2222-222222222222', 'docs/sample.pdf');
SQL

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="${ROOT}/backups/postgresql/staging/synqdrive-daily-${TS}.dump"
mkdir -p "$(dirname "${DUMP}")"
PGPASSWORD=synqdrive pg_dump -h 127.0.0.1 -p 55432 -U synqdrive -Fc synqdrive_source -f "${DUMP}"
ARTIFACT_PG="${ROOT}/backups/postgresql/daily/synqdrive-daily-${TS}.dump.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ARTIFACT_PG}" "${DUMP}"
printf '%s  %s\n' "$(sha256sum "${ARTIFACT_PG}" | awk '{print $1}')" "$(basename "${ARTIFACT_PG}")" > "${ARTIFACT_PG}.sha256"

log "starting isolated ClickHouse on :59000"
mkdir -p "${RESTORE_VALIDATION_CH_BACKUP_MOUNT}"
docker rm -f "${CH_CONTAINER}" >/dev/null 2>&1 || true
docker run -d --name "${CH_CONTAINER}" \
  -e CLICKHOUSE_DB=synqdrive \
  -e CLICKHOUSE_USER=synqdrive \
  -e CLICKHOUSE_PASSWORD=synqdrive_clickhouse_dev \
  -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 \
  -p 59000:9000 -p 58123:8123 \
  -v "${RESTORE_VALIDATION_CH_BACKUP_MOUNT}:/backups" \
  -v "${BACKEND_DIR}/docker/clickhouse/config.d/backup_disk.xml:/etc/clickhouse-server/config.d/backup_disk.xml:ro" \
  clickhouse/clickhouse-server:25.8 >/dev/null
for _ in $(seq 1 60); do
  clickhouse-client --host 127.0.0.1 --port 59000 --user synqdrive \
    --password synqdrive_clickhouse_dev --query 'SELECT 1' >/dev/null 2>&1 && break
  sleep 2
done

clickhouse-client --host 127.0.0.1 --port 59000 --user synqdrive \
  --password synqdrive_clickhouse_dev --query \
  "CREATE TABLE IF NOT EXISTS synqdrive.drill_events (id UInt64, ts DateTime) ENGINE=MergeTree ORDER BY id"
clickhouse-client --host 127.0.0.1 --port 59000 --user synqdrive \
  --password synqdrive_clickhouse_dev --query \
  "INSERT INTO synqdrive.drill_events VALUES (1, now())"

CH_ZIP="synqdrive_${TS}.zip"
clickhouse-client --host 127.0.0.1 --port 59000 --user synqdrive \
  --password synqdrive_clickhouse_dev --query \
  "BACKUP DATABASE synqdrive TO Disk('backups', '${CH_ZIP}')"
ARTIFACT_CH="${ROOT}/backups/clickhouse/daily/synqdrive-daily-${TS}.zip.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ARTIFACT_CH}" "${RESTORE_VALIDATION_CH_BACKUP_MOUNT}/${CH_ZIP}"
printf '%s  %s\n' "$(sha256sum "${ARTIFACT_CH}" | awk '{print $1}')" "$(basename "${ARTIFACT_CH}")" > "${ARTIFACT_CH}.sha256"

log "creating redis RDB artifact"
docker rm -f "${REDIS_CONTAINER}" >/dev/null 2>&1 || true
docker run -d --name "${REDIS_CONTAINER}" -p 56379:6379 redis:7-alpine >/dev/null
sleep 2
docker exec "${REDIS_CONTAINER}" redis-cli SET restore-validation-key drill-value >/dev/null
docker exec "${REDIS_CONTAINER}" redis-cli SAVE >/dev/null
mkdir -p "${REDIS_BACKUP_STAGING_DIR}"
RDB_PLAIN="${REDIS_BACKUP_STAGING_DIR}/redis-daily-${TS}.rdb"
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "${RDB_PLAIN}"
ARTIFACT_REDIS="${REDIS_BACKUP_ARCHIVE_DIR}/redis-daily-${TS}.rdb.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ARTIFACT_REDIS}" "${RDB_PLAIN}"
printf '%s  %s\n' "$(sha256sum "${ARTIFACT_REDIS}" | awk '{print $1}')" "$(basename "${ARTIFACT_REDIS}")" > "${ARTIFACT_REDIS}.sha256"
mv "${ARTIFACT_REDIS}" "${REDIS_BACKUP_ARCHIVE_DIR}/"
mv "${ARTIFACT_REDIS}.sha256" "${REDIS_BACKUP_ARCHIVE_DIR}/"

log "creating env snapshot artifact"
mkdir -p "${ROOT}/env-src"
cat > "${ROOT}/env-src/backend.env" <<'ENV'
DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:55432/synqdrive_source
REDIS_HOST=127.0.0.1
CLERK_SECRET_KEY=sk_test_restore_drill
ENV
echo 'VITE_API_BASE_URL=http://localhost:3001' > "${ROOT}/env-src/frontend.env"
ENV_TAR="${ROOT}/backups/env/staging/env-daily-${TS}.tar"
mkdir -p "$(dirname "${ENV_TAR}")"
tar -cf "${ENV_TAR}" -C "${ROOT}/env-src" backend.env frontend.env
ARTIFACT_ENV="${ROOT}/backups/env/daily/env-daily-${TS}.tar.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ARTIFACT_ENV}" "${ENV_TAR}"
printf '%s  %s\n' "$(sha256sum "${ARTIFACT_ENV}" | awk '{print $1}')" "$(basename "${ARTIFACT_ENV}")" > "${ARTIFACT_ENV}.sha256"

log "creating uploads + documents artifacts"
mkdir -p "${ROOT}/uploads-src/org-logos" "${ROOT}/docs-src/docs"
echo 'logo-bytes' > "${ROOT}/uploads-src/org-logos/logo.png"
echo '%PDF-1.4 drill' > "${ROOT}/docs-src/docs/sample.pdf"
UP_TAR="${ROOT}/backups/uploads/staging/uploads-daily-${TS}.tar"
mkdir -p "$(dirname "${UP_TAR}")"
tar -cf "${UP_TAR}" -C "${ROOT}/uploads-src" .
ARTIFACT_UP="${ROOT}/backups/uploads/daily/uploads-daily-${TS}.tar.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ARTIFACT_UP}" "${UP_TAR}"
printf '%s  %s\n' "$(sha256sum "${ARTIFACT_UP}" | awk '{print $1}')" "$(basename "${ARTIFACT_UP}")" > "${ARTIFACT_UP}.sha256"

DOC_TAR="${ROOT}/backups/documents/staging/documents-daily-${TS}.tar"
mkdir -p "$(dirname "${DOC_TAR}")"
tar -cf "${DOC_TAR}" -C "${ROOT}/docs-src" .
ARTIFACT_DOC="${ROOT}/backups/documents/daily/documents-daily-${TS}.tar.gpg"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "${PASSPHRASE_FILE}" \
  --output "${ARTIFACT_DOC}" "${DOC_TAR}"
printf '%s  %s\n' "$(sha256sum "${ARTIFACT_DOC}" | awk '{print $1}')" "$(basename "${ARTIFACT_DOC}")" > "${ARTIFACT_DOC}.sha256"

log "running vps-restore-validation.sh"
bash "${SCRIPT_DIR}/vps-restore-validation.sh"
REPORT="${RESTORE_VALIDATION_REPORT_DIR}/latest-report.json"
log "report written: ${REPORT}"
cat "${REPORT}"
