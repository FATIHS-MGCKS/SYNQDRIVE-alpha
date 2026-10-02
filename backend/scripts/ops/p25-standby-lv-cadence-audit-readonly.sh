#!/usr/bin/env bash
# P2.5 standby LV cadence — read-only Production PostgreSQL audit.
set -euo pipefail
if [[ "${1:-}" != "--local-vps" ]]; then
  echo "Run on production VPS: bash $0 --local-vps" >&2
  exit 1
fi
set +u
set -a
# shellcheck disable=SC1091
source /opt/synqdrive/shared/backend.env
set +a
DB="${DATABASE_URL%%\?*}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "${SCRIPT_DIR}/p25-standby-lv-cadence-audit-readonly.cjs" 2>/dev/null || {
  echo "Node pg module unavailable — use SQL in architecture evidence doc" >&2
  exit 1
}
