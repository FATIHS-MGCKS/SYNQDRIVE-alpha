#!/usr/bin/env bash
# SynqDrive production deploy — direct SSH to single VPS → vps-deploy-release.sh.
# Owner authorization: explicit production-deploy instruction in Cursor (CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
# shellcheck source=lib/cloud-agent-direct-ssh-deploy.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-direct-ssh-deploy.lib.sh"

SSH_USER="$(cloud_agent_ssh_user "$VPS_HOST")"
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
HEALTH_URL="${CLOUD_AGENT_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
GIT_REMOTE="${CLOUD_AGENT_GIT_REMOTE:-origin}"
GIT_BRANCH="${CLOUD_AGENT_GIT_BRANCH:-main}"
VPS_DEPLOY_SCRIPT="${CLOUD_AGENT_VPS_DEPLOY_SCRIPT:-$CLOUD_AGENT_DEFAULT_VPS_DEPLOY_SCRIPT}"
GITHUB_REPO="${CLOUD_AGENT_GITHUB_REPO:-FATIHS-MGCKS/SYNQDRIVE-alpha}"

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

assert_owner_deploy_authorized() {
  if [[ "${CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED:-0}" != "1" ]]; then
    echo "[cloud-agent] ERROR: production deploy requires owner instruction." >&2
    echo "[cloud-agent] Set CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 when the owner explicitly requested a production release." >&2
    exit "$CLOUD_AGENT_REMOTE_EXIT_OWNER_DEPLOY_NOT_AUTHORIZED"
  fi
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
    echo "[cloud-agent] Push to ${GIT_REMOTE} before deploy, or use CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 with an explicit SHA." >&2
    exit 1
  fi

  echo "[cloud-agent] Git preflight OK: ${LOCAL_HEAD:0:7} on ${GIT_REMOTE}/${GIT_BRANCH}."
  CLOUD_AGENT_REQUESTED_DEPLOY_SHA="$(validate_requested_deploy_sha "$LOCAL_HEAD")"
  export CLOUD_AGENT_REQUESTED_DEPLOY_SHA
}

preflight_ci_gate() {
  local sha="${CLOUD_AGENT_REQUESTED_DEPLOY_SHA:?}"
  echo "[cloud-agent] Verifying CI gate (all critical jobs) for ${sha:0:12} ..."
  if ! node "${ROOT}/backend/scripts/ops/deploy-ci-gate.mjs" "$sha"; then
    echo "[cloud-agent] ERROR: mandatory CI gate not successful for REQUESTED_DEPLOY_SHA (non-bypassable)." >&2
    exit 1
  fi
}

preflight_deploy_script_path() {
  if ! cloud_agent_direct_ssh_validate_deploy_script_path "$VPS_DEPLOY_SCRIPT"; then
    echo "[cloud-agent] ERROR: invalid CLOUD_AGENT_VPS_DEPLOY_SCRIPT (must be under /opt/synqdrive/.../vps-deploy-release.sh)" >&2
    exit 1
  fi
}

run_remote_direct_deploy() {
  local requested_sha="${CLOUD_AGENT_REQUESTED_DEPLOY_SHA:?}"
  validate_requested_deploy_sha "$requested_sha" >/dev/null
  preflight_deploy_script_path

  cloud_agent_build_ssh_argv || exit 1
  local ssh_check=(ssh "${CLOUD_AGENT_SSH_ARGV[@]}")
  local preflight_cmd
  preflight_cmd="$(cloud_agent_direct_ssh_remote_preflight_command "$VPS_DEPLOY_SCRIPT")"
  set +e
  local preflight_out preflight_rc
  preflight_out="$("${ssh_check[@]}" "$preflight_cmd" 2>&1)"
  preflight_rc=$?
  set -e
  if [[ "$preflight_rc" -ne 0 ]] || ! echo "$preflight_out" | grep -q 'DEPLOY_SCRIPT_OK'; then
    echo "[cloud-agent] ERROR: VPS deploy script missing or unreachable: ${VPS_DEPLOY_SCRIPT}" >&2
    echo "$preflight_out" >&2
    exit "$CLOUD_AGENT_REMOTE_EXIT_DEPLOY_SCRIPT_MISSING"
  fi

  echo "[cloud-agent] Invoking direct SSH production release on ${SSH_USER}@${VPS_HOST} ..."
  echo "[cloud-agent] REQUESTED_DEPLOY_SHA=${requested_sha}"
  echo "[cloud-agent] VPS_DEPLOY_SCRIPT=${VPS_DEPLOY_SCRIPT}"

  local remote_invocation
  remote_invocation="$(cloud_agent_direct_ssh_remote_invoke_command "$VPS_DEPLOY_SCRIPT" "$requested_sha" "$SSH_USER")"

  set +e
  local remote_out
  remote_out="$("${ssh_check[@]}" "$remote_invocation" 2>&1)"
  local remote_rc=$?
  set -e
  echo "$remote_out"

  if [[ "$remote_rc" -eq 3 ]]; then
    echo "[cloud-agent] Remote deploy PARTIAL_SUCCESS (exit 3): replicas verified; P4B16 attestation reconciliation required." >&2
    exit 3
  fi
  if [[ "$remote_rc" -ne 0 ]]; then
    echo "[cloud-agent] ERROR: production release failed (exit ${remote_rc})." >&2
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
assert_owner_deploy_authorized
ensure_ssh_key
preflight_git
preflight_ci_gate
run_remote_direct_deploy

HEALTH_RC=0
if ! verify_public_health; then
  HEALTH_RC=1
fi

if [[ "$HEALTH_RC" -ne 0 ]]; then
  echo "[cloud-agent] OUTCOME: production_release=OK public_health=FAIL (exit 2)" >&2
  exit 2
fi

echo "[cloud-agent] OUTCOME: production_release=OK public_health=OK"
