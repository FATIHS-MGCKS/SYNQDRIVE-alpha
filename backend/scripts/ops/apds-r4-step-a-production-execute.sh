#!/usr/bin/env bash
# APDS R4 Step A — authorized two-pin alignment + controlled PM2 restart (production).
set -euo pipefail

AUTHORIZED_SHA="${APDS_R4_AUTHORIZED_RUNTIME_SHA:-ab72f574014d6657cac158c253696b7237cdd3e6}"
EXPECTED_PRE_PIN="${APDS_R4_EXPECTED_CURRENT_PIN:-3b557e208c1a06e91c0a13fb8ba861b1255ee375}"
BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
EVIDENCE_DIR="${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}/apds-r4-step-a"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "${OPS_DIR}/vps-production-replica-topology.config.sh" ]]; then
  OPS_DIR="${SYNQDRIVE_OPS_DIR:-/opt/synqdrive/current/backend/scripts/ops}"
fi
# shellcheck source=vps-production-replica-topology.config.sh
source "${OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${OPS_DIR}/lib/vps-production-replica.lib.sh"
# shellcheck source=lib/di-v0-s4f-global-budget-rollout.lib.sh
source "${OPS_DIR}/lib/di-v0-s4f-global-budget-rollout.lib.sh"

mkdir -p "$EVIDENCE_DIR"
EVIDENCE_FILE="${EVIDENCE_DIR}/execution-${TS}.evidence.log"

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$EVIDENCE_FILE"
}

env_pin() {
  local key=$1
  grep -m1 "^${key}=" "$BACKEND_ENV" | cut -d= -f2- | tr -d '\r'
}

replica_git_sha() {
  local name=$1
  local pid
  pid="$(vps_replica_pm2_pid "$name")"
  local cwd
  cwd="$(readlink -f "/proc/${pid}/cwd")"
  git -C "$(dirname "$cwd")" rev-parse HEAD
}

phase1_gate() {
  log "PHASE1 owner_authorization=EXPLICITLY_GRANTED exp021_freeze_release=OWNER_CONFIRMED"
  log "PHASE1 authorized_scope=two_pin_alignment_only authorized_sha=${AUTHORIZED_SHA}"

  local sha_a sha_b cur_link
  sha_a="$(replica_git_sha "${SYNQDRIVE_REPLICA_A_PM2_NAME}")"
  sha_b="$(replica_git_sha "${SYNQDRIVE_REPLICA_B_PM2_NAME}")"
  cur_link="$(readlink -f "${SYNQDRIVE_CURRENT_LINK}")"
  log "PHASE1 runtime_sha_a=${sha_a} runtime_sha_b=${sha_b} current_link=${cur_link}"

  if [[ "$sha_a" != "$AUTHORIZED_SHA" || "$sha_b" != "$AUTHORIZED_SHA" ]]; then
    log "PHASE1 FAIL runtime_sha_mismatch"
    return 1
  fi

  local pre_approved pre_deployed exp021_deploy
  pre_approved="$(env_pin APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA)"
  pre_deployed="$(env_pin SYNQDRIVE_DEPLOYED_GIT_SHA)"
  exp021_deploy="$(env_pin SYNQDRIVE_DEPLOY_GIT_SHA)"
  log "PHASE1 pre_approved_pin_prefix=${pre_approved:0:12} pre_deployed_pin_prefix=${pre_deployed:0:12}"
  log "PHASE1 exp021_deploy_git_sha_prefix=${exp021_deploy:0:12} (must remain unchanged)"

  if [[ "$pre_approved" != "$EXPECTED_PRE_PIN" || "$pre_deployed" != "$EXPECTED_PRE_PIN" ]]; then
    log "PHASE1 FAIL pre_pin_mismatch"
    return 1
  fi

  export S4F4_EXP021_DEPLOY_GIT_SHA_BEFORE="$exp021_deploy"

  if ! curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" | grep -q '"status":"ok"'; then
    log "PHASE1 FAIL external_health"
    return 1
  fi
  for port in "${SYNQDRIVE_REPLICA_A_PORT}" "${SYNQDRIVE_REPLICA_B_PORT}"; do
    if ! vps_replica_curl_health_ok "$port" || ! vps_replica_curl_readiness_ok "$port"; then
      log "PHASE1 FAIL replica_health port=${port}"
      return 1
    fi
  done

  local leaders
  leaders="$(vps_replica_count_scheduler_leaders)"
  log "PHASE1 scheduler_leader_count=${leaders}"
  if [[ "$leaders" != "1" ]]; then
    log "PHASE1 FAIL scheduler_leader_count"
    return 1
  fi

  local disk_pct
  disk_pct="$(df / | tail -1 | awk '{print $5}' | tr -d '%')"
  log "PHASE1 disk_use_percent=${disk_pct}"
  if [[ "$disk_pct" -gt 92 ]]; then
    log "PHASE1 FAIL disk_space"
    return 1
  fi

  if ! sudo -u postgres psql -d synqdrive -tA -c "SELECT 1" >/dev/null 2>&1; then
    log "PHASE1 FAIL postgres"
    return 1
  fi
  if ! redis-cli PING 2>/dev/null | grep -q PONG; then
    log "PHASE1 FAIL redis"
    return 1
  fi

  local epoch_state epoch_t0 epoch_fp
  epoch_state="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT lifecycle_state FROM apd_shadow_activation_epochs WHERE id='cf6d91ec-5e57-401c-ae21-c4ec9dabad25';")"
  epoch_t0="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM apd_shadow_activation_epochs WHERE id='cf6d91ec-5e57-401c-ae21-c4ec9dabad25';")"
  epoch_fp="$(sudo -u postgres psql -d synqdrive -tA -c "SELECT cohort_config_fingerprint_sha256 FROM apd_shadow_activation_epochs WHERE id='cf6d91ec-5e57-401c-ae21-c4ec9dabad25';")"
  log "PHASE1 epoch_state=${epoch_state} epoch_t0=${epoch_t0} cohort_fp_prefix=${epoch_fp:0:16}"
  if [[ "$epoch_state" != "ACTIVE" ]]; then
    log "PHASE1 FAIL epoch_not_active"
    return 1
  fi
  export S4F4_STEP_A_EPOCH_FP="$epoch_fp"

  local shadow_enabled
  shadow_enabled="$(env_pin WORKER_APD_SHADOW_ENABLED)"
  if [[ "$shadow_enabled" != "true" ]]; then
    log "PHASE1 FAIL shadow_not_enabled"
    return 1
  fi

  log "PHASE1 PASS"
  return 0
}

