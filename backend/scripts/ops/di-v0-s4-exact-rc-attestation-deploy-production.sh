#!/usr/bin/env bash
# EXP-021 S4F-7Q — operator wrapper for future exact-RC deploy with PRESTATE gate (default: preflight only).
set -euo pipefail

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "${OPS_DIR}/.." && pwd)"
CLI="${OPS_DIR}/di-v0-s4f7q-exact-rc-attestation-deploy/di-v0-s4f7q-exact-rc-attestation-deploy-cli.ts"
TARGET_SHA="${SYNQDRIVE_REQUESTED_DEPLOY_SHA:-9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4}"
OLD_SHA="${DI_S4F7Q_EXPECTED_OLD_PRODUCTION_SHA:-ee9588548845c8077aa0cba0684b06eac7c9d4d2}"
BACKEND_ENV="${DI_S4F7Q_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
GLOBAL_STATE="${DI_S4F7Q_GLOBAL_KILL_STATE:-}"
EXECUTE_DEPLOY="${DI_S4F7Q_EXECUTE_DEPLOY:-0}"
CONTROLLER_ROOT="${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT:-$(git -C "${BACKEND_ROOT}/.." rev-parse --show-toplevel 2>/dev/null || echo "${BACKEND_ROOT}/..")}"
EXPECTED_CONTROLLER_SHA="${EXPECTED_DEPLOY_CONTROLLER_SHA:-$(git -C "$CONTROLLER_ROOT" rev-parse HEAD 2>/dev/null || true)}"

if [[ "${OPERATOR_ACK:-}" != "YES" ]]; then
  echo "ABORT: set OPERATOR_ACK=YES to run S4F-7Q exact-RC deploy wrapper"
  exit 1
fi

if [[ -z "$GLOBAL_STATE" ]]; then
  if command -v sudo >/dev/null && sudo -u postgres psql -d synqdrive -Atqc "SELECT kill_state FROM di_v0_s4_global_kill LIMIT 1;" 2>/dev/null; then
    GLOBAL_STATE="$(sudo -u postgres psql -d synqdrive -Atqc "SELECT kill_state FROM di_v0_s4_global_kill LIMIT 1;" 2>/dev/null | tr -d '[:space:]')"
  else
    echo "ABORT: set DI_S4F7Q_GLOBAL_KILL_STATE=KILLED or run on VPS with postgres read access"
    exit 1
  fi
fi

(
  cd "$BACKEND_ROOT"
  npx --yes ts-node --transpile-only "$CLI" sha-pins "$TARGET_SHA" "$OLD_SHA"
  npx --yes ts-node --transpile-only "$CLI" predeploy-full "$TARGET_SHA" "$OLD_SHA" "$GLOBAL_STATE" "$BACKEND_ENV"
)

echo "S4F7Q_PREDEPLOY_OK=YES"

if [[ "$EXECUTE_DEPLOY" != "1" ]]; then
  echo "DI_S4F7Q_EXECUTE_DEPLOY=0 — preflight only; no deploy invoked"
  exit 0
fi

export SYNQDRIVE_REQUESTED_DEPLOY_SHA="$TARGET_SHA"
export SYNQDRIVE_DEPLOY_CONTROLLER_ROOT="$CONTROLLER_ROOT"
export EXPECTED_DEPLOY_CONTROLLER_SHA="$EXPECTED_CONTROLLER_SHA"
export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=1
bash "${OPS_DIR}/vps-deploy-release.sh"
