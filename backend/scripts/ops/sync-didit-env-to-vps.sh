#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="${ROOT}/.env"
REMOTE_ENV="/opt/synqdrive/shared/backend.env"
VPS_HOST="${DIDIT_SYNC_VPS_HOST:-srv1374778.hstgr.cloud}"
SSH_USER="${DIDIT_SYNC_SSH_USER:-root}"
SSH_KEY="${DIDIT_SYNC_SSH_KEY:-${HOME}/.ssh/id_ed25519}"

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "ERROR: $LOCAL_ENV not found" >&2
  exit 1
fi

DIDIT_LINES="$(grep -E '^(# DIDIT|DIDIT_)' "$LOCAL_ENV" || true)"
if [[ -z "$DIDIT_LINES" ]]; then
  echo "ERROR: no DIDIT_* lines in $LOCAL_ENV" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  ssh -i "$SSH_KEY" -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
    "grep -v -E '^(# DIDIT|DIDIT_)' '$REMOTE_ENV' || true"
  printf '%s\n' "$DIDIT_LINES"
} > "$TMP"

ssh -i "$SSH_KEY" -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "cp '$REMOTE_ENV' '${REMOTE_ENV}.bak-didit-$(date -u +%Y%m%d%H%M%S)' && cat > '$REMOTE_ENV'" < "$TMP"

echo "Synced DIDIT block from local backend/.env to ${SSH_USER}@${VPS_HOST}:${REMOTE_ENV}"
echo "Keys synced:"
printf '%s\n' "$DIDIT_LINES" | cut -d= -f1
echo "Run: ssh ${SSH_USER}@${VPS_HOST} 'pm2 restart synqdrive --update-env'"