phase2_backup() {
  local backup_file="${EVIDENCE_DIR}/backend.env.${TS}.bak"
  log "PHASE2 backup_path=${backup_file}"
  if ! s4f4_create_verified_backend_env_backup "$BACKEND_ENV" "$backup_file" | tee -a "$EVIDENCE_FILE"; then
    return 1
  fi
  chmod 600 "$backup_file"
  chown root:root "$backup_file" 2>/dev/null || true
  export S4F4_STEP_A_BACKUP_FILE="$backup_file"
  export S4F4_STEP_A_BACKUP_SHA256="$(s4f4_file_sha256 "$backup_file")"
  log "PHASE2 PASS backup_sha256=${S4F4_STEP_A_BACKUP_SHA256}"
}

phase3_two_pin() {
  local before_sha exp021_before
  before_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  exp021_before="$(env_pin SYNQDRIVE_DEPLOY_GIT_SHA)"
  s4f4_env_file_metadata "$BACKEND_ENV"

  local tmp
  tmp="$(s4f4_same_dir_temp "$BACKEND_ENV")"
  python3 - "$BACKEND_ENV" "$tmp" "$AUTHORIZED_SHA" <<'PY'
import sys
src, dst, new_sha = sys.argv[1], sys.argv[2], sys.argv[3]
keys = {
    "SYNQDRIVE_DEPLOYED_GIT_SHA": new_sha,
    "APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA": new_sha,
}
seen = {k: 0 for k in keys}
out = []
with open(src, "rb") as f:
    data = f.read()
lines = data.splitlines(keepends=True)
for line in lines:
    if b"\n" in line or line.endswith(b"\r\n"):
        pass
    stripped = line.rstrip(b"\r\n")
    if b"=" in stripped:
        k = stripped.split(b"=", 1)[0].decode("ascii", "strict")
        if k in keys:
            seen[k] += 1
            out.append(f"{k}={keys[k]}".encode() + (b"\r\n" if line.endswith(b"\r\n") else b"\n"))
            continue
    out.append(line)
for k, c in seen.items():
    if c != 1:
        raise SystemExit(f"key_count_invalid:{k}:{c}")
with open(dst, "wb") as f:
    f.write(b"".join(out))
PY

  chmod "${S4F4_ENV_META_MODE:-600}" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  if [[ -n "${S4F4_ENV_META_UID:-}" && -n "${S4F4_ENV_META_GID:-}" ]]; then
    chown "${S4F4_ENV_META_UID}:${S4F4_ENV_META_GID}" "$tmp"
  elif [[ -n "${S4F4_ENV_META_OWNER:-}" ]]; then
    chown "${S4F4_ENV_META_OWNER}" "$tmp" 2>/dev/null || true
  fi

  local other_before other_after
  other_before="$(grep -vE '^(SYNQDRIVE_DEPLOYED_GIT_SHA|APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA)=' "$BACKEND_ENV" | sha256sum | awk '{print $1}')"
  other_after="$(grep -vE '^(SYNQDRIVE_DEPLOYED_GIT_SHA|APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA)=' "$tmp" | sha256sum | awk '{print $1}')"
  if [[ "$other_before" != "$other_after" ]]; then
    log "PHASE3 FAIL unexpected_env_changes other_sha_before=${other_before} other_sha_after=${other_after}"
    rm -f "$tmp"
    return 1
  fi
  log "PHASE3 two_key_only_diff_verified=YES"

  s4f4_atomic_promote_env_file "$tmp" "$BACKEND_ENV" apds-r4-step-a-two-pin
  local after_sha
  after_sha="$(s4f4_file_sha256 "$BACKEND_ENV")"
  log "PHASE3 backend_env_sha256_before=${before_sha} after=${after_sha}"

  local post_approved post_deployed exp021_after
  post_approved="$(env_pin APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA)"
  post_deployed="$(env_pin SYNQDRIVE_DEPLOYED_GIT_SHA)"
  exp021_after="$(env_pin SYNQDRIVE_DEPLOY_GIT_SHA)"
  if [[ "$post_approved" != "$AUTHORIZED_SHA" || "$post_deployed" != "$AUTHORIZED_SHA" ]]; then
    log "PHASE3 FAIL post_pin_mismatch — rolling back"
    s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$S4F4_STEP_A_BACKUP_FILE" "$S4F4_STEP_A_BACKUP_SHA256" | tee -a "$EVIDENCE_FILE"
    return 1
  fi
  if [[ "$exp021_after" != "$exp021_before" ]]; then
    log "PHASE3 FAIL exp021_deploy_git_sha_changed — rolling back"
    s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$S4F4_STEP_A_BACKUP_FILE" "$S4F4_STEP_A_BACKUP_SHA256" | tee -a "$EVIDENCE_FILE"
    return 1
  fi
  log "PHASE3 PASS exp021_deploy_git_sha_unchanged=YES"
}

