#!/usr/bin/env bash
# SynqDrive production deploy delegate — VO5C pinned runner only (single VPS).
# Does NOT set SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 (human gate on VPS session file or operator shell).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
# shellcheck source=lib/cloud-agent-vo5c-operator-session.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-operator-session.lib.sh"
# shellcheck source=lib/cloud-agent-vo5c-bootstrap-contract.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-bootstrap-contract.lib.sh"
# shellcheck source=lib/cloud-agent-vo5c-bootstrap-remote.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-bootstrap-remote.lib.sh"

SSH_USER="$(cloud_agent_ssh_user "$VPS_HOST")"
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
SSH_KEY="$(cloud_agent_ssh_key_path)"
HEALTH_URL="${CLOUD_AGENT_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
GIT_REMOTE="${CLOUD_AGENT_GIT_REMOTE:-origin}"
GIT_BRANCH="${CLOUD_AGENT_GIT_BRANCH:-main}"
OPERATOR_SESSION_FILE="${CLOUD_AGENT_VO5C_OPERATOR_SESSION_FILE:-/opt/synqdrive/shared/vo5c-operator-deploy-session.env}"
PIN_ENV_FILE="${CLOUD_AGENT_VO5C_PIN_ENV:-/opt/synqdrive/shared/vo5c-pinned-executor.env}"
STAGED_RELEASE_ROOT="${CLOUD_AGENT_STAGED_RELEASE_ROOT:-/opt/synqdrive/staging-release}"

validate_requested_deploy_sha() {
  local sha=$1
  if ! node --input-type=module -e "
import { assertValidDeploySha } from '${ROOT}/backend/scripts/ops/deploy-sha-provenance.mjs';
const r = assertValidDeploySha(process.argv[1]);
if (!r.ok) {
  console.error('[cloud-agent] ERROR: invalid REQUESTED_DEPLOY_SHA:', r.reason);
  process.exit(1);
}
process.stdout.write(r.sha);
" "$sha"; then
    exit 1
  fi
}

validate_config_paths() {
  if ! cloud_agent_vo5c_validate_shared_path "$PIN_ENV_FILE"; then
    echo "[cloud-agent] ERROR: invalid CLOUD_AGENT_VO5C_PIN_ENV path" >&2
    exit 1
  fi
  if ! cloud_agent_vo5c_validate_shared_path "$OPERATOR_SESSION_FILE"; then
    echo "[cloud-agent] ERROR: invalid CLOUD_AGENT_VO5C_OPERATOR_SESSION_FILE path" >&2
    exit 1
  fi
  if [[ -n "$STAGED_RELEASE_ROOT" ]] && ! cloud_agent_vo5c_validate_shared_path "$STAGED_RELEASE_ROOT"; then
    echo "[cloud-agent] ERROR: invalid CLOUD_AGENT_STAGED_RELEASE_ROOT path" >&2
    exit 1
  fi
}

cloud_agent_build_ssh_argv() {
  CLOUD_AGENT_SSH_ARGV=()
  cloud_agent_ssh_append_openssh_opts CLOUD_AGENT_SSH_ARGV "$VPS_HOST" "$SSH_PORT" || return 1
  CLOUD_AGENT_SSH_ARGV+=( "${SSH_USER}@${VPS_HOST}" )
  return 0
}

ensure_ssh_key() {
  cloud_agent_require_ssh_identity || exit 1
  cloud_agent_ssh_require_trusted_host_key "$VPS_HOST" "$SSH_PORT" || exit 1
  cloud_agent_ssh_auth_preflight "$VPS_HOST" || exit 1
}

