#!/usr/bin/env bash
# EXP-021 fleet coordinator deploy capability guard.
# DEPLOY_EXECUTOR_GUARD_AUTHORITY — sourced by the executing vps-deploy-release.sh
# (or target preflight wrapper). Validates TARGET_RELEASE_CAPABILITY only.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

EXP021_FLEET_REQUIRED_SOURCE_PATHS=(
  "backend/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.ts"
  "backend/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.ts"
  "backend/src/workers/workers.module.ts"
)

EXP021_FLEET_REQUIRED_DIST_PATHS=(
  "backend/dist/src/workers/schedulers/reference-capture-exp021-fleet-coordinator.scheduler.js"
  "backend/dist/src/modules/vehicle-intelligence/reference-capture/exp021-fleet/reference-capture-exp021-fleet-coordinator.service.js"
)

EXP021_FLEET_COORDINATOR_CAPABILITY_MARKER="reference-capture-exp021-fleet-coordinator.scheduler"

vps_exp021_fleet_coordinator_enabled_from_env() {
  local backend_env="${1:-/opt/synqdrive/shared/backend.env}"
  if [[ ! -f "$backend_env" ]]; then
    return 1
  fi
  local value
  value="$(grep -E '^EXP021_FLEET_COORDINATOR_ENABLED=' "$backend_env" | tail -1 | cut -d= -f2- | tr -d '"' | tr '[:upper:]' '[:lower:]' || true)"
  case "$value" in
    1 | true | yes) return 0 ;;
    *) return 1 ;;
  esac
}

vps_exp021_verify_target_fleet_capability() {
  local release_dir="${1:-}"
  local backend_env="${2:-/opt/synqdrive/shared/backend.env}"

  if [[ -z "$release_dir" ]]; then
    echo "!! ABORT: EXP-021 fleet deploy guard requires release_dir" >&2
    return 1
  fi
  if [[ ! -d "$release_dir/backend" ]]; then
    echo "!! ABORT: release backend directory missing: ${release_dir}/backend" >&2
    return 1
  fi

  if ! vps_exp021_fleet_coordinator_enabled_from_env "$backend_env"; then
    echo "==> EXP021 fleet coordinator disabled — target capability not required"
    return 0
  fi

  local missing=()
  local rel path
  for rel in "${EXP021_FLEET_REQUIRED_SOURCE_PATHS[@]}" "${EXP021_FLEET_REQUIRED_DIST_PATHS[@]}"; do
    path="${release_dir}/${rel}"
    if [[ ! -f "$path" ]]; then
      missing+=("$rel")
    fi
  done

  if ((${#missing[@]} > 0)); then
    echo "!! ABORT: EXP021_FLEET_COORDINATOR_ENABLED=true but target release lacks fleet coordinator capability" >&2
    printf 'missing: %s\n' "${missing[@]}" >&2
    return 1
  fi

  local workers_module="${release_dir}/backend/src/workers/workers.module.ts"
  if ! grep -q "$EXP021_FLEET_COORDINATOR_CAPABILITY_MARKER" "$workers_module"; then
    echo "!! ABORT: workers.module.ts missing fleet coordinator scheduler registration" >&2
    return 1
  fi

  echo "==> EXP-021 fleet deploy guard PASS (target release has coordinator capability)"
  return 0
}
