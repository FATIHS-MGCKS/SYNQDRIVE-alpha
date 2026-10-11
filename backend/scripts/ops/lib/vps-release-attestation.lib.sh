#!/usr/bin/env bash
# P4B16 — Minimal durable deployed-release SHA record (library only; not wired in deploy scripts yet).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

VPS_ATTESTATION_STATE_DIR="${VPS_ATTESTATION_STATE_DIR:-${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}}"
VPS_ATTESTATION_STATE_FILE="${VPS_ATTESTATION_STATE_FILE:-release-attestation.state}"
VPS_ATTESTATION_LOCK_FILE="${VPS_ATTESTATION_LOCK_FILE:-.attestation.lock}"
VPS_ATTESTATION_CHECKSUM_FILE="${VPS_ATTESTATION_CHECKSUM_FILE:-release-attestation.state.sha256}"
# Offline selftests only (both required; never set in production):
#   VPS_ATTESTATION_OFFLINE_SELFTEST=1 VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
# Selftests: VPS_ATTESTATION_CRASH_HOOK=before_state_write|after_mirror
VPS_ATTESTATION_CRASH_HOOK="${VPS_ATTESTATION_CRASH_HOOK:-}"

VPS_ATTEST_LOCK_FD=9
_VPS_ATTEST_LOCK_HELD=0

vps_attest_log() {
  printf '[release-attestation] %s\n' "$*" >&2
}

vps_attest_fail() {
  vps_attest_log "ABORT: $*"
  return 1
}

vps_attest_validate_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

vps_attest_normalize_sha() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

vps_attest_state_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_STATE_FILE}"
}

vps_attest_lock_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_LOCK_FILE}"
}

vps_attest_checksum_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_CHECKSUM_FILE}"
}

vps_attest_ensure_state_dir() {
  local dir="${VPS_ATTESTATION_STATE_DIR}"
  if [[ -L "$dir" ]]; then
    vps_attest_fail "state dir must not be a symlink: ${dir}"
    return 1
  fi
  if ! mkdir -p "$dir"; then
    vps_attest_fail "cannot create state dir: ${dir}"
    return 1
  fi
  chmod 750 "$dir" 2>/dev/null || true
}

vps_attest_safe_regular_file() {
  local path=$1
  local label=${2:-path}
  [[ -n "$path" ]] || { vps_attest_fail "${label} empty"; return 1; }
  [[ -L "$path" ]] && { vps_attest_fail "${label} must not be a symlink: ${path}"; return 1; }
  [[ -e "$path" && ! -f "$path" ]] && { vps_attest_fail "${label} must be a regular file: ${path}"; return 1; }
  return 0
}

vps_attest_fsync_file() {
  local f=$1
  [[ -f "$f" ]] || return 0
  if ! sync -f "$f" 2>/dev/null; then
    vps_attest_fail "fsync failed: ${f}"
    return 1
  fi
  return 0
}

vps_attest_fsync_dir() {
  local d=$1
  [[ -d "$d" ]] || return 0
  if ! sync -f "$d" 2>/dev/null; then
    vps_attest_fail "fsync dir failed: ${d}"
    return 1
  fi
  return 0
}

vps_attest_crash_hook() {
  local point=$1
  if [[ "${VPS_ATTESTATION_CRASH_HOOK:-}" == "$point" ]]; then
    vps_attest_log "CRASH_HOOK=${point}"
    exit 99
  fi
}

vps_attest_lock_acquire() {
  vps_attest_ensure_state_dir || return 1
  local lock
  lock="$(vps_attest_lock_path)"
  eval "exec ${VPS_ATTEST_LOCK_FD}>\"${lock}\""
  if ! flock -n "${VPS_ATTEST_LOCK_FD}"; then
    vps_attest_fail "attestation lock busy: ${lock}"
    return 1
  fi
  _VPS_ATTEST_LOCK_HELD=1
  return 0
}

vps_attest_lock_release() {
  if [[ "${_VPS_ATTEST_LOCK_HELD}" == "1" ]]; then
    flock -u "${VPS_ATTEST_LOCK_FD}" 2>/dev/null || true
    _VPS_ATTEST_LOCK_HELD=0
  fi
}

vps_attest_require_lock_held() {
  if [[ "${_VPS_ATTEST_LOCK_HELD}" != "1" ]]; then
    vps_attest_fail "attestation lock required for write"
    return 1
  fi
  return 0
}

vps_attest_verify_skip_allowed() {
  [[ "${VPS_ATTESTATION_OFFLINE_SELFTEST:-}" == "1" && "${VPS_ATTESTATION_SKIP_REPLICA_VERIFY:-}" == "1" ]]
}