phase4_restart() {
  local pid_a_before pid_b_before
  pid_a_before="$(vps_replica_pm2_pid "${SYNQDRIVE_REPLICA_A_PM2_NAME}")"
  pid_b_before="$(vps_replica_pm2_pid "${SYNQDRIVE_REPLICA_B_PM2_NAME}")"
  log "PHASE4 pre_pid_a=${pid_a_before} pre_pid_b=${pid_b_before}"

  if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then
    return 1
  fi
  if ! vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$AUTHORIZED_SHA"; then
    return 1
  fi
  log "PHASE4 replica_a_restart=PASS sha=$(replica_git_sha "${SYNQDRIVE_REPLICA_A_PM2_NAME}")"

  if ! vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
    return 1
  fi
  if ! vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$AUTHORIZED_SHA"; then
    return 1
  fi
  log "PHASE4 replica_b_restart=PASS sha=$(replica_git_sha "${SYNQDRIVE_REPLICA_B_PM2_NAME}")"

  if ! vps_replica_wait_scheduler_leader_convergence; then
    return 1
  fi
  if ! vps_replica_verify_scheduler_leaders 1; then
    return 1
  fi
  log "PHASE4 scheduler_convergence=PASS"
}

rollback_full() {
  log "ROLLBACK initiating"
  if [[ -z "${S4F4_STEP_A_BACKUP_FILE:-}" ]]; then
    log "ROLLBACK FAIL no_backup"
    return 1
  fi
  if ! s4f4_restore_backend_env_atomic "$BACKEND_ENV" "$S4F4_STEP_A_BACKUP_FILE" "$S4F4_STEP_A_BACKUP_SHA256" | tee -a "$EVIDENCE_FILE"; then
    return 1
  fi
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || true
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$AUTHORIZED_SHA" || true
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || true
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$AUTHORIZED_SHA" || true
  vps_replica_wait_scheduler_leader_convergence || true
  log "ROLLBACK complete"
}

main() {
  if ! phase1_gate; then
    echo "STEP_A_RESULT=FAIL_PHASE1"
    exit 1
  fi
  if ! phase2_backup; then
    echo "STEP_A_RESULT=FAIL_PHASE2"
    exit 1
  fi
  if ! phase3_two_pin; then
    echo "STEP_A_RESULT=FAIL_PHASE3"
    exit 1
  fi
  if ! phase4_restart; then
    rollback_full || true
    echo "STEP_A_RESULT=FAIL_PHASE4_ROLLBACK_ATTEMPTED"
    exit 1
  fi
  echo "STEP_A_RESULT=SUCCESS"
  log "PHASE6 certification complete — see evidence file"
}

main "$@"
