#!/usr/bin/env bash
# Multi-replica production deploy helpers — sourced by vps-deploy-release.sh / rollback.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

vps_replica_log() {
  printf '[%s] [multi-replica] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

vps_replica_pm2_exists() {
  local name=$1
  pm2 describe "$name" >/dev/null 2>&1
}

vps_replica_port_listening() {
  local port=$1
  ss -tlnp 2>/dev/null | grep -q ":${port} " || ss -tlnp 2>/dev/null | grep -q ":${port}\b"
}

vps_replica_release_sha() {
  local release_dir=$1
  git -C "$release_dir" rev-parse HEAD 2>/dev/null || echo ""
}

vps_replica_current_release_dir() {
  readlink -f "${SYNQDRIVE_CURRENT_LINK}" 2>/dev/null || echo ""
}

vps_replica_current_sha() {
  local dir
  dir="$(vps_replica_current_release_dir)"
  if [[ -z "$dir" ]]; then
    echo ""
    return 0
  fi
  vps_replica_release_sha "$dir"
}

vps_replica_curl_health_ok() {
  local port=$1
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health" 2>/dev/null || true)
  [[ -n "$body" ]] && echo "$body" | grep -q '"status":"ok"'
}

vps_replica_curl_readiness_ok() {
  local port=$1
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)
  [[ -n "$body" ]] && echo "$body" | grep -q '"status":"ok"'
}

vps_replica_readiness_role() {
  local port=$1
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)
  if [[ -z "$body" ]]; then
    echo "UNREACHABLE"
    return 0
  fi
  printf '%s' "$body" | node -e '
    let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
      try{const j=JSON.parse(d); console.log(j.checks?.schedulerLeader?.details?.role||"UNKNOWN")}catch{console.log("UNREACHABLE")}
    })'
}

vps_replica_pm2_uptime_sec() {
  local name=$1
  pm2 jlist 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{
        const apps=JSON.parse(d);
        const app=apps.find(x=>x.name==='${name}');
        const ms=app?.pm2_env?.pm_uptime;
        if(!ms){console.log(-1);return}
        console.log(Math.floor((Date.now()-ms)/1000));
      }catch{console.log(-1)}
    })"
}

vps_replica_pm2_pid() {
  local name=$1
  pm2 jlist 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{
        const apps=JSON.parse(d);
        const app=apps.find(x=>x.name==='${name}');
        console.log(app?.pid||0);
      }catch{console.log(0)}
    })"
}

vps_replica_ecosystem_path() {
  echo "${SYNQDRIVE_CURRENT_LINK}/backend/scripts/ops/pm2.production-ecosystem.config.cjs"
}

vps_replica_ensure_registered() {
  local ecosystem
  ecosystem="$(vps_replica_ecosystem_path)"
  if [[ ! -f "$ecosystem" ]]; then
    vps_replica_log "ABORT: missing PM2 ecosystem ${ecosystem}"
    return 1
  fi

  if ! vps_replica_pm2_exists "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then
    vps_replica_log "Starting primary ${SYNQDRIVE_REPLICA_A_PM2_NAME}"
    pm2 start "$ecosystem" --only "${SYNQDRIVE_REPLICA_A_PM2_NAME}" --update-env
  fi

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_pm2_exists "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
      vps_replica_log "Starting secondary ${SYNQDRIVE_REPLICA_B_PM2_NAME}"
      pm2 start "$ecosystem" --only "${SYNQDRIVE_REPLICA_B_PM2_NAME}" --update-env
    fi
  fi
  return 0
}

vps_replica_restart_one() {
  local name=$1
  local ecosystem
  ecosystem="$(vps_replica_ecosystem_path)"
  vps_replica_log "Restarting ${name}"
  if vps_replica_pm2_exists "$name"; then
    pm2 restart "$ecosystem" --only "$name" --update-env
  else
    pm2 start "$ecosystem" --only "$name" --update-env
  fi
}

