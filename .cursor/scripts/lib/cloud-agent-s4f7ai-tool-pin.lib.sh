#!/usr/bin/env bash
# EXP-021 S4F-7AI — S4F-7AH tool-pin authority (fail-closed; no Production side effects).
set -euo pipefail

# shellcheck source=cloud-agent-s4f7aa-tool-pin.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cloud-agent-s4f7aa-tool-pin.lib.sh"

# Immutable certified operator tool commit (PR #1930 exact head @ S4F-7AH seal).
S4F7AI_CERTIFIED_TOOL_SHA='ed78748bc9493cdc8da56000e333e4940114f9f1'

# Git blob IDs @ S4F7AI_CERTIFIED_TOOL_SHA (must match EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md).
S4F7AI_OPERATOR_PATHS=(
  'backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh'
  'backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh'
  'backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-production.lib.sh'
  'backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-production-cli.ts'
  'backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib.ts'
  'backend/scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-poststate.lib.ts'
)

S4F7AI_OPERATOR_GIT_BLOBS=(
  '2949f4e0138fca4d2e1ace6528e858671c9f1a0f'
  '46f40f440f331fc08299111769d47a097eb1c63c'
  '758167d5b91006f12e4445ac0d952325cef4282a'
  '66c1e168626b2a6f11d9ea6f86a239fc5c058f55'
  '32517acc32b5dd30ff8765598662d4cf17abe964'
  'b5bfab1f86badaf72f497f05b3f223308c942f7f'
)

S4F7AI_OPERATOR_CONTENT_SHA256=(
  'd9cbbc81f3de80e7b13e241a108a03d78ed316be946c52ebe81f11c571d93947'
  '5f1e66e901177579f9644df1cab610d9774396b65eaf08b8fa6b158a8ad09f73'
  'f2712676244ea684d83f0785d6f443ce1d0d6958fc5020784c749d042a885557'
  '6d43c55adee10de9e6d1648d6a03db1816d40469e28d0db373db6f2045f0d719'
  'e8731adaf525c596876d9716cf932133434f294f8b697bbba2496197399d5d73'
  '6cb07b51084e99d5b5906cac0e375553c5f3033fa7b237525a24917085102c1c'
)

S4F7AI_SHARED_OPS_PATHS=(
  'backend/scripts/ops/vps-production-replica-topology.config.sh'
  'backend/scripts/ops/lib/di-v0-s4-tiny-staging-production.lib.sh'
  'backend/scripts/ops/lib/vps-production-replica.lib.sh'
  'backend/scripts/ops/lib/di-v0-s4f-global-budget-rollout.lib.sh'
  'backend/scripts/ops/lib/di-v0-s4-global-kill-init-production.lib.sh'
)

