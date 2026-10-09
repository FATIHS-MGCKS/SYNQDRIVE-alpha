#!/usr/bin/env bash
# VO5C production security floor — rollback eligibility (fail-closed).
# Sourced by vps-production-replica.lib.sh and deploy tooling.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

if [[ -n "${_VO5C_SECURITY_FLOOR_LIB_LOADED:-}" ]]; then
  return 0
fi

# Immutable VO5C security-floor reference (P2B1 + P2B2 + P2B3 + P2B4-0). Not overridable.
readonly _VO5C_PINNED_SECURITY_FLOOR_SHA='39775cbb0cdc0addc7a71b26a39e2395c9f36c63'
readonly VO5C_UNSAFE_ROLLBACK_DENIED_CODE='VO5C_UNSAFE_ROLLBACK_DENIED'
_VO5C_SECURITY_FLOOR_LIB_LOADED=1

vps_vo5c_security_floor_sha() {
  printf '%s' "$_VO5C_PINNED_SECURITY_FLOOR_SHA"
}

vps_vo5c_log() {
  printf '[vo5c-security-floor] %s\n' "$*"
}

vps_vo5c_correlation_id() {
  if [[ -n "${SYNQDRIVE_DEPLOY_CORRELATION_ID:-}" ]]; then
    printf '%s' "${SYNQDRIVE_DEPLOY_CORRELATION_ID}"
    return 0
  fi
  date -u +%Y%m%dT%H:%M%SZ
}

vps_vo5c_emit_rollback_denied() {
  local reason=$1
  local target_sha=${2:-unknown}
  local current_sha=${3:-unknown}
  local corr
  corr="$(vps_vo5c_correlation_id)"
  vps_vo5c_log "code=${VO5C_UNSAFE_ROLLBACK_DENIED_CODE} reason=${reason} target_sha=${target_sha} current_sha=${current_sha} correlation_id=${corr}"
  return 1
}

vps_vo5c_require_rollback_guard_ready() {
  if ! declare -F vps_vo5c_assert_release_rollback_eligible >/dev/null; then
    vps_vo5c_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE} reason=rollback_guard_function_missing"
    return 1
  fi
  if ! declare -F vps_vo5c_security_floor_sha >/dev/null; then
    vps_vo5c_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE} reason=rollback_guard_incomplete"
    return 1
  fi
  local pinned observed
  pinned="$(vps_vo5c_security_floor_sha)"
  if [[ "$pinned" != "$_VO5C_PINNED_SECURITY_FLOOR_SHA" ]]; then
    vps_vo5c_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE} reason=security_floor_tamper_detected"
    return 1
  fi
  return 0
}

vps_vo5c_load_authority_from_ops_dir() {
  local ops_dir=$1
  local lib="${ops_dir}/lib/vps-vo5c-security-floor.lib.sh"
  if [[ ! -f "$lib" ]]; then
    vps_vo5c_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE} reason=rollback_authority_library_missing path=${lib}"
    return 1
  fi
  # shellcheck disable=SC1090
  if ! source "$lib"; then
    vps_vo5c_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE} reason=rollback_authority_library_load_failed"
    return 1
  fi
  vps_vo5c_require_rollback_guard_ready
}

vps_vo5c_is_full_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

vps_vo5c_release_head_sha() {
  local release_dir=$1
  git -C "$release_dir" rev-parse HEAD 2>/dev/null || echo ""
}

