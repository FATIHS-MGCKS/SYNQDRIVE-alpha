#!/usr/bin/env bash
# P4B16 — Legacy SYNQDRIVE_DEPLOYED_GIT_SHA mirror (fixture-safe; no production paths required).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

VPS_ATTESTATION_MIRROR_KEY="${VPS_ATTESTATION_MIRROR_KEY:-SYNQDRIVE_DEPLOYED_GIT_SHA}"
VPS_ATTESTATION_FORBIDDEN_KEYS=(
  APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA
)

vps_attest_mirror_log() {
  printf '[release-attestation-mirror] %s\n' "$*" >&2
}

vps_attest_mirror_fail() {
  vps_attest_mirror_log "ABORT: $*"
  return 1
}

vps_attest_mirror_crash_hook() {
  local point=$1
  if [[ "${VPS_ATTESTATION_CRASH_HOOK:-}" == "$point" ]]; then
    vps_attest_mirror_log "CRASH_HOOK=${point}"
    exit 99
  fi
}

vps_attest_mirror_validate_env_path() {
  local path=$1
  [[ -n "$path" ]] || vps_attest_mirror_fail "backend env path empty" || return 1
  if [[ -L "$path" ]]; then
    vps_attest_mirror_fail "backend env must not be a symlink: ${path}"
    return 1
  fi
  if [[ -e "$path" && ! -f "$path" ]]; then
    vps_attest_mirror_fail "backend env must be a regular file: ${path}"
    return 1
  fi
  local parent
  parent="$(dirname "$path")"
  if [[ -L "$parent" ]]; then
    vps_attest_mirror_fail "backend env parent must not be a symlink: ${parent}"
    return 1
  fi
  return 0
}

vps_attest_mirror_read_sha_from_file() {
  local path=$1
  [[ -f "$path" ]] || return 1
  grep -E "^${VPS_ATTESTATION_MIRROR_KEY}=" "$path" 2>/dev/null | cut -d= -f2- | tail -n 1
}

vps_attest_mirror_count_sha_keys() {
  local path=$1
  if [[ ! -f "$path" ]]; then
    echo 0
    return 0
  fi
  local n
  n="$(grep -cE "^${VPS_ATTESTATION_MIRROR_KEY}=" "$path" 2>/dev/null || true)"
  n="${n//$'\n'/}"
  if [[ -z "$n" ]]; then
    echo 0
  else
    echo "$n"
  fi
}

# Patch or append mirror key; never modify forbidden keys; reject duplicate mirror keys.
vps_attest_mirror_build_content() {
  local src=$1
  local sha=$2
  local count
  count="$(vps_attest_mirror_count_sha_keys "$src")"
  if [[ "$count" -gt 1 ]]; then
    vps_attest_mirror_fail "duplicate ${VPS_ATTESTATION_MIRROR_KEY} keys in ${src}"
    return 1
  fi
  if [[ ! -f "$src" ]]; then
    printf '%s=%s\n' "$VPS_ATTESTATION_MIRROR_KEY" "$sha"
    return 0
  fi
  local replaced=0 line key
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^([^=]+)= ]]; then
      key="${BASH_REMATCH[1]}"
      for forbidden in "${VPS_ATTESTATION_FORBIDDEN_KEYS[@]}"; do
        if [[ "$key" == "$forbidden" ]]; then
          printf '%s\n' "$line"
          continue 2
        fi
      done
      if [[ "$key" == "$VPS_ATTESTATION_MIRROR_KEY" ]]; then
        printf '%s=%s\n' "$VPS_ATTESTATION_MIRROR_KEY" "$sha"
        replaced=1
        continue
      fi
    fi
    printf '%s\n' "$line"
  done <"$src"
  if [[ "$replaced" == "0" ]]; then
    printf '%s=%s\n' "$VPS_ATTESTATION_MIRROR_KEY" "$sha"
  fi
}

vps_attest_mirror_fsync_file() {
  local f=$1
  [[ -f "$f" ]] || return 0
  sync -f "$f" 2>/dev/null || return 1
}

vps_attest_mirror_fsync_dir() {
  local d=$1
  [[ -d "$d" ]] || return 0
  sync -f "$d" 2>/dev/null || return 1
}

# Args: backend_env_path target_sha (40-char, normalized by caller)
vps_attest_mirror_deployed_git_sha() {
  local env_path=$1
  local sha=$2

  if [[ "${VPS_ATTESTATION_MIRROR_SIMULATE_FAIL:-}" == "1" ]]; then
    vps_attest_mirror_fail "simulated mirror failure (selftest)"
    return 1
  fi

  vps_attest_mirror_validate_env_path "$env_path" || return 1
  if [[ -n "${vps_attest_validate_sha:-}" ]]; then
    vps_attest_validate_sha "$sha" || vps_attest_mirror_fail "invalid mirror SHA" || return 1
    sha="$(vps_attest_normalize_sha "$sha")"
  elif [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    vps_attest_mirror_fail "invalid mirror SHA"
    return 1
  fi

  local parent tmp bak
  parent="$(dirname "$env_path")"
  mkdir -p "$parent" 2>/dev/null || true
  tmp="${env_path}.mirror.tmp.$$"
  bak="${env_path}.bak-$(date -u +%Y%m%dT%H%M%SZ)"

  if [[ -f "$env_path" ]]; then
    cp -a "$env_path" "$bak"
    vps_attest_mirror_crash_hook after_MIRROR_BACKUP
  fi

  if ! vps_attest_mirror_build_content "$env_path" "$sha" >"$tmp"; then
    rm -f "$tmp"
    return 1
  fi

  local k
  for k in "${VPS_ATTESTATION_FORBIDDEN_KEYS[@]}"; do
    if [[ -f "$env_path" ]] && grep -qE "^${k}=" "$env_path" 2>/dev/null; then
      local before after
      before="$(grep -E "^${k}=" "$env_path" | head -n 1)"
      after="$(grep -E "^${k}=" "$tmp" | head -n 1)"
      if [[ "$before" != "$after" ]]; then
        vps_attest_mirror_fail "forbidden key modified: ${k}"
        rm -f "$tmp"
        return 1
      fi
    fi
  done

  chmod 640 "$tmp" 2>/dev/null || true
  vps_attest_mirror_fsync_file "$tmp" || { rm -f "$tmp"; return 1; }
  vps_attest_mirror_crash_hook after_MIRROR_TMP

  if ! mv -f "$tmp" "$env_path"; then
    rm -f "$tmp"
    vps_attest_mirror_fail "mirror rename failed"
    return 1
  fi
  vps_attest_mirror_fsync_dir "$parent" || return 1
  vps_attest_mirror_crash_hook after_MIRROR_RENAME
  return 0
}