preflight_git() {
  if [[ "${CLOUD_AGENT_SKIP_GIT_PREFLIGHT:-0}" == "1" ]]; then
    echo "[cloud-agent] Skipping git preflight (CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1)."
    if [[ -z "${CLOUD_AGENT_REQUESTED_DEPLOY_SHA:-}" ]]; then
      echo "[cloud-agent] ERROR: CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 requires explicit CLOUD_AGENT_REQUESTED_DEPLOY_SHA." >&2
      exit 1
    fi
    CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$(validate_requested_deploy_sha "${CLOUD_AGENT_REQUESTED_DEPLOY_SHA}")"
    export CLOUD_AGENT_REQUESTED_DEPLOY_SHA
    echo "[cloud-agent] Using explicit REQUESTED_DEPLOY_SHA=${CLOUD_AGENT_REQUESTED_DEPLOY_SHA:0:12} (skip preflight)."
    return 0
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[cloud-agent] ERROR: not a git worktree — cannot resolve REQUESTED_DEPLOY_SHA." >&2
    exit 1
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[cloud-agent] ERROR: uncommitted changes detected. Commit (or stash) before deploy." >&2
    git status --short
    exit 1
  fi

  git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || {
    echo "[cloud-agent] ERROR: could not fetch ${GIT_REMOTE}/${GIT_BRANCH}." >&2
    exit 1
  }

  LOCAL_HEAD="$(git rev-parse HEAD)"
  REMOTE_HEAD="$(git rev-parse "${GIT_REMOTE}/${GIT_BRANCH}")"
  if [[ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]]; then
    echo "[cloud-agent] ERROR: local HEAD (${LOCAL_HEAD:0:7}) != ${GIT_REMOTE}/${GIT_BRANCH} (${REMOTE_HEAD:0:7})." >&2
    echo "[cloud-agent] Push to ${GIT_REMOTE} before deploy." >&2
    exit 1
  fi

  echo "[cloud-agent] Git preflight OK: ${LOCAL_HEAD:0:7} on ${GIT_REMOTE}/${GIT_BRANCH}."
  CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$(validate_requested_deploy_sha "$LOCAL_HEAD")"
  export CLOUD_AGENT_REQUESTED_DEPLOY_SHA
}

print_operator_pinned_instructions() {
  local sha=$1
  cat >&2 <<EOF
[cloud-agent] Production deploy requires human VO5C authorization on the single Hostinger VPS (no second staging VM).

On VPS (operator console), before re-running this script:

  1. Create root-owned session file (mode 600, not a symlink):
       sudo install -m 600 /dev/null ${OPERATOR_SESSION_FILE}
       sudo tee ${OPERATOR_SESSION_FILE} <<SESS
SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
AUTHORIZED_REQUESTED_SHA=${sha}
AUTHORIZED_UNTIL_EPOCH=\$(date -u -d '+15 minutes' +%s)
SESS
  2. Revoke after deploy: sudo rm -f ${OPERATOR_SESSION_FILE}

Cloud Agent accepts only the VPS session file (not operator-shell SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED).
Manual pinned deploy on the VPS console: export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 and run vps-vo5c-run-pinned-security-deploy.sh from the pinned ops tree.

This script never sets SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 and never shallow-fetches vps-deploy-release.sh from /current.
EOF
}

