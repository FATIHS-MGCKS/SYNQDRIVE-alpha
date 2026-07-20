#!/usr/bin/env bash
# Deploy Fleet Connectivity Release Candidate to VPS for staging validation.
# Uses a feature branch (not main) and enforces reconciliation apply kill switch defaults.
#
# Usage (on VPS as root):
#   GIT_BRANCH=cursor/connectivity-release-candidate-2e0d \
#     bash backend/scripts/ops/vps-deploy-connectivity-staging.sh
#
# From Cloud Agent:
#   ssh root@srv1374778.hstgr.cloud \
#     "GIT_BRANCH=cursor/connectivity-release-candidate-2e0d bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-connectivity-staging.sh"
set -euo pipefail

GIT_BRANCH="${GIT_BRANCH:-cursor/connectivity-release-candidate-2e0d}"
GIT_REPO="${GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)_connectivity-rc"
RELEASE_DIR="/opt/synqdrive/releases/${RELEASE_ID}"
BACKUP_DIR="/opt/synqdrive/shared/backups"
SHARED_ENV="/opt/synqdrive/shared/backend.env"
TS="$(date -u +%Y%m%d%H%M%S)"

echo "==> Fleet Connectivity RC staging deploy"
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

sudo -u postgres pg_dump synqdrive | gzip > "${BACKUP_DIR}/db-pre-connectivity-rc-${TS}.sql.gz"
echo "    backup=${BACKUP_DIR}/db-pre-connectivity-rc-${TS}.sql.gz"

echo "==> Ensure connectivity kill-switch defaults in shared backend.env"
touch "$SHARED_ENV"
ensure_env_default() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$SHARED_ENV" 2>/dev/null; then
    echo "    ${key} already set"
  else
    echo "${key}=${value}" >> "$SHARED_ENV"
    echo "    appended ${key}=${value}"
  fi
}
ensure_env_default "CONNECTIVITY_EPISODE_RECOVERY_ENABLED" "true"
ensure_env_default "CONNECTIVITY_RECONCILIATION_APPLY_ENABLED" "false"

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

echo "==> Post-deploy migrate status"
cd /opt/synqdrive/current/backend
npx prisma migrate status

echo "==> Health check"
sleep 5
curl -sf http://127.0.0.1:3001/api/v1/health
echo
pm2 list
echo "Deployed connectivity RC: ${RELEASE_ID} ($(git -C "$RELEASE_DIR" rev-parse --short HEAD)) branch=${GIT_BRANCH}"
