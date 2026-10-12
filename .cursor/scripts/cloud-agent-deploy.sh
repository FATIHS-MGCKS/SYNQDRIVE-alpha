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

  1. source ${PIN_ENV_FILE}
  2. Create a short-lived session file (example):
       sudo install -m 600 /dev/null ${OPERATOR_SESSION_FILE}
       sudo tee ${OPERATOR_SESSION_FILE} <<SESS
SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
AUTHORIZED_REQUESTED_SHA=${sha}
AUTHORIZED_UNTIL_EPOCH=\$(date -u -d '+30 minutes' +%s)
SESS
  3. Or export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 in the same sudo shell and run the pinned runner manually:
       export SYNQDRIVE_REQUESTED_DEPLOY_SHA=${sha}
       cd "\${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops"
       bash vps-vo5c-run-pinned-security-deploy.sh

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

  if [[ -n "${CLOUD_AGENT_VPS_DEPLOY_SCRIPT:-}" ]] && [[ "${CLOUD_AGENT_VPS_DEPLOY_SCRIPT}" != *"vps-vo5c-run-pinned-security-deploy.sh"* ]]; then
    echo "[cloud-agent] ERROR: CLOUD_AGENT_VPS_DEPLOY_SCRIPT override to legacy vps-deploy-release.sh is blocked (DSRG consolidation)." >&2
    echo "[cloud-agent] Unset CLOUD_AGENT_VPS_DEPLOY_SCRIPT or point at the pinned runner." >&2
    exit 1
  fi

  echo "[cloud-agent] Delegating to VO5C pinned runner on ${SSH_USER}@${VPS_HOST} ..."
  echo "[cloud-agent] REQUESTED_DEPLOY_SHA=${requested_sha}"

  # Remote: enforcement check, optional operator session, pinned runner (fail-closed without human auth).
  local remote_inner
  remote_inner="$(cat <<REMOTE_EOF
set -euo pipefail
REQUESTED_SHA='${requested_sha}'
PIN_ENV='${PIN_ENV_FILE}'
SESSION_FILE='${OPERATOR_SESSION_FILE}'
AUTH=/opt/synqdrive/shared/vo5c-production-deploy-authority.env
ARMED=/opt/synqdrive/shared/vo5c-production-deploy-enforcement-armed
if [[ -L "\$AUTH" ]] && [[ ! -e "\$AUTH" ]]; then echo 'ABORT: VO5C production deploy authority dangling symlink'; exit 1; fi
if [[ ! -e "\$AUTH" ]]; then
  if [[ -f "\$ARMED" ]]; then echo 'ABORT: VO5C production deploy authority missing after armed stamp'; exit 1; fi
else
  if [[ ! -r "\$AUTH" ]] || [[ ! -f "\$AUTH" ]]; then echo 'ABORT: VO5C production deploy authority file unreadable'; exit 1; fi
  set -a
  if ! source "\$AUTH"; then echo 'ABORT: VO5C production deploy authority file malformed'; exit 1; fi
  set +a
  case "\${VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE:-}" in 0|1) ;; *) echo 'ABORT: VO5C production deploy authority invalid active flag'; exit 1 ;; esac
  if [[ "\${VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE}" == "1" ]]; then
    echo 'ABORT: VO5C production deploy enforcement active — legacy shallow-fetch deploy is blocked.'
    exit 1
  fi
fi
if [[ ! -f "\$PIN_ENV" ]]; then echo "ABORT: missing pin env \$PIN_ENV"; exit 1; fi
set -a
source "\$PIN_ENV"
set +a
export SYNQDRIVE_REQUESTED_DEPLOY_SHA="\$REQUESTED_SHA"
export SYNQDRIVE_STAGED_RELEASE_ROOT="\${SYNQDRIVE_STAGED_RELEASE_ROOT:-/opt/synqdrive/staging-release}"
if [[ -d "\$SYNQDRIVE_STAGED_RELEASE_ROOT/.git" ]]; then
  git -C "\$SYNQDRIVE_STAGED_RELEASE_ROOT" fetch --depth 1 origin "\$REQUESTED_SHA" 2>/dev/null || true
  git -C "\$SYNQDRIVE_STAGED_RELEASE_ROOT" checkout -q "\$REQUESTED_SHA" 2>/dev/null || true
fi
if [[ -f "\$SESSION_FILE" ]] && [[ -r "\$SESSION_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "\$SESSION_FILE"
  set +a
  now_epoch=\$(date -u +%s)
  if [[ -n "\${AUTHORIZED_UNTIL_EPOCH:-}" ]] && [[ "\$now_epoch" -gt "\${AUTHORIZED_UNTIL_EPOCH}" ]]; then
    echo 'ABORT: operator deploy session expired — recreate vo5c-operator-deploy-session.env on VPS'
    exit 1
  fi
  if [[ -n "\${AUTHORIZED_REQUESTED_SHA:-}" ]] && [[ "\${AUTHORIZED_REQUESTED_SHA}" != "\$REQUESTED_SHA" ]]; then
    echo 'ABORT: operator session SHA does not match REQUESTED_DEPLOY_SHA'
    exit 1
  fi
fi
if [[ "\${SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED:-0}" != "1" ]]; then
  echo 'ABORT: SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 not set (human release authorization required)'
  exit 42
fi
PINNED_OPS="\${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops"
cd "\$PINNED_OPS"
exec bash "\${PINNED_OPS}/vps-vo5c-run-pinned-security-deploy.sh"
REMOTE_EOF
)"

  local remote_cmd="bash -c $(printf '%q' "$remote_inner")"
  if [[ "${SSH_USER}" != "root" ]]; then
    remote_cmd="sudo -n -H bash -c $(printf '%q' "$remote_inner")"
  fi

  set +e
  ssh -p "$SSH_PORT" -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=20 \
    "${SSH_USER}@${VPS_HOST}" "$remote_cmd"
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

  echo "[cloud-agent] WARN: public health check failed after ${attempts} attempts (app may still be healthy on VPS replicas)." >&2
  return 1
}

bash "${ROOT}/.cursor/scripts/cloud-agent-verify-vps.sh"
ensure_ssh_key
preflight_git
run_remote_pinned_deploy

HEALTH_RC=0
if ! verify_public_health; then
  HEALTH_RC=1
fi

if [[ "$HEALTH_RC" -ne 0 ]]; then
  echo "[cloud-agent] OUTCOME: pinned_deploy=OK public_health=FAIL (exit 2) — verify replicas before declaring release complete." >&2
  exit 2
fi

echo "[cloud-agent] OUTCOME: pinned_deploy=OK public_health=OK"