vps_attest_last_recorded_deployed_sha() {
  if ! vps_attest_state_verify_checksum 2>/dev/null; then
    echo ""
    return 0
  fi
  local s
  s="$(vps_attest_state_read_kv DEPLOYED_SHA)"
  if vps_attest_validate_sha "$s" 2>/dev/null; then
    vps_attest_normalize_sha "$s"
  else
    echo ""
  fi
}

vps_attest_state_read_kv() {
  local key=$1
  local spath
  spath="$(vps_attest_state_path)"
  [[ -f "$spath" ]] || return 0
  grep -m1 "^${key}=" "$spath" 2>/dev/null | cut -d= -f2- || true
  return 0
}

vps_attest_state_body_checksum() {
  local body=$1
  printf '%s' "$body" | sha256sum | awk '{print $1}'
}

vps_attest_state_write_checksum_sidecar() {
  local body=$1
  local cpath sum
  cpath="$(vps_attest_checksum_path)"
  sum="$(vps_attest_state_body_checksum "$body")"
  printf '%s\n' "$sum" >"${cpath}.tmp" || return 1
  vps_attest_fsync_file "${cpath}.tmp" || return 1
  mv -f "${cpath}.tmp" "$cpath" || return 1
  chmod 640 "$cpath" 2>/dev/null || true
  vps_attest_fsync_dir "$(dirname "$cpath")" || return 1
}

vps_attest_state_verify_checksum() {
  local spath
  spath="$(vps_attest_state_path)"
  [[ -f "$spath" ]] || return 1
  local cpath expected actual body
  cpath="$(vps_attest_checksum_path)"
  [[ -f "$cpath" ]] || return 1
  expected="$(tr -d '\n' <"$cpath")"
  body="$(cat "$spath")"
  actual="$(vps_attest_state_body_checksum "$body")"
  [[ "$expected" == "$actual" ]]
}

vps_attest_state_write_atomic() {
  local body=$1
  vps_attest_ensure_state_dir || return 1
  local spath tmp parent
  spath="$(vps_attest_state_path)"
  parent="$(dirname "$spath")"
  tmp="${spath}.tmp.$$"
  printf '%s' "$body" >"$tmp" || return 1
  chmod 640 "$tmp" 2>/dev/null || true
  vps_attest_fsync_file "$tmp" || { rm -f "$tmp"; return 1; }
  mv -f "$tmp" "$spath" || { rm -f "$tmp"; return 1; }
  vps_attest_fsync_dir "$parent" || return 1
  vps_attest_state_write_checksum_sidecar "$body" || return 1
}

vps_attest_next_generation() {
  local cur
  cur="$(vps_attest_state_read_kv GENERATION)"
  if [[ -z "$cur" ]]; then
    echo 1
  else
    echo $((cur + 1))
  fi
}

vps_attest_build_state_body() {
  # STATUS GENERATION DEPLOYED_SHA PREVIOUS_SHA UPDATED_AT
  local status=$1 gen=$2 deployed=$3 prev=$4
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat <<EOF
STATUS=${status}
GENERATION=${gen}
DEPLOYED_SHA=${deployed}
PREVIOUS_SHA=${prev}
UPDATED_AT=${ts}
EOF
}

# Mandatory: both-replica deploy verification via existing ops library (when present).
vps_attest_require_replica_verify() {
  local release_dir=$1
  local target_sha=$2
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"

  if vps_attest_verify_skip_allowed; then
    vps_attest_log "offline selftest: skipping replica verify"
    return 0
  fi
  if [[ "${VPS_ATTESTATION_SKIP_REPLICA_VERIFY:-}" == "1" ]]; then
    vps_attest_fail "SKIP_REPLICA_VERIFY without OFFLINE_SELFTEST is not allowed"
    return 1
  fi
  if ! declare -f vps_replica_verify_post_deploy >/dev/null 2>&1; then
    vps_attest_fail "vps_replica_verify_post_deploy unavailable — cannot record deploy"
    return 1
  fi
  vps_replica_verify_post_deploy "$release_dir" "$target_sha"
}

vps_attest_reader_is_committed() {
  vps_attest_state_verify_checksum || return 1
  local st
  st="$(vps_attest_state_read_kv STATUS)"
  [[ "$st" == "COMMITTED" || "$st" == "ROLLED_BACK" ]] || return 1
  vps_attest_validate_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)"
}

vps_attest_reader_committed_sha() {
  vps_attest_reader_is_committed || return 1
  vps_attest_state_read_kv DEPLOYED_SHA
}

