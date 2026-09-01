#!/usr/bin/env bash
set -euo pipefail

GIT_REPO="${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
REQUESTED_SHA="${SYNQDRIVE_REQUESTED_DEPLOY_SHA:-}"

vps_clone_release_at_sha() {
  local dest=$1
  local sha=$2
  if [[ -z "$sha" ]]; then
    echo "!! ABORT: SYNQDRIVE_REQUESTED_DEPLOY_SHA is required (DEC-016 exact-SHA deploy provenance)" >&2
    exit 1
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  git -C "$dest" init -q
  git -C "$dest" remote add origin "$GIT_REPO"
  git -C "$dest" fetch --depth 1 origin "$sha"
  git -C "$dest" checkout -q FETCH_HEAD
  local actual
  actual="$(git -C "$dest" rev-parse HEAD)"
  if [[ "$actual" != "$sha" ]]; then
    echo "!! ABORT: release source SHA ${actual} != requested ${sha}" >&2
    exit 1
  fi
  echo "==> Release source SHA verified: ${sha:0:12}"
}

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
vps_clone_release_at_sha "$RELEASE_DIR" "$REQUESTED_SHA"

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

echo "==> Boot check (resolve module graph before promoting the release)"
cd "$RELEASE_DIR/backend"
if ! SYNQDRIVE_BOOT_CHECK=1 timeout 120 node dist/src/main.js; then
  echo "!! ABORT: release ${RELEASE_ID} failed to bootstrap — current release left untouched" >&2
  exit 1
fi

echo "==> Switch current + rolling multi-replica restart"
# Source ops libs from the NEW release being promoted — not the pre-switch current
# symlink copy of this script (P1.8.3 / OQ-18 bootstrap caveat: old current would
# load pre-P1.8.3.1 verify_post_deploy without the convergence gate).
RELEASE_OPS_DIR="${RELEASE_DIR}/backend/scripts/ops"
# shellcheck source=vps-production-replica-topology.config.sh
source "${RELEASE_OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"

TARGET_SHA="$(vps_replica_release_sha "$RELEASE_DIR")"
if [[ "$TARGET_SHA" != "$REQUESTED_SHA" ]]; then
  echo "!! ABORT: TARGET_SHA ${TARGET_SHA} != REQUESTED_SHA ${REQUESTED_SHA}" >&2
  exit 1
fi
echo "==> Deploy provenance: REQUESTED_SHA=${REQUESTED_SHA:0:12} TARGET_SHA=${TARGET_SHA:0:12}"
DEPLOY_STATE_FILE="${SYNQDRIVE_DEPLOY_STATE_DIR}/last-deploy-state.env"
ROLLBACK_ON_FAIL=1

vps_replica_capture_deploy_state "$DEPLOY_STATE_FILE"

ln -sfn "$RELEASE_DIR" /opt/synqdrive/current

if ! vps_replica_rolling_deploy "$RELEASE_DIR" "$TARGET_SHA"; then
  echo "!! ABORT: multi-replica rolling deploy failed for ${RELEASE_ID}" >&2
  if [[ "$ROLLBACK_ON_FAIL" -eq 1 ]]; then
    echo "==> Rolling back to previous release"
    vps_replica_rollback "$DEPLOY_STATE_FILE" || true
  fi
  exit 1
fi

if ! vps_replica_verify_post_deploy "$RELEASE_DIR" "$TARGET_SHA"; then
  echo "!! ABORT: post-deploy multi-replica verification failed for ${RELEASE_ID}" >&2
  if [[ "$ROLLBACK_ON_FAIL" -eq 1 ]]; then
    echo "==> Rolling back to previous release"
    vps_replica_rollback "$DEPLOY_STATE_FILE" || true
  fi
  exit 1
fi

echo "==> Multi-replica deploy verification PASS"
echo "    TARGET_SHA=${TARGET_SHA}"
echo "    REPLICA_COUNT=${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}"
echo "Deployed release: ${RELEASE_ID} ($(git -C "$RELEASE_DIR" rev-parse --short HEAD))"

if [[ "${MONITORING_AUTO_REFRESH:-auto}" == "auto" ]]; then
  echo "==> Monitoring refresh (Prometheus reload + Grafana dashboards)"
  if bash "$RELEASE_DIR/backend/scripts/ops/vps-refresh-monitoring.sh"; then
    echo "Monitoring refresh: OK"
  else
    echo "WARN: monitoring refresh failed — app deploy succeeded; fix monitoring manually" >&2
  fi
fi
