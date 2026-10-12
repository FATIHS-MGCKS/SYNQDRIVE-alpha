#!/usr/bin/env bash
# SynqDrive production deploy delegate — VO5C pinned runner only (single VPS).
# Does NOT set SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 (human gate on VPS session file or operator shell).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-mein-vps.internal}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
# shellcheck source=lib/cloud-agent-vo5c-operator-session.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-vo5c-operator-session.lib.sh"

SSH_USER="$(cloud_agent_ssh_user)"
if [[ "${VPS_HOST}" == *"hstgr.cloud"* ]] && [[ "${SSH_USER}" == "root" ]]; then
  SSH_USER="synqdrive-admin"
fi
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
SSH_KEY="${HOME}/.ssh/id_ed25519"
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

ensure_ssh_key() {
  if [[ -f "$SSH_KEY" ]]; then
    return 0
  fi
  if ! cloud_agent_materialize_ssh_key "$SSH_KEY"; then
    echo "[cloud-agent] ERROR: SSH key missing. Set CLOUD_AGENT_SSH_PRIVATE_KEY in Cursor Dashboard → Secrets." >&2
    exit 1
  fi
  ssh-keyscan -H "$VPS_HOST" >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
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

  echo "[cloud-agent] Delegating to VO5C pinned runner on ${SSH_USER}@${VPS_HOST} ..."
  echo "[cloud-agent] REQUESTED_DEPLOY_SHA=${requested_sha}"

  local q_sha q_pin q_sess q_staged
  q_sha="$(printf '%q' "$requested_sha")"
  q_pin="$(printf '%q' "$PIN_ENV_FILE")"
  q_sess="$(printf '%q' "$OPERATOR_SESSION_FILE")"
  q_staged="$(printf '%q' "$STAGED_RELEASE_ROOT")"

  local remote_body
  remote_body="$(printf '%s\n' \
    "td=\$(mktemp -d)" \
    "trap 'rm -rf \"\$td\"' EXIT" \
    "tar -xzf - -C \"\$td\"" \
    "export REMOTE_LIB_DIR=\"\$td/lib\"" \
    "exec bash \"\$td/cloud-agent-vo5c-remote-pinned-deploy.sh\" ${q_sha} ${q_pin} ${q_sess} ${q_staged}")"

  local ssh_prefix=(ssh -p "$SSH_PORT" -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=20 "${SSH_USER}@${VPS_HOST}")
  local remote_shell
  if [[ "${SSH_USER}" == "root" ]]; then
    remote_shell="bash -c $(printf '%q' "$remote_body")"
  else
    remote_shell="sudo -n -H bash -c $(printf '%q' "$remote_body")"
  fi

  set +e
  tar -C "${SCRIPT_DIR}" -czf - \
    lib/cloud-agent-vo5c-operator-session.lib.sh \
    lib/cloud-agent-vo5c-remote-pinned-deploy.lib.sh \
    cloud-agent-vo5c-remote-pinned-deploy.sh \
    | "${ssh_prefix[@]}" "$remote_shell"
  local remote_rc=$?
  set -e

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
