#!/usr/bin/env bash
# P4B16 — Durable release attestation engine (library only; not wired to deploy entrypoints in R1A).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# --- Configurable paths (fixtures override in selftests) ---
VPS_ATTESTATION_STATE_DIR="${VPS_ATTESTATION_STATE_DIR:-${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}}"
VPS_ATTESTATION_STATE_FILE="${VPS_ATTESTATION_STATE_FILE:-release-attestation.state}"
VPS_ATTESTATION_JOURNAL_FILE="${VPS_ATTESTATION_JOURNAL_FILE:-attestation.journal}"
VPS_ATTESTATION_LOCK_FILE="${VPS_ATTESTATION_LOCK_FILE:-.attestation.lock}"
VPS_ATTESTATION_CHECKSUM_FILE="${VPS_ATTESTATION_CHECKSUM_FILE:-release-attestation.state.sha256}"

# Crash injection for selftests: VPS_ATTESTATION_CRASH_HOOK=after_STATE_DURABLE etc.
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

vps_attest_journal_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_JOURNAL_FILE}"
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
  mkdir -p "$dir"
  chmod 750 "$dir" 2>/dev/null || true
}

vps_attest_safe_regular_file() {
  local path=$1
  local label=${2:-path}
  if [[ -z "$path" ]]; then
    vps_attest_fail "${label} empty"
    return 1
  fi
  if [[ -L "$path" ]]; then
    vps_attest_fail "${label} must not be a symlink: ${path}"
    return 1
  fi
  if [[ -e "$path" && ! -f "$path" ]]; then
    vps_attest_fail "${label} must be a regular file: ${path}"
    return 1
  fi
  return 0
}

vps_attest_fsync_file() {
  local f=$1
  if [[ -f "$f" ]]; then
    sync -f "$f" 2>/dev/null || true
  fi
}

vps_attest_fsync_dir() {
  local d=$1
  if [[ -d "$d" ]]; then
    sync -f "$d" 2>/dev/null || true
  fi
}