s4f7ai_read_sealed_tool_sha_from_evidence() {
  local evidence_path="$1"
  if [[ ! -f "$evidence_path" ]]; then
    echo "S4F7AI_FAIL_CLOSED=S4F7AH_EVIDENCE_MISSING" >&2
    return 1
  fi
  local -a rows=()
  while IFS= read -r line; do
    rows+=("$line")
  done < <(grep -E '^\| \*\*`NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA`\*\*' "$evidence_path" || true)
  if ((${#rows[@]} != 1)); then
    echo "S4F7AI_FAIL_CLOSED=SEAL_FIELD_COUNT_${#rows[@]}" >&2
    return 1
  fi
  local sealed
  sealed="$(printf '%s\n' "${rows[0]}" | sed -n 's/.*`\([0-9a-f]\{40\}\)`.*/\1/p' | tail -n 1)"
  if [[ -z "$sealed" ]] || ! [[ "$sealed" =~ ^[0-9a-f]{40}$ ]]; then
    echo "S4F7AI_FAIL_CLOSED=SEAL_FIELD_UNREADABLE" >&2
    return 1
  fi
  printf '%s' "$sealed"
}

s4f7ai_assert_certified_tool_sha() {
  local sha="$1"
  if [[ "$sha" != "$S4F7AI_CERTIFIED_TOOL_SHA" ]]; then
    echo "S4F7AI_FAIL_CLOSED=CERTIFIED_TOOL_SHA_MISMATCH" >&2
    echo "EXPECTED=${S4F7AI_CERTIFIED_TOOL_SHA}" >&2
    echo "GOT=${sha}" >&2
    return 1
  fi
  return 0
}

s4f7ai_ensure_tool_commit_available() {
  local sha="$1"
  local repo_root="$2"
  local git_remote_url="${3:-}"
  if git -C "$repo_root" cat-file -e "${sha}^{commit}" 2>/dev/null; then
    return 0
  fi
  if [[ -z "$git_remote_url" ]]; then
    echo "S4F7AI_FAIL_CLOSED=TOOL_COMMIT_NOT_FETCHABLE" >&2
    return 1
  fi
  if ! git -C "$repo_root" fetch --depth 1 origin "$sha" 2>/dev/null; then
    echo "S4F7AI_FAIL_CLOSED=TOOL_COMMIT_FETCH_FAILED" >&2
    return 1
  fi
  if ! git -C "$repo_root" cat-file -e "${sha}^{commit}" 2>/dev/null; then
    echo "S4F7AI_FAIL_CLOSED=TOOL_COMMIT_NOT_FETCHABLE" >&2
    return 1
  fi
  return 0
}

s4f7ai_verify_six_file_blob_parity_at_commit() {
  local sha="$1"
  local repo_root="$2"
  local i path expected_blob actual_blob expected_sha256 actual_sha256
  for i in "${!S4F7AI_OPERATOR_PATHS[@]}"; do
    path="${S4F7AI_OPERATOR_PATHS[$i]}"
    expected_blob="${S4F7AI_OPERATOR_GIT_BLOBS[$i]}"
    expected_sha256="${S4F7AI_OPERATOR_CONTENT_SHA256[$i]}"
    if ! actual_blob="$(git -C "$repo_root" rev-parse "${sha}:${path}" 2>/dev/null)"; then
      echo "S4F7AI_FAIL_CLOSED=OPERATOR_PATH_MISSING:${path}" >&2
      return 1
    fi
    if [[ "$actual_blob" != "$expected_blob" ]]; then
      echo "S4F7AI_FAIL_CLOSED=GIT_BLOB_MISMATCH:${path}" >&2
      echo "EXPECTED_BLOB=${expected_blob}" >&2
      echo "ACTUAL_BLOB=${actual_blob}" >&2
      return 1
    fi
    actual_sha256="$(git -C "$repo_root" cat-file -p "$actual_blob" | sha256sum | awk '{print $1}')"
    if [[ "$actual_sha256" != "$expected_sha256" ]]; then
      echo "S4F7AI_FAIL_CLOSED=CONTENT_SHA256_MISMATCH:${path}" >&2
      return 1
    fi
  done
  return 0
}

s4f7ai_verify_shared_ops_present_at_commit() {
  local sha="$1"
  local repo_root="$2"
  local path
  for path in "${S4F7AI_SHARED_OPS_PATHS[@]}"; do
    if ! git -C "$repo_root" cat-file -e "${sha}:${path}" 2>/dev/null; then
      echo "S4F7AI_FAIL_CLOSED=SHARED_OPS_MISSING:${path}" >&2
      return 1
    fi
  done
  return 0
}

s4f7ai_verify_detached_checkout() {
  local repo_root="$1"
  local git_remote_url="$2"
  local tool_sha="$3"
  local temp
  temp="$(mktemp -d)"
  trap 'rm -rf "${temp:-}"' RETURN
  git init "$temp/repo" >/dev/null 2>&1
  git -C "$temp/repo" remote add origin "$git_remote_url"
  if ! git -C "$temp/repo" fetch --depth 1 origin "$tool_sha" 2>/dev/null; then
    echo "S4F7AI_FAIL_CLOSED=DETACHED_FETCH_FAILED" >&2
    return 1
  fi
  git -C "$temp/repo" checkout --detach FETCH_HEAD >/dev/null
  local head
  head="$(git -C "$temp/repo" rev-parse HEAD)"
  if [[ "$head" != "$tool_sha" ]]; then
    echo "S4F7AI_FAIL_CLOSED=DETACHED_HEAD_MISMATCH" >&2
    return 1
  fi
  if [[ -n "$(git -C "$temp/repo" status --porcelain)" ]]; then
    echo "S4F7AI_FAIL_CLOSED=DETACHED_CHECKOUT_NOT_CLEAN" >&2
    return 1
  fi
  s4f7ai_verify_six_file_blob_parity_at_commit "$tool_sha" "$temp/repo"
}

s4f7ai_verify_db_clock_operator_paths() {
  local repo_root="$1"
  local tool_sha="$2"
  git -C "$repo_root" show "${tool_sha}:backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-production.lib.sh" | grep -q 's4f7v_export_db_clock_canonical_utc_fail_closed' || {
    echo "S4F7AI_FAIL_CLOSED=DB_CLOCK_HELPER_MISSING_PROD_LIB" >&2
    return 1
  }
  git -C "$repo_root" show "${tool_sha}:backend/scripts/ops/lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh" | grep -q 's4f7v_run_validate_fresh_authority_fail_closed' || {
    echo "S4F7AI_FAIL_CLOSED=VALIDATOR_HELPER_MISSING_TXN_LIB" >&2
    return 1
  }
  git -C "$repo_root" show "${tool_sha}:backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh" | grep -q 's4f7v_export_db_clock_canonical_utc_fail_closed' || {
    echo "S4F7AI_FAIL_CLOSED=DB_CLOCK_HELPER_MISSING_WRAPPER" >&2
    return 1
  }
  return 0
}

s4f7ai_resolve_tool_sha_for_dispatch() {
  local evidence_path="$1"
  local repo_root="$2"
  local git_remote_url="${3:-}"
  local sealed
  sealed="$(s4f7ai_read_sealed_tool_sha_from_evidence "$evidence_path")"
  s4f7ai_assert_certified_tool_sha "$sealed"
  s4f7ai_ensure_tool_commit_available "$sealed" "$repo_root" "$git_remote_url"
  if ! s4f7aa_collect_stale_tool_pin_violations "$sealed" >/dev/null; then
    echo "S4F7AI_FAIL_CLOSED=STALE_TOOL_PIN_ENV" >&2
    s4f7aa_collect_stale_tool_pin_violations "$sealed" >&2 || true
    return 1
  fi
  s4f7aa_clear_tool_pin_env
  s4f7ai_verify_six_file_blob_parity_at_commit "$sealed" "$repo_root"
  s4f7ai_verify_shared_ops_present_at_commit "$sealed" "$repo_root"
  s4f7ai_verify_db_clock_operator_paths "$repo_root" "$sealed"
  printf '%s' "$sealed"
}

s4f7ai_assert_local_dispatch_guards() {
  if [[ "${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}" == "YES" ]]; then
    echo "S4F7AI_FAIL_CLOSED=LIVE_STAGING_AUTH_FORBIDDEN_LOCAL" >&2
    return 1
  fi
  if [[ "${DRY_RUN:-}" == "0" ]]; then
    echo "S4F7AI_FAIL_CLOSED=DRY_RUN_ZERO_FORBIDDEN_LOCAL" >&2
    return 1
  fi
  return 0
}

s4f7ai_bootstrap_script_identity() {
  local bootstrap_path="$1"
  s4f7aa_bootstrap_script_identity "$bootstrap_path"
}
