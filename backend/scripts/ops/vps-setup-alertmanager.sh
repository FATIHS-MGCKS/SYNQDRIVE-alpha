#!/usr/bin/env bash
# Install or refresh SynqDrive Alertmanager on the production VPS (Docker).
#
# Prerequisites:
#   - Docker
#   - /opt/synqdrive/shared/alertmanager/alertmanager.env (from alertmanager.env.example)
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-alertmanager.sh
set -euo pipefail

SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
AM_DIR="${AM_DIR:-/opt/synqdrive/shared/alertmanager}"
AM_IMAGE="${AM_IMAGE:-prom/alertmanager:v0.27.0}"
CONTAINER="${CONTAINER:-synqdrive-alertmanager}"
AM_ENV="${AM_ENV:-$AM_DIR/alertmanager.env}"

SRC_AM="${SYNQDRIVE_ROOT}/backend/monitoring/alertmanager"
if [[ ! -f "$SRC_AM/alertmanager.yml.example" ]]; then
  echo "ERROR: $SRC_AM/alertmanager.yml.example not found (deploy latest main first)" >&2
  exit 1
fi

if [[ ! -f "$AM_ENV" ]]; then
  echo "ERROR: $AM_ENV not found — copy alertmanager.env.example and fill secrets" >&2
  echo "  cp $SRC_AM/alertmanager.env.example $AM_ENV && chmod 600 $AM_ENV" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$AM_ENV"
set +a

: "${ALERTMANAGER_SLACK_WEBHOOK_URL:?ALERTMANAGER_SLACK_WEBHOOK_URL required in $AM_ENV}"
: "${ALERTMANAGER_SLACK_CHANNEL_WARNING:=#synqdrive-alerts}"
: "${ALERTMANAGER_SLACK_CHANNEL_CRITICAL:=#synqdrive-critical}"
: "${ALERTMANAGER_SMTP_HOST:=localhost}"
: "${ALERTMANAGER_SMTP_PORT:=587}"
: "${ALERTMANAGER_SMTP_FROM:=alerts@synqdrive.eu}"
: "${ALERTMANAGER_SMTP_USER:=}"
: "${ALERTMANAGER_SMTP_PASSWORD:=}"
: "${ALERTMANAGER_EMAIL_WARNING:=}"
: "${ALERTMANAGER_EMAIL_CRITICAL:=}"
: "${ALERTMANAGER_EMAIL_ESCALATION:=}"

mkdir -p "$AM_DIR/templates"
cp "$SRC_AM/alertmanager.yml.example" "$AM_DIR/alertmanager.yml.template"
cp "$SRC_AM/templates/"*.tmpl "$AM_DIR/templates/"

export ALERTMANAGER_SLACK_WEBHOOK_URL
export ALERTMANAGER_SLACK_CHANNEL_WARNING
export ALERTMANAGER_SLACK_CHANNEL_CRITICAL
export ALERTMANAGER_SMTP_HOST
export ALERTMANAGER_SMTP_PORT
export ALERTMANAGER_SMTP_FROM
export ALERTMANAGER_SMTP_USER
export ALERTMANAGER_SMTP_PASSWORD
export ALERTMANAGER_EMAIL_WARNING
export ALERTMANAGER_EMAIL_CRITICAL
export ALERTMANAGER_EMAIL_ESCALATION

envsubst < "$AM_DIR/alertmanager.yml.template" > "$AM_DIR/alertmanager.yml"
chmod 600 "$AM_DIR/alertmanager.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  -v "$AM_DIR/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v "$AM_DIR/templates:/etc/alertmanager/templates:ro" \
  "$AM_IMAGE" \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --web.listen-address=127.0.0.1:9093 \
  --web.external-url=http://127.0.0.1:9093/ \
  --cluster.listen-address=

echo "Alertmanager container started: $CONTAINER"
echo "UI (VPS localhost only): http://127.0.0.1:9093"
echo "Silences: http://127.0.0.1:9093/#/silences"

sleep 3

if curl -sf "http://127.0.0.1:9093/-/healthy" >/dev/null; then
  echo "Alertmanager health: OK"
else
  echo "WARN: Alertmanager /-/healthy check failed — inspect: docker logs $CONTAINER" >&2
  exit 1
fi