vps_attest_crash_hook() {
  local point=$1
  if [[ "${VPS_ATTESTATION_CRASH_HOOK}" == "$point" ]]; then
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

vps_attest_journal_append() {
  local event=$1
  local gen=$2
  shift 2
  local extra=("$@")
  vps_attest_ensure_state_dir || return 1
  local jpath
  jpath="$(vps_attest_journal_path)"
  if [[ -f "$jpath" ]]; then
    vps_attest_safe_regular_file "$jpath" "journal" || return 1
  fi
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local line="${ts} EVENT=${event} gen=${gen}"
  local kv
  for kv in "${extra[@]}"; do
    line+=" ${kv}"
  done
  printf '%s\n' "$line" >>"$jpath"
  chmod 640 "$jpath" 2>/dev/null || true
  vps_attest_fsync_file "$jpath"
  return 0
}

vps_attest_journal_grep_gen() {
  local gen=$1
  local jpath
  jpath="$(vps_attest_journal_path)"
  [[ -f "$jpath" ]] || return 1
  grep -E " gen=${gen}($| )" "$jpath" 2>/dev/null || true
}

vps_attest_journal_last_event_for_gen() {
  local gen=$1
  vps_attest_journal_grep_gen "$gen" | tail -n 1 | sed -n 's/.*EVENT=\([^ ]*\).*/\1/p'
}

vps_attest_journal_has_published() {
  local gen=$1
  vps_attest_journal_grep_gen "$gen" | grep -q 'EVENT=PUBLISHED'
}

vps_attest_state_read_kv() {
  local key=$1
  local spath
  spath="$(vps_attest_state_path)"
  if [[ ! -f "$spath" ]]; then
    return 0
  fi
  grep -m1 "^${key}=" "$spath" 2>/dev/null | cut -d= -f2- || true
  return 0
}

vps_attest_state_body_checksum() {
  local body=$1
  printf '%s' "$body" | sha256sum | awk '{print $1}'
}

vps_attest_state_write_checksum_sidecar() {
  local spath=$1
  local body=$2
  local cpath sum
  cpath="$(vps_attest_checksum_path)"
  sum="$(vps_attest_state_body_checksum "$body")"
  printf '%s\n' "$sum" >"${cpath}.tmp"
  vps_attest_fsync_file "${cpath}.tmp"
  mv -f "${cpath}.tmp" "$cpath"
  chmod 640 "$cpath" 2>/dev/null || true
  vps_attest_fsync_dir "$(dirname "$cpath")"
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
  local spath tmp
  spath="$(vps_attest_state_path)"
  tmp="${spath}.tmp.$$"
  printf '%s' "$body" >"$tmp"
  chmod 640 "$tmp" 2>/dev/null || true
  vps_attest_fsync_file "$tmp"
  mv -f "$tmp" "$spath"
  vps_attest_fsync_dir "$(dirname "$spath")"
  vps_attest_state_write_checksum_sidecar "$spath" "$body"
}

vps_attest_state_load_generation() {
  local g
  g="$(vps_attest_state_read_kv GENERATION)"
  if [[ -z "$g" ]]; then
    echo 0
  else
    echo "$g"
  fi
}

vps_attest_next_generation() {
  local cur
  cur="$(vps_attest_state_load_generation)"
  echo $((cur + 1))
}

vps_attest_phase_allowed() {
  local phase=$1
  case "$phase" in
    PREPARED | IN_PROGRESS | VERIFIED | COMMIT_IN_PROGRESS | COMMITTED | FAILED | ROLLBACK_IN_PROGRESS | ROLLED_BACK | CONTAINED)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

vps_attest_build_state_body() {
  # Args: PHASE GEN REQUESTED_SHA COMMITTED_SHA PREV_SHA REPLICA_A REPLICA_B RELEASE_ID CORR_ID PUBLISHED_AT
  local phase=$1 gen=$2 req=$3 committed=$4 prev=$5 ra=$6 rb=$7 rel=$8 corr=$9 pub_at=${10}
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat <<EOF
PHASE=${phase}
GENERATION=${gen}
REQUESTED_SHA=${req}
COMMITTED_SHA=${committed}
PREVIOUS_COMMITTED_SHA=${prev}
REPLICA_A_RUNTIME_SHA=${ra}
REPLICA_B_RUNTIME_SHA=${rb}
RELEASE_ID=${rel}
CORRELATION_ID=${corr}
UPDATED_AT=${ts}
PUBLISHED_AT=${pub_at}
EOF
}

vps_attest_begin_prepared() {
  local requested_sha=$1
  local release_id=${2:-}
  local correlation_id=${3:-}
  local replica_a=${4:-}
  local replica_b=${5:-}

  vps_attest_validate_sha "$requested_sha" || vps_attest_fail "invalid REQUESTED_SHA" || return 1
  requested_sha="$(vps_attest_normalize_sha "$requested_sha")"
  local gen prev committed
  gen="$(vps_attest_next_generation)"
  prev="$(vps_attest_state_read_kv COMMITTED_SHA)"
  prev="${prev:-}"
  committed="${prev}"

  local body
  body="$(vps_attest_build_state_body PREPARED "$gen" "$requested_sha" "$committed" "$prev" "$replica_a" "$replica_b" "$release_id" "$correlation_id" "")"
  vps_attest_state_write_atomic "$body" || return 1
  echo "$gen"
}

vps_attest_set_phase() {
  local phase=$1
  vps_attest_phase_allowed "$phase" || vps_attest_fail "invalid phase ${phase}" || return 1
  local spath
  spath="$(vps_attest_state_path)"
  [[ -f "$spath" ]] || vps_attest_fail "missing state" || return 1
  vps_attest_state_verify_checksum || vps_attest_fail "state checksum invalid" || return 1
  local body
  body="$(cat "$spath")"
  body="$(printf '%s\n' "$body" | sed "s/^PHASE=.*/PHASE=${phase}/")"
  body="$(printf '%s\n' "$body" | sed "s/^UPDATED_AT=.*/UPDATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)/")"
  vps_attest_state_write_atomic "$body"
}

