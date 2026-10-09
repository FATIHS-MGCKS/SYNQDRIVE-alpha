#!/usr/bin/env bash
# VO5C deploy target + executor integrity admission (fail-closed).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

_VO5C_EXECUTOR_INTEGRITY_PATHS=(
  backend/scripts/ops/vps-deploy-release.sh
  backend/scripts/ops/lib/vps-vo5c-security-floor.lib.sh
  backend/scripts/ops/lib/vps-production-replica.lib.sh
  backend/scripts/ops/lib/vps-vo5c-deploy-admission.lib.sh
  backend/scripts/ops/lib/vps-vo5c-deploy-executor-selection.lib.sh
)

vps_vo5c_normalize_git_remote_url() {
  local url=$1
  url="${url%.git}"
  printf '%s' "$url"
}

vps_vo5c_trusted_git_remote_allowed() {
  local remote_url=$1
  local trusted="${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
  local norm_remote norm_trusted
  norm_remote="$(vps_vo5c_normalize_git_remote_url "$remote_url")"
  norm_trusted="$(vps_vo5c_normalize_git_remote_url "$trusted")"
  [[ "$norm_remote" == "$norm_trusted" ]] || [[ "$norm_remote" == file://* ]]
}

vps_vo5c_verify_release_git_provenance() {
  local release_dir=$1
  if ! git -C "$release_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    vps_vo5c_log "ABORT: deploy_target_not_git_worktree"
    return 1
  fi
  local remote_url
  remote_url="$(git -C "$release_dir" config --get remote.origin.url 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    vps_vo5c_log "ABORT: deploy_target_missing_origin_remote"
    return 1
  fi
  if ! vps_vo5c_trusted_git_remote_allowed "$remote_url"; then
    vps_vo5c_log "ABORT: deploy_target_untrusted_origin remote=${remote_url}"
    return 1
  fi
  return 0
}

vps_vo5c_assert_deploy_target_admitted() {
  local release_dir=$1
  local requested_sha=$2

  if ! declare -F vps_vo5c_require_rollback_guard_ready >/dev/null; then
    vps_vo5c_log "ABORT: deploy_target_admission_guard_missing"
    return 1
  fi
  vps_vo5c_require_rollback_guard_ready || return 1

  if [[ -z "$requested_sha" ]]; then
    vps_vo5c_log "ABORT: requested_deploy_sha_required"
    return 1
  fi
  if ! vps_vo5c_is_full_sha "$requested_sha"; then
    vps_vo5c_log "ABORT: requested_deploy_sha_invalid"
    return 1
  fi

  if ! vps_vo5c_verify_release_git_provenance "$release_dir"; then
    return 1
  fi

  if ! vps_vo5c_assert_release_rollback_eligible "$release_dir" "$requested_sha"; then
    vps_vo5c_log "ABORT: deploy_target_not_security_floor_eligible sha=${requested_sha}"
    return 1
  fi

  return 0
}

vps_vo5c_verify_executor_tree_integrity() {
  local executor_root=$1
  local expected_sha=$2
  local rel_path status_line

  if [[ -z "$executor_root" || ! -d "$executor_root" ]]; then
    vps_vo5c_log "ABORT: executor_integrity_root_missing"
    return 1
  fi
  if ! vps_vo5c_is_full_sha "$expected_sha"; then
    vps_vo5c_log "ABORT: executor_integrity_expected_sha_invalid"
    return 1
  fi
  if ! git -C "$executor_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    vps_vo5c_log "ABORT: executor_integrity_not_git_checkout"
    return 1
  fi

  local head_sha
  head_sha="$(git -C "$executor_root" rev-parse HEAD 2>/dev/null || true)"
  if [[ "$head_sha" != "$expected_sha" ]]; then
    vps_vo5c_log "ABORT: executor_integrity_head_mismatch expected=${expected_sha} actual=${head_sha:-unknown}"
    return 1
  fi

  if [[ -n "$(git -C "$executor_root" status --porcelain -- backend/scripts/ops 2>/dev/null)" ]]; then
    vps_vo5c_log "ABORT: executor_integrity_dirty_ops_tree"
    return 1
  fi

  while IFS= read -r status_line; do
    [[ -z "$status_line" ]] && continue
    rel_path="${status_line:3}"
    if [[ -x "${executor_root}/${rel_path}" ]]; then
      vps_vo5c_log "ABORT: executor_integrity_untracked_executable path=${rel_path}"
      return 1
    fi
  done < <(git -C "$executor_root" ls-files --others --exclude-standard -- backend/scripts/ops 2>/dev/null || true)

  local tracked
  for tracked in "${_VO5C_EXECUTOR_INTEGRITY_PATHS[@]}"; do
    if ! git -C "$executor_root" cat-file -e "HEAD:${tracked}" 2>/dev/null; then
      if [[ -e "${executor_root}/${tracked}" ]]; then
        vps_vo5c_log "ABORT: executor_integrity_untracked_replacement path=${tracked}"
        return 1
      fi
      continue
    fi
    if [[ ! -f "${executor_root}/${tracked}" ]]; then
      vps_vo5c_log "ABORT: executor_integrity_tracked_file_missing path=${tracked}"
      return 1
    fi
    if ! git -C "$executor_root" diff --quiet HEAD -- "$tracked" 2>/dev/null; then
      vps_vo5c_log "ABORT: executor_integrity_tracked_file_modified path=${tracked}"
      return 1
    fi
    if ! git -C "$executor_root" diff --cached --quiet HEAD -- "$tracked" 2>/dev/null; then
      vps_vo5c_log "ABORT: executor_integrity_tracked_file_staged path=${tracked}"
      return 1
    fi
    if ! cmp -s "${executor_root}/${tracked}" <(git -C "$executor_root" show "HEAD:${tracked}" 2>/dev/null); then
      vps_vo5c_log "ABORT: executor_integrity_worktree_differs_from_index path=${tracked}"
      return 1
    fi
  done

  return 0
}
