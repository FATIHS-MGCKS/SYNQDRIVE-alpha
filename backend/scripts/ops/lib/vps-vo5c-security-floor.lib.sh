#!/usr/bin/env bash
# VO5C production security floor — rollback eligibility (fail-closed).
# Sourced by vps-production-replica.lib.sh and deploy tooling.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Canonical VO5C security-floor reference (P2B1 + P2B2 + P2B3 + P2B4-0).
VO5C_SECURITY_FLOOR_SHA="${VO5C_SECURITY_FLOOR_SHA:-39775cbb0cdc0addc7a71b26a39e2395c9f36c63}"
VO5C_UNSAFE_ROLLBACK_DENIED_CODE="${VO5C_UNSAFE_ROLLBACK_DENIED_CODE:-VO5C_UNSAFE_ROLLBACK_DENIED}"

VO5C_PRODUCTION_OLD_SHA="${VO5C_PRODUCTION_OLD_SHA:-3b557e208c1a06e91c0a13fb8ba861b1255ee375}"
VO5C_KNOWN_UNSAFE_ROLLBACK_SHA="${VO5C_KNOWN_UNSAFE_ROLLBACK_SHA:-54fc704fb50c285c68470d8fa274d72a67438482}"

vps_vo5c_log() {
  printf '[vo5c-security-floor] %s\n' "$*"
}

vps_vo5c_correlation_id() {
  if [[ -n "${SYNQDRIVE_DEPLOY_CORRELATION_ID:-}" ]]; then
    printf '%s' "${SYNQDRIVE_DEPLOY_CORRELATION_ID}"
    return 0
  fi
  date -u +%Y%m%dT%H%M%SZ
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

  # Bounded shallow fetch — read-only provenance recovery for deploy clones.
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
  local floor_sha="${VO5C_SECURITY_FLOOR_SHA}"

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

# Returns 0 when release_dir is eligible for production rollback/promotion fallback.
vps_vo5c_assert_release_rollback_eligible() {
  local release_dir=$1
  local claimed_sha=${2:-}

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

vps_vo5c_assert_pm2_dump_restore_allowed() {
  local release_dir=$1
  local target_sha=$2
  vps_vo5c_assert_release_rollback_eligible "$release_dir" "$target_sha"
}

vps_vo5c_log_unsafe_rollback_containment() {
  local phase=$1
  vps_vo5c_log "CONTAINMENT phase=${phase} action=do_not_auto_revert_to_pre_vo5c_release manual=forward_fix_or_redeploy_security_floor correlation_id=$(vps_vo5c_correlation_id)"
}