# After successful vps_replica_verify_post_deploy: mirror legacy env, then one COMMITTED state write.
vps_attest_record_deploy_success() {
  local release_dir=$1
  local target_sha=$2

  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"

  vps_attest_require_replica_verify "$release_dir" "$target_sha" || return 1

  local cur last
  last="$(vps_attest_last_recorded_deployed_sha)"
  if vps_attest_reader_is_committed 2>/dev/null; then
    cur="$(vps_attest_normalize_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)")"
    if [[ "$cur" == "$target_sha" ]]; then
      return 0
    fi
  fi

  local gen prev body
  gen="$(vps_attest_next_generation)"
  prev="${last}"

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  vps_attest_crash_hook before_mirror
  if ! vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$target_sha"; then
    body="$(vps_attest_build_state_body FAILED "$gen" "$last" "$prev")"
    vps_attest_state_write_atomic "$body" || true
    return 1
  fi
  vps_attest_crash_hook after_mirror

  body="$(vps_attest_build_state_body COMMITTED "$gen" "$target_sha" "$prev")"
  vps_attest_crash_hook before_state_write
  vps_attest_state_write_atomic "$body"
}

vps_attest_record_deploy_failure() {
  local target_sha=${1:-}
  vps_attest_require_lock_held || return 1
  local gen prev deployed body
  gen="$(vps_attest_next_generation)"
  deployed="$(vps_attest_last_recorded_deployed_sha)"
  deployed="${deployed:-}"
  prev="$(vps_attest_state_read_kv PREVIOUS_SHA)"
  prev="${prev:-}"
  if [[ -n "$target_sha" ]]; then
    vps_attest_validate_sha "$target_sha" || return 1
    target_sha="$(vps_attest_normalize_sha "$target_sha")"
  else
    target_sha=""
  fi
  body="$(vps_attest_build_state_body FAILED "$gen" "$deployed" "$prev")"
  vps_attest_state_write_atomic "$body"
}

# Idempotent completion when mirror succeeded but state write crashed (STATUS != COMMITTED).
vps_attest_resume_incomplete_deploy() {
  local release_dir=$1
  local target_sha=$2
  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"
  vps_attest_require_replica_verify "$release_dir" "$target_sha" || return 1
  if vps_attest_reader_is_committed 2>/dev/null; then
    local cur
    cur="$(vps_attest_normalize_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)")"
    [[ "$cur" == "$target_sha" ]] || return 1
    return 0
  fi
  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  local mirrored
  mirrored="$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV:-}" 2>/dev/null || true)"
  mirrored="$(vps_attest_normalize_sha "${mirrored:-}")"
  if [[ "$mirrored" != "$target_sha" ]]; then
    vps_attest_fail "resume rejected: mirror SHA mismatch"
    return 1
  fi
  local gen prev body last
  gen="$(vps_attest_state_read_kv GENERATION)"
  [[ -n "$gen" ]] || gen="$(vps_attest_next_generation)"
  last="$(vps_attest_last_recorded_deployed_sha)"
  prev="${last}"
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$target_sha" "$prev")"
  vps_attest_state_write_atomic "$body"
}

vps_attest_record_rollback_success() {
  local release_dir=$1
  local previous_sha=$2
  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$previous_sha" || return 1
  previous_sha="$(vps_attest_normalize_sha "$previous_sha")"
  vps_attest_require_replica_verify "$release_dir" "$previous_sha" || return 1

  local gen cur body last
  last="$(vps_attest_last_recorded_deployed_sha)"
  cur="${last}"
  gen="$(vps_attest_next_generation)"

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  if ! vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$previous_sha"; then
    body="$(vps_attest_build_state_body COMMITTED "$gen" "$cur" "$(vps_attest_state_read_kv PREVIOUS_SHA)")"
    vps_attest_state_write_atomic "$body" || true
    return 1
  fi
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$previous_sha" "$cur")"
  vps_attest_state_write_atomic "$body"
}

vps_attest_record_rollback_denied() {
  vps_attest_require_lock_held || return 1
  local gen cur prev body
  gen="$(vps_attest_next_generation)"
  cur="$(vps_attest_state_read_kv DEPLOYED_SHA)"
  prev="$(vps_attest_state_read_kv PREVIOUS_SHA)"
  cur="${cur:-}"
  # Fail-closed: do not publish ROLLED_BACK or change DEPLOYED_SHA on denied rollback.
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$cur" "$prev")"
  vps_attest_state_write_atomic "$body"
}

vps_attest_reader_is_rolled_back() {
  vps_attest_state_verify_checksum || return 1
  [[ "$(vps_attest_state_read_kv STATUS)" == "ROLLED_BACK" ]]
}