vps_replica_wait_healthy() {
  local name=$1
  local port=$2
  local target_sha=$3
  local attempt=0
  local max_attempts="${SYNQDRIVE_REPLICA_HEALTH_RETRIES}"
  local delay="${SYNQDRIVE_REPLICA_HEALTH_DELAY_SEC}"

  while [[ "$attempt" -lt "$max_attempts" ]]; do
    attempt=$((attempt + 1))
    local pid uptime current_sha health_ok readiness_ok listening
    pid="$(vps_replica_pm2_pid "$name")"
    uptime="$(vps_replica_pm2_uptime_sec "$name")"
    current_sha="$(vps_replica_current_sha)"
    listening=false
    health_ok=false
    readiness_ok=false

    if vps_replica_port_listening "$port"; then listening=true; fi
    if vps_replica_curl_health_ok "$port"; then health_ok=true; fi
    if vps_replica_curl_readiness_ok "$port"; then readiness_ok=true; fi

    local sha_ok=false
    if [[ -n "$target_sha" && "$current_sha" == "$target_sha" ]]; then
      sha_ok=true
    fi

    vps_replica_log "verify ${name} attempt=${attempt} pid=${pid} port=${port} listen=${listening} health=${health_ok} ready=${readiness_ok} sha=${sha_ok} uptime=${uptime}s"

    if [[ "$pid" != "0" ]] && [[ "$listening" == true ]] && [[ "$health_ok" == true ]] && [[ "$readiness_ok" == true ]] && [[ "$sha_ok" == true ]]; then
      return 0
    fi

    sleep "$delay"
  done

  vps_replica_log "ABORT: ${name} failed health verification on port ${port}"
  return 1
}

vps_replica_verify_scheduler_leaders() {
  local expected=${1:-1}
  local role_a role_b leader_count=0
  role_a="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_A_PORT}")"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    role_b="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_B_PORT}")"
  else
    role_b="N/A"
  fi

  [[ "$role_a" == "LEADER" ]] && leader_count=$((leader_count + 1))
  [[ "$role_b" == "LEADER" ]] && leader_count=$((leader_count + 1))

  vps_replica_log "scheduler roles A=${role_a} B=${role_b} leaders=${leader_count}"

  if [[ "$leader_count" -ne "$expected" ]]; then
    vps_replica_log "ABORT: expected ${expected} scheduler leader(s), got ${leader_count}"
    return 1
  fi
  return 0
}

vps_replica_nginx_dual_upstream_ok() {
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -lt 2 ]]; then
    return 0
  fi
  if [[ ! -f "${SYNQDRIVE_NGINX_SITE}" ]]; then
    vps_replica_log "WARN: nginx site missing ${SYNQDRIVE_NGINX_SITE}"
    return 1
  fi
  local text
  text="$(cat "${SYNQDRIVE_NGINX_SITE}")"
  if echo "$text" | grep -q 'upstream synqdrive_backend' \
    && echo "$text" | grep -q '127.0.0.1:3001' \
    && echo "$text" | grep -q '127.0.0.1:3002'; then
    return 0
  fi
  vps_replica_log "ABORT: nginx missing dual upstream synqdrive_backend (3001+3002)"
  return 1
}

vps_replica_verify_no_mixed_sha() {
  local target_sha=$1
  local current_sha
  current_sha="$(vps_replica_current_sha)"
  if [[ "$current_sha" != "$target_sha" ]]; then
    vps_replica_log "ABORT: current symlink SHA ${current_sha} != target ${target_sha}"
    return 1
  fi

  # Both replicas share current symlink; verify each restarted recently (no stale in-memory old build).
  local names=("${SYNQDRIVE_REPLICA_A_PM2_NAME}")
  local ports=("${SYNQDRIVE_REPLICA_A_PORT}")
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    names+=("${SYNQDRIVE_REPLICA_B_PM2_NAME}")
    ports+=("${SYNQDRIVE_REPLICA_B_PORT}")
  fi

  local i
  for i in "${!names[@]}"; do
    local name=${names[$i]}
    local port=${ports[$i]}
    if ! vps_replica_pm2_exists "$name"; then
      vps_replica_log "ABORT: required replica ${name} not registered in PM2"
      return 1
    fi
    if ! vps_replica_port_listening "$port"; then
      vps_replica_log "ABORT: ${name} port ${port} not listening"
      return 1
    fi
    if ! vps_replica_curl_health_ok "$port"; then
      vps_replica_log "ABORT: ${name} health failed on port ${port}"
      return 1
    fi
    if ! vps_replica_curl_readiness_ok "$port"; then
      vps_replica_log "ABORT: ${name} readiness failed on port ${port}"
      return 1
    fi
    local uptime
    uptime="$(vps_replica_pm2_uptime_sec "$name")"
    if [[ "$uptime" -lt 0 ]] || [[ "$uptime" -gt "${SYNQDRIVE_MAX_UPTIME_AFTER_DEPLOY_SEC}" ]]; then
      vps_replica_log "ABORT: ${name} uptime ${uptime}s suggests process was not restarted for this deploy"
      return 1
    fi
  done

  vps_replica_log "SHA invariant OK: all replicas on ${target_sha}"
  return 0
}