# External: must set VPS_ATTESTATION_BACKEND_ENV path for mirror
vps_attest_publish_commit() {
  local target_sha=$1
  local replica_a=${2:-}
  local replica_b=${3:-}

  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"

  local gen phase
  gen="$(vps_attest_state_read_kv GENERATION)"
  phase="$(vps_attest_state_read_kv PHASE)"
  [[ -n "$gen" ]] || return 1

  if vps_attest_journal_has_published "$gen"; then
    vps_attest_fail "duplicate publication for gen=${gen}"
    return 1
  fi

  vps_attest_set_phase COMMIT_IN_PROGRESS || return 1
  vps_attest_journal_append BEGIN_COMMIT "$gen" "sha=${target_sha}" || return 1
  vps_attest_crash_hook after_BEGIN_COMMIT

  local req prev rel corr body
  req="$(vps_attest_state_read_kv REQUESTED_SHA)"
  prev="$(vps_attest_state_read_kv PREVIOUS_COMMITTED_SHA)"
  rel="$(vps_attest_state_read_kv RELEASE_ID)"
  corr="$(vps_attest_state_read_kv CORRELATION_ID)"

  body="$(vps_attest_build_state_body VERIFIED "$gen" "$req" "$target_sha" "$prev" "$replica_a" "$replica_b" "$rel" "$corr" "")"
  vps_attest_state_write_atomic "$body" || return 1
  vps_attest_journal_append STATE_DURABLE "$gen" || return 1
  vps_attest_crash_hook after_STATE_DURABLE

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  if ! vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$target_sha"; then
    vps_attest_journal_append MIRROR_FAILED "$gen" || true
    vps_attest_set_phase FAILED || true
    return 1
  fi
  vps_attest_journal_append BACKEND_ENV_MIRROR "$gen" || return 1
  vps_attest_crash_hook after_BACKEND_ENV_MIRROR

  # Journal PUBLISHED before state PHASE=COMMITTED (readers fail-closed if state leads journal).
  vps_attest_journal_append PUBLISHED "$gen" "sha=${target_sha}" || return 1
  vps_attest_crash_hook after_PUBLISHED

  local pub_at
  pub_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$req" "$target_sha" "$prev" "$replica_a" "$replica_b" "$rel" "$corr" "$pub_at")"
  vps_attest_state_write_atomic "$body" || return 1
  vps_attest_crash_hook after_COMMITTED_STATE
  return 0
}

vps_attest_reader_is_committed() {
  vps_attest_state_verify_checksum || return 1
  local phase gen
  phase="$(vps_attest_state_read_kv PHASE)"
  gen="$(vps_attest_state_read_kv GENERATION)"
  vps_attest_journal_has_published "$gen" || return 1
  [[ "$phase" == "COMMITTED" ]] || return 1
  local last
  last="$(vps_attest_journal_last_event_for_gen "$gen")"
  [[ "$last" == "PUBLISHED" ]]
}

# True when journal published but state not yet COMMITTED (crash window) — still not committed for readers.
vps_attest_reader_premature_committed_exposure() {
  local phase gen
  gen="$(vps_attest_state_read_kv GENERATION)"
  phase="$(vps_attest_state_read_kv PHASE)"
  if vps_attest_journal_has_published "$gen"; then
    [[ "$phase" == "COMMITTED" ]] || return 0
    return 1
  fi
  [[ "$phase" == "COMMITTED" ]]
}

vps_attest_reader_committed_sha() {
  if ! vps_attest_reader_is_committed; then
    return 1
  fi
  vps_attest_state_read_kv COMMITTED_SHA
}

