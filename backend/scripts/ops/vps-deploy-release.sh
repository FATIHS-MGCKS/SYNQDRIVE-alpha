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
if [[ -x /opt/synqdrive/current/backend/scripts/ops/vps-backup-status-textfile.sh ]]; then
  bash /opt/synqdrive/current/backend/scripts/ops/vps-backup-status-textfile.sh "$(date +%s)" || true
fi

echo "==> Clone release ${RELEASE_ID}"
git clone --depth 1 --branch main https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git "$RELEASE_DIR"

echo "==> Link shared env/uploads"
ln -sfn /opt/synqdrive/shared/backend.env "$RELEASE_DIR/backend/.env"
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

echo "==> Sync ClickHouse shared config (Phase 2D.7 M4)"
SHARED_CH="/opt/synqdrive/shared/clickhouse"
mkdir -p "$SHARED_CH/backups" "$SHARED_CH/config/config.d" "$SHARED_CH/config/users.d"
chmod 700 "$SHARED_CH" "$SHARED_CH/backups" 2>/dev/null || true
if [[ -d "$RELEASE_DIR/backend/docker/clickhouse/config.d" ]]; then
  install -m 644 "$RELEASE_DIR/backend/docker/clickhouse/config.d/"*.xml "$SHARED_CH/config/config.d/"
fi
if [[ -d "$RELEASE_DIR/backend/docker/clickhouse/users.d" ]]; then
  install -m 644 "$RELEASE_DIR/backend/docker/clickhouse/users.d/"*.xml "$SHARED_CH/config/users.d/"
fi
if [[ -f "$RELEASE_DIR/backend/docker-compose.vps-clickhouse.yml" ]]; then
  if ! grep -q 'COMPOSE_FILE=.*vps-clickhouse' /opt/synqdrive/shared/backend.env 2>/dev/null; then
    echo "# ClickHouse VPS override (Phase 2D.7) — uncomment after first remediation run:"
    echo "# COMPOSE_FILE=/opt/synqdrive/current/backend/docker-compose.yml:/opt/synqdrive/current/backend/docker-compose.vps-clickhouse.yml"
  fi
fi

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

if [[ "${MONITORING_AUTO_REFRESH:-auto}" == "auto" ]]; then
  echo "==> Monitoring refresh (Prometheus reload + Grafana dashboards)"
  if bash "$RELEASE_DIR/backend/scripts/ops/vps-refresh-monitoring.sh"; then
    echo "Monitoring refresh: OK"
  else
    echo "WARN: monitoring refresh failed — app deploy succeeded; fix monitoring manually" >&2
  fi
fi