vps_replica_capture_deploy_state() {
  local state_file=$1
  mkdir -p "$(dirname "$state_file")"
  local previous_current previous_sha
  previous_current="$(vps_replica_current_release_dir)"
  previous_sha="$(vps_replica_current_sha)"
  local pm2_dump="${SYNQDRIVE_DEPLOY_STATE_DIR}/pm2-pre-deploy-$(date -u +%Y%m%d%H%M%S).dump"
  pm2 save
  cp /root/.pm2/dump.pm2 "$pm2_dump" 2>/dev/null || true

  cat >"$state_file" <<EOF
PREVIOUS_CURRENT_RELEASE=${previous_current}
PREVIOUS_SHA=${previous_sha}
CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PM2_DUMP=${pm2_dump}
NGINX_SITE=${SYNQDRIVE_NGINX_SITE}
REPLICA_COUNT=${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}
EOF
  vps_replica_log "Captured deploy state → ${state_file} (previous=${previous_sha:0:12})"
}

vps_replica_rolling_deploy() {
  local release_dir=$1
  local target_sha=$2

  cd "${SYNQDRIVE_CURRENT_LINK}/backend"

  vps_replica_ensure_registered || return 1

  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  fi

  pm2 save
  return 0
}

vps_replica_verify_post_deploy() {
  local release_dir=$1
  local target_sha=$2

  vps_replica_verify_no_mixed_sha "$target_sha" || return 1
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1

  if [[ -n "${SYNQDRIVE_EXTERNAL_HEALTH_URL:-}" ]]; then
    if curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" >/dev/null 2>&1; then
      vps_replica_log "External health PASS ${SYNQDRIVE_EXTERNAL_HEALTH_URL}"
    else
      vps_replica_log "ABORT: external health failed ${SYNQDRIVE_EXTERNAL_HEALTH_URL}"
      return 1
    fi
  fi

  pm2 list
  return 0
}

vps_replica_rollback() {
  local state_file=$1
  if [[ ! -f "$state_file" ]]; then
    vps_replica_log "ABORT: rollback state file missing: ${state_file}"
    return 1
  fi

  # shellcheck disable=SC1090
  source "$state_file"

  if [[ -z "${PREVIOUS_CURRENT_RELEASE:-}" ]] || [[ ! -d "${PREVIOUS_CURRENT_RELEASE}" ]]; then
    vps_replica_log "ABORT: previous release dir invalid: ${PREVIOUS_CURRENT_RELEASE:-}"
    return 1
  fi

  vps_replica_log "ROLLBACK: restoring ${PREVIOUS_CURRENT_RELEASE}"
  ln -sfn "${PREVIOUS_CURRENT_RELEASE}" "${SYNQDRIVE_CURRENT_LINK}"

  local previous_sha
  previous_sha="$(vps_replica_release_sha "${PREVIOUS_CURRENT_RELEASE}")"

  vps_replica_rolling_deploy "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha" || {
    vps_replica_log "ROLLBACK WARN: rolling restart failed — attempting PM2 dump restore"
    if [[ -n "${PM2_DUMP:-}" && -f "${PM2_DUMP}" ]]; then
      cp "${PM2_DUMP}" /root/.pm2/dump.pm2
      pm2 resurrect || true
    fi
    return 1
  }

  vps_replica_verify_post_deploy "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha" || return 1
  vps_replica_log "ROLLBACK complete → ${previous_sha:0:12}"
  return 0
}
