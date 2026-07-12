#!/usr/bin/env bash
set -euo pipefail

RELEASE_ID="$(date -u +%Y%m%d%H%M%S)_v4994"
RELEASE_DIR="/opt/synqdrive/releases/${RELEASE_ID}"
BACKUP_DIR="/opt/synqdrive/shared/backups"
TS="$(date -u +%Y%m%d%H%M%S)"

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

sudo -u postgres pg_dump synqdrive | gzip > "${BACKUP_DIR}/db-pre-deploy-${TS}.sql.gz"

echo "==> Clone release ${RELEASE_ID}"
git clone --depth 1 --branch main https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$RELEASE_DIR"

echo "==> Link shared env/uploads"
ln -sfn /opt/synqdrive/shared/backend.env "$RELEASE_DIR/backend/.env"
ln -sfn /opt/synqdrive/shared/frontend.env "$RELEASE_DIR/frontend/.env"
ln -sfn /opt/synqdrive/shared/uploads "$RELEASE_DIR/backend/uploads"

echo "==> Link shared document storage"
SHARED_DOCS="/opt/synqdrive/shared/storage/documents"
mkdir -p "$SHARED_DOCS"
if [[ -d /opt/synqdrive/current/backend/storage/documents ]] && [[ ! -L /opt/synqdrive/current/backend/storage/documents ]]; then
  rsync -a /opt/synqdrive/current/backend/storage/documents/ "$SHARED_DOCS/" || true
fi
for legacy_docs in /opt/synqdrive/releases/*/backend/storage/documents; do
  if [[ -d "$legacy_docs" ]] && [[ ! -L "$legacy_docs" ]]; then
    rsync -a "$legacy_docs/" "$SHARED_DOCS/" || true
  fi
done
ln -sfn "$SHARED_DOCS" "$RELEASE_DIR/backend/storage/documents"

echo "==> Backend install/build/migrate"
cd "$RELEASE_DIR/backend"
npm ci
npx prisma generate
npm run prisma:migrate:deploy
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 \
  -f "$RELEASE_DIR/backend/scripts/ops/pg-fix-app-table-ownership.sql"
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
sleep 3
curl -sf http://127.0.0.1:3001/api/v1/health
echo
pm2 list
echo "Deployed release: ${RELEASE_ID} ($(git -C "$RELEASE_DIR" rev-parse --short HEAD))"
