#!/usr/bin/env bash
# Install or refresh SynqDrive Alertmanager on the production VPS (Docker).
#
# Prerequisites:
#   - Docker
#   - /opt/synqdrive/shared/alertmanager/alertmanager.env (from alertmanager.env.example)
#
# Requires at least one delivery channel:
#   - ALERTMANAGER_SLACK_WEBHOOK_URL, or
#   - ALERTMANAGER_SMTP_* + ALERTMANAGER_EMAIL_WARNING
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

: "${ALERTMANAGER_SMTP_HOST:=smtp.resend.com}"
: "${ALERTMANAGER_SMTP_PORT:=587}"
: "${ALERTMANAGER_SMTP_FROM:=alerts@synqdrive.eu}"
: "${ALERTMANAGER_SMTP_USER:=resend}"
: "${ALERTMANAGER_SMTP_PASSWORD:=}"
: "${ALERTMANAGER_EMAIL_WARNING:=}"
: "${ALERTMANAGER_EMAIL_CRITICAL:=}"
: "${ALERTMANAGER_EMAIL_ESCALATION:=}"
: "${ALERTMANAGER_SLACK_CHANNEL_WARNING:=#synqdrive-alerts}"
: "${ALERTMANAGER_SLACK_CHANNEL_CRITICAL:=#synqdrive-critical}"
: "${ALERTMANAGER_SLACK_WEBHOOK_URL:=}"

if [[ -z "${ALERTMANAGER_SLACK_WEBHOOK_URL}" && -z "${ALERTMANAGER_SMTP_PASSWORD}" ]]; then
  echo "ERROR: configure ALERTMANAGER_SLACK_WEBHOOK_URL or ALERTMANAGER_SMTP_PASSWORD in $AM_ENV" >&2
  exit 1
fi

if [[ -z "${ALERTMANAGER_SLACK_WEBHOOK_URL}" && -z "${ALERTMANAGER_EMAIL_WARNING}" ]]; then
  echo "ERROR: email mode requires ALERTMANAGER_EMAIL_WARNING in $AM_ENV" >&2
  exit 1
fi

if [[ -z "${ALERTMANAGER_EMAIL_CRITICAL}" ]]; then
  ALERTMANAGER_EMAIL_CRITICAL="${ALERTMANAGER_EMAIL_WARNING}"
fi
if [[ -z "${ALERTMANAGER_EMAIL_ESCALATION}" ]]; then
  ALERTMANAGER_EMAIL_ESCALATION="${ALERTMANAGER_EMAIL_CRITICAL}"
fi

mkdir -p "$AM_DIR/templates" "$AM_DIR/data"
chmod 700 "$AM_DIR/data"
chown -R 65534:65534 "$AM_DIR/data" 2>/dev/null || chmod 777 "$AM_DIR/data"

cp "$SRC_AM/templates/"*.tmpl "$AM_DIR/templates/" 2>/dev/null || true

if [[ -n "${ALERTMANAGER_SLACK_WEBHOOK_URL}" ]]; then
  cp "$SRC_AM/alertmanager.yml.example" "$AM_DIR/alertmanager.yml.template"
else
  cp "$SRC_AM/alertmanager.email.yml.example" "$AM_DIR/alertmanager.yml.template"
fi

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
# alertmanager image runs as nobody (65534) — allow container read without world-readable secrets
chown 65534:65534 "$AM_DIR/alertmanager.yml" 2>/dev/null || chmod 640 "$AM_DIR/alertmanager.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed on VPS" >&2
  exit 1
fi

echo "==> Validating Alertmanager config (amtool)"
if ! docker run --rm \
  --user 65534:65534 \
  --entrypoint amtool \
  -v "$AM_DIR/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v "$AM_DIR/templates:/etc/alertmanager/templates:ro" \
  "$AM_IMAGE" \
  check-config /etc/alertmanager/alertmanager.yml; then
  echo "ERROR: Alertmanager config validation failed — refusing to deploy invalid config" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network host \
  -v "$AM_DIR/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v "$AM_DIR/templates:/etc/alertmanager/templates:ro" \
  -v "$AM_DIR/data:/alertmanager" \
  "$AM_IMAGE" \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.listen-address=127.0.0.1:9093 \
  --web.external-url=http://127.0.0.1:9093/ \
  --log.level=info \
  --cluster.listen-address=

echo "Alertmanager container started: $CONTAINER"
echo "UI (VPS localhost only): http://127.0.0.1:9093"

sleep 3

if curl -sf "http://127.0.0.1:9093/-/healthy" >/dev/null; then
  echo "Alertmanager /-/healthy: OK"
else
  echo "ERROR: Alertmanager /-/healthy check failed — inspect: docker logs $CONTAINER" >&2
  docker logs "$CONTAINER" 2>&1 | tail -20
  exit 1
fi

if curl -sf "http://127.0.0.1:9093/-/ready" >/dev/null; then
  echo "Alertmanager /-/ready: OK"
else
  echo "ERROR: Alertmanager /-/ready check failed" >&2
  exit 1
fi