vps_vo5c_ensure_git_object() {
  local release_dir=$1
  local object=$2
  if git -C "$release_dir" cat-file -e "${object}^{commit}" 2>/dev/null; then
    return 0
  fi

  local remote_url
  remote_url="$(git -C "$release_dir" config --get remote.origin.url 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    remote_url="${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
    git -C "$release_dir" remote add origin "$remote_url" 2>/dev/null \
      || git -C "$release_dir" remote set-url origin "$remote_url" 2>/dev/null \
      || true
  fi

  if ! git -C "$release_dir" fetch --depth=1 origin "${object}" 2>/dev/null; then
    if ! git -C "$release_dir" fetch --depth=32 origin "${object}" 2>/dev/null; then
      return 1
    fi
  fi

  git -C "$release_dir" cat-file -e "${object}^{commit}" 2>/dev/null
}

vps_vo5c_verify_ancestry_includes_floor() {
  local release_dir=$1
  local candidate_sha=$2
  local floor_sha
  floor_sha="$(vps_vo5c_security_floor_sha)"

  if ! vps_vo5c_is_full_sha "$candidate_sha" || ! vps_vo5c_is_full_sha "$floor_sha"; then
    return 1
  fi

  if ! vps_vo5c_ensure_git_object "$release_dir" "$floor_sha"; then
    return 2
  fi
  if ! vps_vo5c_ensure_git_object "$release_dir" "$candidate_sha"; then
    return 1
  fi

  if git -C "$release_dir" merge-base --is-ancestor "$floor_sha" "$candidate_sha" 2>/dev/null; then
    return 0
  fi
  return 1
}

vps_vo5c_verify_protection_markers() {
  local release_dir=$1
  local backend_root="${release_dir}/backend"
  if [[ ! -d "$backend_root" ]]; then
    return 1
  fi

  local search_roots=()
  if [[ -d "${backend_root}/dist/src" ]]; then
    search_roots+=("${backend_root}/dist/src")
  fi
  search_roots+=("${backend_root}/src")

  local root
  for root in "${search_roots[@]}"; do
    if grep -rq "LEGACY_VEHICLE_DESTRUCTION_DISABLED" "$root" 2>/dev/null \
      && grep -rq "PLATFORM_PRUNE_DISABLED" "$root" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

vps_vo5c_assert_release_rollback_eligible() {
  local release_dir=$1
  local claimed_sha=${2:-}

  if ! vps_vo5c_require_rollback_guard_ready; then
    return 1
  fi

  if [[ -z "$release_dir" || ! -d "$release_dir" ]]; then
    vps_vo5c_emit_rollback_denied "missing_release_directory" "${claimed_sha:-unknown}" \
      "$(vps_vo5c_release_head_sha "${release_dir:-/nonexistent}" 2>/dev/null || echo unknown)"
    return 1
  fi

  local head_sha
  head_sha="$(vps_vo5c_release_head_sha "$release_dir")"
  if [[ -z "$head_sha" ]]; then
    vps_vo5c_emit_rollback_denied "release_not_a_git_checkout" "${claimed_sha:-unknown}" "unknown"
    return 1
  fi

  if [[ -n "$claimed_sha" ]]; then
    if ! vps_vo5c_is_full_sha "$claimed_sha"; then
      vps_vo5c_emit_rollback_denied "invalid_claimed_sha" "$claimed_sha" "$head_sha"
      return 1
    fi
    if [[ "$head_sha" != "$claimed_sha" ]]; then
      vps_vo5c_emit_rollback_denied "release_head_mismatch" "$claimed_sha" "$head_sha"
      return 1
    fi
  else
    claimed_sha="$head_sha"
  fi

  local ancestry_rc=0
  vps_vo5c_verify_ancestry_includes_floor "$release_dir" "$claimed_sha" || ancestry_rc=$?
  if [[ "$ancestry_rc" -eq 2 ]]; then
    vps_vo5c_emit_rollback_denied "shallow_history_unresolved_floor_object" "$claimed_sha" "$head_sha"
    return 1
  fi
  if [[ "$ancestry_rc" -ne 0 ]]; then
    vps_vo5c_emit_rollback_denied "security_floor_ancestry_missing" "$claimed_sha" "$head_sha"
    return 1
  fi

  if ! vps_vo5c_verify_protection_markers "$release_dir"; then
    vps_vo5c_emit_rollback_denied "vo5c_protection_markers_missing" "$claimed_sha" "$head_sha"
    return 1
  fi

  return 0
}

vps_vo5c_pm2_dump_resurrect_permitted() {
  # Fail-closed: PM2 dump resurrect disabled during VO5C security-floor era.
  vps_vo5c_log "PM2 dump resurrect disabled — use forward recovery (VO5C security floor)"
  return 1
}

vps_vo5c_validate_pm2_dump_paths() {
  local dump_file=$1
  local eligible_release_dir=$2
  local eligible_sha=$3

  if [[ ! -f "$dump_file" ]]; then
    return 1
  fi

  local unsafe_patterns=(
    "3b557e208c1a06e91c0a13fb8ba861b1255ee375"
    "54fc704fb50c285c68470d8fa274d72a67438482"
    "/releases/20261008182454"
    "/releases/20261008001031"
  )

  local content
  content="$(cat "$dump_file" 2>/dev/null || true)"
  local pattern
  for pattern in "${unsafe_patterns[@]}"; do
    if [[ "$content" == *"$pattern"* ]]; then
      vps_vo5c_emit_rollback_denied "pm2_dump_unsafe_release_reference" "$eligible_sha" "$(basename "$eligible_release_dir")"
      return 1
    fi
  done

  if [[ -n "$eligible_release_dir" && "$content" != *"$eligible_release_dir"* ]]; then
    vps_vo5c_emit_rollback_denied "pm2_dump_release_path_mismatch" "$eligible_sha" "$(basename "$eligible_release_dir")"
    return 1
  fi

  return 0
}

vps_vo5c_assert_pm2_dump_restore_allowed() {
  local release_dir=$1
  local target_sha=$2
  local dump_file=${3:-}

  if ! vps_vo5c_assert_release_rollback_eligible "$release_dir" "$target_sha"; then
    return 1
  fi
  if ! vps_vo5c_pm2_dump_resurrect_permitted; then
    return 1
  fi
  if [[ -n "$dump_file" ]]; then
    vps_vo5c_validate_pm2_dump_paths "$dump_file" "$release_dir" "$target_sha"
  fi
  return 1
}

vps_vo5c_log_unsafe_rollback_containment() {
  local phase=$1
  vps_vo5c_log "CONTAINMENT phase=${phase} action=do_not_auto_revert_to_pre_vo5c_release manual=forward_fix_or_redeploy_security_floor correlation_id=$(vps_vo5c_correlation_id)"
}
