#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-mein-vps.internal}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"
SSH_USER="$(cloud_agent_ssh_user)"
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
SSH_KEY="${HOME}/.ssh/id_ed25519"
DEPLOY_SCRIPT="${CLOUD_AGENT_VPS_DEPLOY_SCRIPT:-/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh}"
HEALTH_URL="${CLOUD_AGENT_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
GIT_REMOTE="${CLOUD_AGENT_GIT_REMOTE:-origin}"
GIT_BRANCH="${CLOUD_AGENT_GIT_BRANCH:-main}"

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
    return 0
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[cloud-agent] WARN: not a git worktree — skipping git preflight." >&2
    return 0
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[cloud-agent] ERROR: uncommitted changes detected. Commit (or stash) before deploy." >&2
    git status --short
    exit 1
  fi

  git fetch "$GIT_REMOTE" "$GIT_BRANCH" --quiet || {
    echo "[cloud-agent] WARN: could not fetch ${GIT_REMOTE}/${GIT_BRANCH}; continuing anyway." >&2
    return 0
  }

  LOCAL_HEAD="$(git rev-parse HEAD)"
  REMOTE_HEAD="$(git rev-parse "${GIT_REMOTE}/${GIT_BRANCH}")"
  if [[ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]]; then
    echo "[cloud-agent] ERROR: local HEAD (${LOCAL_HEAD:0:7}) != ${GIT_REMOTE}/${GIT_BRANCH} (${REMOTE_HEAD:0:7})." >&2
    echo "[cloud-agent] Push to ${GIT_REMOTE} before deploy — VPS clones from GitHub ${GIT_BRANCH}." >&2
    exit 1
  fi

  echo "[cloud-agent] Git preflight OK: ${LOCAL_HEAD:0:7} on ${GIT_REMOTE}/${GIT_BRANCH}."
}

run_remote_deploy() {
  echo "[cloud-agent] Deploying via SSH ${SSH_USER}@${VPS_HOST}:${SSH_PORT} ..."
  ssh -p "$SSH_PORT" -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=20 \
    "${SSH_USER}@${VPS_HOST}" "bash ${DEPLOY_SCRIPT}"
}

verify_health() {
  local attempts="${CLOUD_AGENT_HEALTH_RETRIES:-5}"
  local delay="${CLOUD_AGENT_HEALTH_DELAY_SEC:-3}"

  echo "[cloud-agent] Verifying ${HEALTH_URL} ..."
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

bash "${ROOT}/.cursor/scripts/cloud-agent-verify-vps.sh"
ensure_ssh_key
preflight_git
run_remote_deploy
verify_health || true

echo "[cloud-agent] Deploy finished."
