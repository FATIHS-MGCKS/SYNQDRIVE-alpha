#!/usr/bin/env bash
# P4B16 — Runtime identity contract (library interfaces only; no HTTP endpoint in R1A).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Immutable release manifest (written at promote time in a future integration phase).
VPS_RUNTIME_MANIFEST_BASENAME="${VPS_RUNTIME_MANIFEST_BASENAME:-.synqdrive-release-manifest.json}"

vps_runtime_identity_manifest_path() {
  local release_dir=$1
  echo "${release_dir}/${VPS_RUNTIME_MANIFEST_BASENAME}"
}

vps_runtime_identity_validate_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

vps_runtime_identity_normalize_sha() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# Returns gitSha from manifest JSON (jq-free: minimal grep/sed for selftests).
vps_runtime_identity_read_manifest_git_sha() {
  local manifest_path=$1
  [[ -f "$manifest_path" ]] || return 1
  [[ -L "$manifest_path" ]] && return 1
  local raw
  raw="$(grep -Eo '"gitSha"[[:space:]]*:[[:space:]]*"[0-9a-fA-F]{40}"' "$manifest_path" | head -n 1)"
  [[ -n "$raw" ]] || return 1
  sed -n 's/.*"\([0-9a-fA-F]\{40\}\)".*/\1/p' <<<"$raw" | tr '[:upper:]' '[:lower:]'
}

vps_runtime_identity_write_fixture_manifest() {
  local release_dir=$1
  local git_sha=$2
  local release_id=${3:-selftest}
  local mpath
  mpath="$(vps_runtime_identity_manifest_path "$release_dir")"
  mkdir -p "$release_dir"
  cat >"$mpath" <<EOF
{
  "gitSha": "$(vps_runtime_identity_normalize_sha "$git_sha")",
  "releaseId": "${release_id}",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  chmod 640 "$mpath" 2>/dev/null || true
}

# Contract: observed replica SHA must match expected; manifest is authoritative over backend.env.
vps_runtime_identity_assert_replica_match() {
  local expected_sha=$1
  local manifest_path=$2
  vps_runtime_identity_validate_sha "$expected_sha" || return 1
  expected_sha="$(vps_runtime_identity_normalize_sha "$expected_sha")"
  local observed
  observed="$(vps_runtime_identity_read_manifest_git_sha "$manifest_path")" || return 1
  [[ "$observed" == "$expected_sha" ]]
}

# Reader helper for attestation publish gate (future deploy hook).
vps_runtime_identity_collect_replica_shas() {
  # Args: manifest_path_a manifest_path_b — prints "a:b" lowercased SHAs or fails.
  local ma=$1 mb=$2 oa ob
  oa="$(vps_runtime_identity_read_manifest_git_sha "$ma")" || return 1
  ob="$(vps_runtime_identity_read_manifest_git_sha "$mb")" || return 1
  printf '%s:%s' "$oa" "$ob"
}

vps_runtime_identity_attestation_ready() {
  local target_sha=$1
  local manifest_a=$2
  local manifest_b=$3
  vps_runtime_identity_assert_replica_match "$target_sha" "$manifest_a" || return 1
  vps_runtime_identity_assert_replica_match "$target_sha" "$manifest_b" || return 1
  return 0
}

# Missing evidence must fail closed (no COMMITTED exposure).
vps_runtime_identity_evidence_present() {
  local manifest_a=$1
  local manifest_b=$2
  [[ -f "$manifest_a" && -f "$manifest_b" ]] || return 1
  [[ -L "$manifest_a" || -L "$manifest_b" ]] && return 1
  vps_runtime_identity_read_manifest_git_sha "$manifest_a" >/dev/null || return 1
  vps_runtime_identity_read_manifest_git_sha "$manifest_b" >/dev/null || return 1
  return 0
}
