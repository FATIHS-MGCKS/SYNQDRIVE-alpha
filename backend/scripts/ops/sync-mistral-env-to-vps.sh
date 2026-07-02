#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="${ROOT}/.env"
REMOTE_ENV="/opt/synqdrive/shared/backend.env"
VPS_HOST="${MISTRAL_SYNC_VPS_HOST:-srv1374778.hstgr.cloud}"
SSH_USER="${MISTRAL_SYNC_SSH_USER:-root}"
SSH_KEY="${MISTRAL_SYNC_SSH_KEY:-${HOME}/.ssh/id_ed25519}"

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "ERROR: $LOCAL_ENV not found" >&2
  exit 1
fi

MISTRAL_LINES="$(grep -E '^(# MISTRAL|# AI Gateway|AI_|MISTRAL_|DOCUMENT_AI_)' "$LOCAL_ENV" || true)"
if [[ -z "$MISTRAL_LINES" ]]; then
  echo "ERROR: no AI_/MISTRAL_/DOCUMENT_AI_ lines in $LOCAL_ENV" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  ssh -i "$SSH_KEY" -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
    "grep -v -E '^(# MISTRAL|# AI Gateway|AI_|MISTRAL_|DOCUMENT_AI_)' '$REMOTE_ENV' || true"
  printf '%s\n' "$MISTRAL_LINES"
} > "$TMP"

ssh -i "$SSH_KEY" -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "cp '$REMOTE_ENV' '${REMOTE_ENV}.bak-mistral-$(date -u +%Y%m%d%H%M%S)' && cat > '$REMOTE_ENV'" < "$TMP"

echo "Synced Mistral/AI block from local backend/.env to ${SSH_USER}@${VPS_HOST}:${REMOTE_ENV}"
echo "Keys synced:"
printf '%s\n' "$MISTRAL_LINES" | cut -d= -f1
echo "Run: ssh ${SSH_USER}@${VPS_HOST} 'pm2 restart synqdrive --update-env'"
