#!/usr/bin/env bash
# APD-PS1 — read-only Production replay (no polling / policy activation).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Run on Production VPS with readable backend.env or sudo." >&2
  exit 1
fi
exec sudo bash -lc "set -a; source '$ENV_FILE'; set +a; node '$SCRIPT_DIR/p25-apd-ps1-offline-replay.mjs'"
