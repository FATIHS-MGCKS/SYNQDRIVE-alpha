#!/usr/bin/env bash
# Deploy Data Authorization Release Candidate to VPS for staging validation.
#
# Usage (on VPS as root):
#   GIT_BRANCH=cursor/data-auth-monitoring-ci-26b5 \
#     bash backend/scripts/ops/vps-deploy-data-auth-staging.sh
#
# From Cloud Agent:
#   ssh root@srv1374778.hstgr.cloud \
#     "GIT_BRANCH=cursor/data-auth-monitoring-ci-26b5 bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-data-auth-staging.sh"
set -euo pipefail

GIT_BRANCH="${GIT_BRANCH:-cursor/data-auth-monitoring-ci-26b5}"
GIT_REPO="${GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)_data-auth-rc"
RELEASE_DIR="/opt/synqdrive/releases/${RELEASE_ID}"
BACKUP_DIR="/opt/synqdrive/shared/backups"
SHARED_ENV="/opt/synqdrive/shared/backend.env"
TS="$(date -u +%Y%m%d%H%M%S)"

echo "==> Data Authorization RC staging deploy"
echo "    branch=${GIT_BRANCH}"
echo "    release=${RELEASE_ID}"

echo "==> Pre-deploy DB backup"
mkdir -p "$BACKUP_DIR"

DISK_USE_PCT="$(df / | tail -1 | awk '{print $5}' | tr -d '%')"
if [[ "$DISK_USE_PCT" -ge 90 ]]; then
  echo "!! ABORT: root filesystem ${DISK_USE_PCT}% full — free disk before deploy" >&2
  exit 1
fi
if [[ "$DISK_USE_PCT" -ge 85 ]]; then
  echo "!! WARN: root filesystem ${DISK_USE_PCT}% full"
fi

sudo -u postgres pg_dump synqdrive | gzip > "${BACKUP_DIR}/db-pre-data-auth-rc-${TS}.sql.gz"
echo "    backup=${BACKUP_DIR}/db-pre-data-auth-rc-${TS}.sql.gz"

echo "==> Ensure data-auth safety defaults in shared backend.env"
touch "$SHARED_ENV"
ensure_env_default() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$SHARED_ENV" 2>/dev/null; then
    echo "    ${key} already set"
  else
    echo "${key}=${value}" >> "$SHARED_ENV"
    echo "    appended ${key}=<default>"
  fi
}
ensure_env_default "DATA_AUTH_DECISION_DEV_BYPASS" "false"
ensure_env_default "DATA_AUTH_DECISION_ENFORCEMENT_ENABLED" "true"
ensure_env_default "DATA_AUTH_DECISION_GLOBAL_DENY" "false"
ensure_env_default "RETENTION_DELETION_SCHEDULER_DRY_RUN" "true"

echo "==> Clone release ${RELEASE_ID} from ${GIT_BRANCH}"
git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" "$RELEASE_DIR"

echo "==> Link shared env/uploads"
ln -sfn "$SHARED_ENV" "$RELEASE_DIR/backend/.env"
ln -sfn /opt/synqdrive/shared/frontend.env "$RELEASE_DIR/frontend/.env"
ln -sfn /opt/synqdrive/shared/uploads "$RELEASE_DIR/backend/uploads"

echo "==> Link shared document storage"
SHARED_DOCS="/opt/synqdrive/shared/storage/documents"
mkdir -p "$SHARED_DOCS" "$RELEASE_DIR/backend/storage"
if [[ -d /opt/synqdrive/current/backend/storage/documents ]] && [[ ! -L /opt/synqdrive/current/backend/storage/documents ]]; then
  rsync -a /opt/synqdrive/current/backend/storage/documents/ "$SHARED_DOCS/" || true
fi
for legacy_docs in /opt/synqdrive/releases/*/backend/storage/documents; do
  if [[ -d "$legacy_docs" ]] && [[ ! -L "$legacy_docs" ]]; then
    rsync -a "$legacy_docs/" "$SHARED_DOCS/" || true
  fi
done
ln -sfn "$SHARED_DOCS" "$RELEASE_DIR/backend/storage/documents"

echo "==> Prisma migrate status (before deploy)"
cd "$RELEASE_DIR/backend"
npm ci
npx prisma generate
npx prisma migrate status || true

echo "==> Prisma migrate deploy"
npm run prisma:migrate:deploy
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 \
  -f "$RELEASE_DIR/backend/scripts/ops/pg-fix-app-table-ownership.sql"

echo "==> Backend build"
npm run build

echo "==> Frontend install/build"
cd "$RELEASE_DIR/frontend"
npm ci
npm run build

echo "==> Switch current + restart pm2"
ln -sfn "$RELEASE_DIR" /opt/synqdrive/current
cd /opt/synqdrive/current/backend
pm2 restart synqdrive --update-env
pm2 save

echo "==> Health check"
sleep 5
curl -sf http://127.0.0.1:3001/api/v1/health
echo
pm2 list
echo "Deployed data-auth RC: ${RELEASE_ID} ($(git -C "$RELEASE_DIR" rev-parse --short HEAD))"

if [[ "${MONITORING_AUTO_REFRESH:-auto}" == "auto" ]]; then
  echo "==> Monitoring refresh"
  if bash "$RELEASE_DIR/backend/scripts/ops/vps-refresh-monitoring.sh"; then
    echo "Monitoring refresh: OK"
  else
    echo "WARN: monitoring refresh failed — app deploy succeeded" >&2
  fi
fi
