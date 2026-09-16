#!/usr/bin/env bash
# Fail-closed deploy guard: EXP021_FLEET_COORDINATOR_ENABLED=true requires PR-C fleet capability.
set -euo pipefail

RELEASE_DIR="${1:-}"
BACKEND_ENV="${EXP021_FLEET_DEPLOY_PREFLIGHT_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

if [[ -z "$RELEASE_DIR" ]]; then
  echo "Usage: $0 <release_dir>" >&2
  exit 2
fi

if [[ ! -d "$RELEASE_DIR/backend" ]]; then
  echo "!! ABORT: release backend directory missing: $RELEASE_DIR/backend" >&2
  exit 1
fi

COORDINATOR_ENABLED=false
if [[ -f "$BACKEND_ENV" ]]; then
  value="$(grep -E '^EXP021_FLEET_COORDINATOR_ENABLED=' "$BACKEND_ENV" | tail -1 | cut -d= -f2- | tr -d '"' | tr '[:upper:]' '[:lower:]' || true)"
  case "$value" in
    1 | true | yes) COORDINATOR_ENABLED=true ;;
  esac
fi

if [[ "$COORDINATOR_ENABLED" != true ]]; then
  echo "==> EXP-021 fleet deploy preflight: coordinator disabled — capability guard skipped"
  exit 0
fi

required_paths=(
  "backend/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.ts"
  "backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.ts"
  "backend/dist/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.js"
  "backend/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.js"
  "backend/src/workers/workers.module.ts"
)

missing=()
for rel in "${required_paths[@]}"; do
  if [[ ! -f "$RELEASE_DIR/$rel" ]]; then
    missing+=("$rel")
  fi
done

if ((${#missing[@]} > 0)); then
  echo "!! ABORT: EXP021_FLEET_COORDINATOR_ENABLED=true but target release lacks fleet coordinator capability" >&2
  printf 'missing: %s\n' "${missing[@]}" >&2
  exit 1
fi

if ! grep -q 'reference-capture-exp021-fleet-coordinator.scheduler' "$RELEASE_DIR/backend/src/workers/workers.module.ts"; then
  echo "!! ABORT: workers.module.ts missing fleet coordinator scheduler registration" >&2
  exit 1
fi

echo "==> EXP-021 fleet deploy preflight PASS (coordinator capability present)"