run_remote_pinned_deploy() {
  if [[ -z "${CLOUD_AGENT_REQUESTED_DEPLOY_SHA:-}" ]]; then
    echo "[cloud-agent] ERROR: CLOUD_AGENT_REQUESTED_DEPLOY_SHA unset." >&2
    exit 1
  fi
  local requested_sha="${CLOUD_AGENT_REQUESTED_DEPLOY_SHA}"
  validate_requested_deploy_sha "$requested_sha" >/dev/null
  validate_config_paths

  if [[ -n "${CLOUD_AGENT_VPS_DEPLOY_SCRIPT:-}" ]] && [[ "${CLOUD_AGENT_VPS_DEPLOY_SCRIPT}" != *"vps-vo5c-run-pinned-security-deploy.sh"* ]]; then
    echo "[cloud-agent] ERROR: CLOUD_AGENT_VPS_DEPLOY_SCRIPT override to legacy vps-deploy-release.sh is blocked (DSRG consolidation)." >&2
    exit 1
  fi

  if [[ "${CLOUD_AGENT_SKIP_BOOTSTRAP_PREFLIGHT:-0}" != "1" ]]; then
    cloud_agent_build_ssh_argv || exit 1
    local ssh_check=(ssh "${CLOUD_AGENT_SSH_ARGV[@]}")
    local preflight_cmd
    preflight_cmd="$(cloud_agent_vo5c_remote_bootstrap_preflight_command "$CLOUD_AGENT_VO5C_BOOTSTRAP_PATH" "$SSH_USER")"
    set +e
    local preflight_out preflight_rc
    preflight_out="$("${ssh_check[@]}" "$preflight_cmd" 2>&1)"
    preflight_rc=$?
    set -e
    if [[ "$preflight_rc" -ne 0 ]]; then
      if echo "$preflight_out" | grep -qiE 'sudo:.*password|not allowed|sorry, user'; then
        echo "[cloud-agent] ERROR: passwordless sudo not authorized for VO5C bootstrap (see sudoers contract in install doc)." >&2
        exit "$CLOUD_AGENT_REMOTE_EXIT_SUDO_DENIED"
      fi
      echo "[cloud-agent] ERROR: VO5C Cloud Agent bootstrap preflight failed on VPS: ${CLOUD_AGENT_VO5C_BOOTSTRAP_PATH}" >&2
      echo "[cloud-agent] Install from promoted pin per architecture/dsrg/evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md (fail-closed until verified)." >&2
      print_operator_pinned_instructions "$requested_sha"
      exit "$CLOUD_AGENT_REMOTE_EXIT_BOOTSTRAP_MISSING"
    fi
  fi

  echo "[cloud-agent] Invoking fixed VPS bootstrap on ${SSH_USER}@${VPS_HOST} ..."
  echo "[cloud-agent] REQUESTED_DEPLOY_SHA=${requested_sha}"
  echo "[cloud-agent] BOOTSTRAP=${CLOUD_AGENT_VO5C_BOOTSTRAP_PATH}"

  cloud_agent_build_ssh_argv || exit 1
  local ssh_prefix=(ssh "${CLOUD_AGENT_SSH_ARGV[@]}")
  local remote_invocation
  remote_invocation="$(cloud_agent_vo5c_remote_bootstrap_invoke_command "$CLOUD_AGENT_VO5C_BOOTSTRAP_PATH" "$SSH_USER" "$requested_sha")"

  set +e
  local remote_out
  remote_out="$("${ssh_prefix[@]}" "$remote_invocation" 2>&1)"
  local remote_rc=$?
  set -e
  if [[ "$remote_rc" -ne 0 ]] && echo "$remote_out" | grep -qiE 'sudo:.*password|not allowed|sorry, user'; then
    echo "[cloud-agent] ERROR: passwordless sudo denied for bootstrap invocation." >&2
    exit "$CLOUD_AGENT_REMOTE_EXIT_SUDO_DENIED"
  fi

  if [[ "$remote_rc" -eq "$CLOUD_AGENT_REMOTE_EXIT_BOOTSTRAP_MISSING" ]]; then
    echo "[cloud-agent] ERROR: VPS bootstrap missing (exit ${remote_rc})." >&2
    exit "$remote_rc"
  fi
  if [[ "$remote_rc" -eq "$CLOUD_AGENT_REMOTE_EXIT_BOOTSTRAP_INTEGRITY" ]]; then
    echo "[cloud-agent] ERROR: VPS bootstrap integrity verification failed (exit ${remote_rc})." >&2
    exit "$remote_rc"
  fi
  if [[ "$remote_rc" -eq 42 ]]; then
    print_operator_pinned_instructions "$requested_sha"
    exit 42
  fi
  if [[ "$remote_rc" -eq 3 ]]; then
    echo "[cloud-agent] Remote deploy PARTIAL_SUCCESS (exit 3): replicas verified; P4B16 attestation reconciliation required." >&2
    exit 3
  fi
  if [[ "$remote_rc" -ne 0 ]]; then
    echo "[cloud-agent] ERROR: pinned deploy failed (exit ${remote_rc})." >&2
    exit "$remote_rc"
  fi
  return 0
}

verify_public_health() {
  local attempts="${CLOUD_AGENT_HEALTH_RETRIES:-5}"
  local delay="${CLOUD_AGENT_HEALTH_DELAY_SEC:-3}"

  echo "[cloud-agent] Verifying public health ${HEALTH_URL} ..."
  for _ in $(seq 1 "$attempts"); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      curl -sf "$HEALTH_URL"
      echo
      return 0
    fi
    sleep "$delay"
  done

  echo "[cloud-agent] WARN: public health check failed after ${attempts} attempts." >&2
  return 1
}

if [[ "${CLOUD_AGENT_SKIP_VPS_VERIFY:-0}" != "1" ]]; then
  bash "${ROOT}/.cursor/scripts/cloud-agent-verify-vps.sh"
fi
ensure_ssh_key
preflight_git
run_remote_pinned_deploy

HEALTH_RC=0
if ! verify_public_health; then
  HEALTH_RC=1
fi

if [[ "$HEALTH_RC" -ne 0 ]]; then
  echo "[cloud-agent] OUTCOME: pinned_deploy=OK public_health=FAIL (exit 2)" >&2
  exit 2
fi

echo "[cloud-agent] OUTCOME: pinned_deploy=OK public_health=OK"