vps_attest_resume_publish_if_needed() {
  local target_sha=$1
  local replica_a=${2:-}
  local replica_b=${3:-}
  local gen
  gen="$(vps_attest_state_read_kv GENERATION)"
  [[ -n "$gen" ]] || return 1
  if vps_attest_journal_has_published "$gen"; then
    return 0
  fi
  local last
  last="$(vps_attest_journal_last_event_for_gen "$gen")"
  case "$last" in
    STATE_DURABLE | BACKEND_ENV_MIRROR | BEGIN_COMMIT | "")
      vps_attest_publish_commit "$target_sha" "$replica_a" "$replica_b"
      ;;
    *)
      return 1
      ;;
  esac
}

vps_attest_rollback_publish_success() {
  local previous_sha=$1
  vps_attest_validate_sha "$previous_sha" || return 1
  previous_sha="$(vps_attest_normalize_sha "$previous_sha")"
  local cur_gen prev_committed
  cur_gen="$(vps_attest_state_load_generation)"
  local gen=$((cur_gen + 1))
  if vps_attest_journal_has_published "$gen"; then
    vps_attest_fail "duplicate rollback publication gen=${gen}"
    return 1
  fi
  prev_committed="$(vps_attest_state_read_kv COMMITTED_SHA)"

  local body
  body="$(vps_attest_build_state_body ROLLBACK_IN_PROGRESS "$gen" "$previous_sha" "$prev_committed" "$prev_committed" "" "" "" "" "")"
  vps_attest_state_write_atomic "$body" || return 1
  vps_attest_journal_append ROLLBACK_BEGIN "$gen" "sha=${previous_sha}" || return 1
  vps_attest_crash_hook after_ROLLBACK_BEGIN

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$previous_sha" || {
    body="$(vps_attest_build_state_body CONTAINED "$gen" "$previous_sha" "$prev_committed" "$prev_committed" "" "" "" "" "")"
    vps_attest_state_write_atomic "$body" || true
    vps_attest_journal_append CONTAINED "$gen" "reason=mirror_failed" || true
    return 1
  }
  vps_attest_journal_append BACKEND_ENV_MIRROR "$gen" || return 1
  vps_attest_crash_hook after_ROLLBACK_MIRROR

  vps_attest_journal_append ROLLBACK_PUBLISHED "$gen" "sha=${previous_sha}" || return 1
  vps_attest_journal_append PUBLISHED "$gen" "sha=${previous_sha}" || return 1
  vps_attest_crash_hook after_ROLLBACK_PUBLISHED

  local pub_at
  pub_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  body="$(vps_attest_build_state_body ROLLED_BACK "$gen" "$previous_sha" "$previous_sha" "$prev_committed" "" "" "" "" "$pub_at")"
  vps_attest_state_write_atomic "$body" || return 1
  return 0
}

vps_attest_rollback_publish_denied() {
  local reason=${1:-security_floor}
  local cur_gen gen prev_committed body
  cur_gen="$(vps_attest_state_load_generation)"
  gen=$((cur_gen + 1))
  prev_committed="$(vps_attest_state_read_kv COMMITTED_SHA)"
  vps_attest_journal_append ROLLBACK_DENIED "$gen" "reason=${reason}" || return 1
  body="$(vps_attest_build_state_body CONTAINED "$gen" "${prev_committed}" "$prev_committed" "$prev_committed" "" "" "" "" "")"
  vps_attest_state_write_atomic "$body" || return 1
  vps_attest_journal_append CONTAINED "$gen" "reason=${reason}" || return 1
  if vps_attest_journal_has_published "$gen"; then
    vps_attest_fail "denied rollback must not publish"
    return 1
  fi
  return 0
}

vps_attest_reader_is_rolled_back() {
  vps_attest_state_verify_checksum || return 1
  local phase gen
  phase="$(vps_attest_state_read_kv PHASE)"
  gen="$(vps_attest_state_read_kv GENERATION)"
  [[ "$phase" == "ROLLED_BACK" ]] || return 1
  vps_attest_journal_grep_gen "$gen" | grep -q 'EVENT=ROLLBACK_PUBLISHED'
}
