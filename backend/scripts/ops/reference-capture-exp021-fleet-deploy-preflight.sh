#!/usr/bin/env bash
# Optional TARGET_RELEASE_CAPABILITY wrapper — delegates to deploy executor guard lib.
set -euo pipefail

RELEASE_DIR="${1:-}"
BACKEND_ENV="${EXP021_FLEET_DEPLOY_PREFLIGHT_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

if [[ -z "$RELEASE_DIR" ]]; then
  echo "Usage: $0 <release_dir>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-exp021-fleet-deploy-guard.lib.sh
source "${SCRIPT_DIR}/lib/vps-exp021-fleet-deploy-guard.lib.sh"

vps_exp021_verify_target_fleet_capability "$RELEASE_DIR" "$BACKEND_ENV"
