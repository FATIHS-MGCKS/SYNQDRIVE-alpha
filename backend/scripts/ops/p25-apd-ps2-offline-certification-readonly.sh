#!/usr/bin/env bash
# APD-PS2 — read-only Production certification replay.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
exec sudo bash -lc "set -a; source '$ENV_FILE'; set +a; node '$SCRIPT_DIR/p25-apd-ps2-offline-certification.mjs'"
