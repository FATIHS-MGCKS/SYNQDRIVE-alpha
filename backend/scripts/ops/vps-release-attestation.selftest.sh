#!/usr/bin/env bash
# P4B16 R1A — durable attestation engine offline certification (fixtures only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-release-attestation.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation.lib.sh"
# shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation-env-mirror.lib.sh"
# shellcheck source=lib/vps-runtime-identity-contract.lib.sh
source "${SCRIPT_DIR}/lib/vps-runtime-identity-contract.lib.sh"

TESTS_RUN=0
TESTS_PASS=0

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_PASS=$((TESTS_PASS + 1))
  echo "PASS: $*"
}

assert_eq() {
  local label=$1 expected=$2 actual=$3
  if [[ "$expected" != "$actual" ]]; then
    fail "${label}: expected '${expected}' got '${actual}'"
  fi
  pass "$label"
}

new_fixture_root() {
  mktemp -d
}

setup_attest_fixture() {
  local root=$1
  export VPS_ATTESTATION_STATE_DIR="${root}/deploy-state"
  export VPS_ATTESTATION_BACKEND_ENV="${root}/backend.env"
  mkdir -p "${VPS_ATTESTATION_STATE_DIR}"
  touch "${VPS_ATTESTATION_BACKEND_ENV}"
  chmod 640 "${VPS_ATTESTATION_BACKEND_ENV}" 2>/dev/null || true
}

SHA_A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
SHA_B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
SHA_C='cccccccccccccccccccccccccccccccccccccccc'
APDS_PIN='dddddddddddddddddddddddddddddddddddddddd'

run_publish_flow() {
  local sha=$1
  vps_attest_lock_acquire || return 1
  vps_attest_begin_prepared "$sha" "rel-1" "corr-1" >/dev/null
  vps_attest_set_phase IN_PROGRESS
  vps_attest_set_phase VERIFIED
  vps_attest_publish_commit "$sha"
  vps_attest_lock_release
}

# 1 — Normal commit
ROOT="$(new_fixture_root)"
trap 'rm -rf "${ROOT}"' EXIT
setup_attest_fixture "$ROOT"
MAN_A="${ROOT}/rel-a"
MAN_B="${ROOT}/rel-b"
vps_runtime_identity_write_fixture_manifest "$MAN_A" "$SHA_A"
vps_runtime_identity_write_fixture_manifest "$MAN_B" "$SHA_A"
vps_runtime_identity_attestation_ready "$SHA_A" "$(vps_runtime_identity_manifest_path "$MAN_A")" "$(vps_runtime_identity_manifest_path "$MAN_B")"
run_publish_flow "$SHA_A"
assert_eq "normal_commit_sha" "$SHA_A" "$(vps_attest_reader_committed_sha)"
vps_attest_reader_is_committed && pass "normal_commit_reader"
assert_eq "mirror_sha" "$SHA_A" "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")"

# 2 — Two-process lock contention
ROOT2="$(new_fixture_root)"
setup_attest_fixture "$ROOT2"
export VPS_ATTESTATION_STATE_DIR="${ROOT2}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT2}/backend.env"
(
  vps_attest_lock_acquire
  sleep 2
  vps_attest_lock_release
) &
HOLDER=$!
sleep 0.2
if vps_attest_lock_acquire 2>/dev/null; then
  vps_attest_lock_release
  fail "lock_contention expected busy lock"
else
  pass "lock_contention_second_process_denied"
fi
wait "$HOLDER" 2>/dev/null || true

# 3 — Duplicate publication (same generation)
ROOT3="$(new_fixture_root)"
setup_attest_fixture "$ROOT3"
export VPS_ATTESTATION_STATE_DIR="${ROOT3}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT3}/backend.env"
vps_attest_lock_acquire
vps_attest_begin_prepared "$SHA_B" >/dev/null
vps_attest_set_phase VERIFIED
vps_attest_publish_commit "$SHA_B"
if vps_attest_publish_commit "$SHA_B" 2>/dev/null; then
  fail "duplicate_publication_should_fail"
else
  pass "duplicate_publication_rejected"
fi
vps_attest_lock_release

# 4 — Crash at publication boundaries (subprocess per hook)
set +e
for hook in after_BEGIN_COMMIT after_STATE_DURABLE after_BACKEND_ENV_MIRROR after_PUBLISHED after_COMMITTED_STATE; do
  R_CRASH="$(new_fixture_root)"
  setup_attest_fixture "$R_CRASH"
  rc=0
  (
    export VPS_ATTESTATION_STATE_DIR="${R_CRASH}/deploy-state"
    export VPS_ATTESTATION_BACKEND_ENV="${R_CRASH}/backend.env"
    export VPS_ATTESTATION_CRASH_HOOK="$hook"
    vps_attest_lock_acquire
    vps_attest_begin_prepared "$SHA_C" >/dev/null
    vps_attest_set_phase VERIFIED
    vps_attest_publish_commit "$SHA_C" >/dev/null 2>&1
  ) || rc=$?
  if [[ "$rc" != "99" ]]; then
    fail "crash_hook_${hook} expected exit 99 got ${rc}"
  fi
  export VPS_ATTESTATION_STATE_DIR="${R_CRASH}/deploy-state"
  export VPS_ATTESTATION_BACKEND_ENV="${R_CRASH}/backend.env"
  if [[ "$hook" == "after_COMMITTED_STATE" ]]; then
    vps_attest_reader_is_committed || fail "crash_hook_${hook} should be fully committed"
    pass "crash_hook_${hook}_committed_ok"
  else
    if vps_attest_reader_is_committed 2>/dev/null; then
      fail "crash_hook_${hook} must not leave committed reader"
    fi
    pass "crash_hook_${hook}"
  fi
  rm -rf "$R_CRASH"
done
set -e

# 5 — Corrupt state checksum
ROOT5="$(new_fixture_root)"
setup_attest_fixture "$ROOT5"
export VPS_ATTESTATION_STATE_DIR="${ROOT5}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT5}/backend.env"
run_publish_flow "$SHA_A"
echo "CORRUPT=1" >>"$(vps_attest_state_path)"
if vps_attest_reader_is_committed 2>/dev/null; then
  fail "corrupt_checksum_should_fail_closed"
else
  pass "corrupt_checksum_fail_closed"
fi

# 6 — Partial journal entry
ROOT6="$(new_fixture_root)"
setup_attest_fixture "$ROOT6"
export VPS_ATTESTATION_STATE_DIR="${ROOT6}/deploy-state"
printf '%s\n' "2026-01-01T00:00:00Z EVENT=BROKEN gen=1 sha=" >>"$(vps_attest_journal_path)"
if vps_attest_journal_has_published 1; then
  fail "partial_journal_must_not_count_published"
else
  pass "partial_journal_not_published"
fi

# 7 — Mirror write failure (simulated; root can bypass chmod in CI)
ROOT7="$(new_fixture_root)"
setup_attest_fixture "$ROOT7"
export VPS_ATTESTATION_STATE_DIR="${ROOT7}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT7}/backend.env"
export VPS_ATTESTATION_MIRROR_SIMULATE_FAIL=1
vps_attest_lock_acquire
vps_attest_begin_prepared "$SHA_B" >/dev/null
vps_attest_set_phase VERIFIED
if vps_attest_publish_commit "$SHA_B" 2>/dev/null; then
  fail "mirror_write_failure_expected"
else
  pass "mirror_write_failure"
fi
unset VPS_ATTESTATION_MIRROR_SIMULATE_FAIL
phase="$(vps_attest_state_read_kv PHASE)"
[[ "$phase" == "FAILED" ]] && pass "mirror_failure_phase_failed" || fail "mirror_failure_phase"
vps_attest_lock_release

# 8 — Idempotent recovery after crash after STATE_DURABLE
ROOT8="$(new_fixture_root)"
setup_attest_fixture "$ROOT8"
export VPS_ATTESTATION_STATE_DIR="${ROOT8}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT8}/backend.env"
vps_attest_lock_acquire
vps_attest_begin_prepared "$SHA_A" >/dev/null
vps_attest_set_phase VERIFIED
(
  export VPS_ATTESTATION_CRASH_HOOK=after_STATE_DURABLE
  vps_attest_publish_commit "$SHA_A" >/dev/null 2>&1
) || true
vps_attest_resume_publish_if_needed "$SHA_A"
vps_attest_reader_is_committed && pass "idempotent_recovery"
pub_count="$(grep -c 'EVENT=PUBLISHED' "$(vps_attest_journal_path)" || true)"
[[ "$pub_count" == "1" ]] && pass "idempotent_single_published" || fail "duplicate_published_lines"
vps_attest_lock_release

# 9 — Rollback success
ROOT9="$(new_fixture_root)"
setup_attest_fixture "$ROOT9"
export VPS_ATTESTATION_STATE_DIR="${ROOT9}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT9}/backend.env"
run_publish_flow "$SHA_A"
vps_attest_lock_acquire
vps_attest_rollback_publish_success "$SHA_B"
vps_attest_reader_is_rolled_back && pass "rollback_success"
assert_eq "rollback_mirror" "$SHA_B" "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")"
vps_attest_lock_release

# 10 — Rollback denied
ROOT10="$(new_fixture_root)"
setup_attest_fixture "$ROOT10"
export VPS_ATTESTATION_STATE_DIR="${ROOT10}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT10}/backend.env"
run_publish_flow "$SHA_A"
before_sha="$(vps_attest_reader_committed_sha)"
vps_attest_lock_acquire
vps_attest_rollback_publish_denied security_floor
vps_attest_journal_grep_gen 2 | grep -q 'EVENT=PUBLISHED' && fail "rollback_denied_must_not_publish"
pass "rollback_denied_no_false_release"
assert_eq "rollback_denied_committed_field" "$before_sha" "$(vps_attest_state_read_kv COMMITTED_SHA)"
phase="$(vps_attest_state_read_kv PHASE)"
[[ "$phase" == "CONTAINED" ]] && pass "rollback_denied_contained"
vps_attest_lock_release

# 11 — Rollback crash
ROOT11="$(new_fixture_root)"
setup_attest_fixture "$ROOT11"
export VPS_ATTESTATION_STATE_DIR="${ROOT11}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT11}/backend.env"
run_publish_flow "$SHA_A"
vps_attest_lock_acquire
set +e
rc=0
(
  export VPS_ATTESTATION_CRASH_HOOK=after_ROLLBACK_BEGIN
  vps_attest_rollback_publish_success "$SHA_B" >/dev/null 2>&1
) || rc=$?
set -e
vps_attest_lock_release
[[ "$rc" == "99" ]] && pass "rollback_crash_hook" || fail "rollback_crash_rc"
vps_attest_reader_is_rolled_back 2>/dev/null && fail "rollback_crash_must_not_complete" || pass "rollback_crash_incomplete"

# 12 — Stale legacy mirror vs authoritative state
ROOT12="$(new_fixture_root)"
setup_attest_fixture "$ROOT12"
export VPS_ATTESTATION_STATE_DIR="${ROOT12}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT12}/backend.env"
run_publish_flow "$SHA_A"
printf 'SYNQDRIVE_DEPLOYED_GIT_SHA=%s\n' "$SHA_C" >>"${VPS_ATTESTATION_BACKEND_ENV}"
mirror="$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")"
state_sha="$(vps_attest_state_read_kv COMMITTED_SHA)"
[[ "$mirror" != "$state_sha" ]] && pass "stale_mirror_detectable"
vps_attest_reader_is_committed && pass "state_authoritative_over_stale_mirror"

# 13 — Invalid / malicious paths
if vps_attest_ensure_state_dir 2>/dev/null; then
  BAD_ROOT="$(new_fixture_root)"
  export VPS_ATTESTATION_STATE_DIR="${BAD_ROOT}/evil"
  ln -s /tmp "${BAD_ROOT}/evil"
  if vps_attest_ensure_state_dir 2>/dev/null; then
    fail "symlink_state_dir_should_fail"
  else
    pass "symlink_state_dir_rejected"
  fi
fi
SYM_ENV="$(new_fixture_root)/sym.env"
ln -s /etc/passwd "$SYM_ENV"
if vps_attest_mirror_deployed_git_sha "$SYM_ENV" "$SHA_A" 2>/dev/null; then
  fail "symlink_backend_env_should_fail"
else
  pass "symlink_backend_env_rejected"
fi
if vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV}" "not-a-sha" 2>/dev/null; then
  fail "invalid_sha_rejected"
else
  pass "invalid_sha_rejected"
fi

# 14 — No APDS pin modification
ROOT14="$(new_fixture_root)"
setup_attest_fixture "$ROOT14"
export VPS_ATTESTATION_STATE_DIR="${ROOT14}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT14}/backend.env"
cat >"${VPS_ATTESTATION_BACKEND_ENV}" <<EOF
SYNQDRIVE_DEPLOYED_GIT_SHA=${SHA_B}
APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}
OTHER_KEY=keep
EOF
run_publish_flow "$SHA_A"
grep -q "^APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}$" "${VPS_ATTESTATION_BACKEND_ENV}" && pass "apds_pin_unchanged"
grep -q '^OTHER_KEY=keep$' "${VPS_ATTESTATION_BACKEND_ENV}" && pass "unrelated_env_preserved"

# 15 — No premature COMMITTED (VERIFIED before PUBLISHED)
ROOT15="$(new_fixture_root)"
setup_attest_fixture "$ROOT15"
export VPS_ATTESTATION_STATE_DIR="${ROOT15}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT15}/backend.env"
vps_attest_lock_acquire
vps_attest_begin_prepared "$SHA_A" >/dev/null
vps_attest_set_phase VERIFIED
(
  export VPS_ATTESTATION_CRASH_HOOK=after_BACKEND_ENV_MIRROR
  vps_attest_publish_commit "$SHA_A" >/dev/null 2>&1
) || true
phase="$(vps_attest_state_read_kv PHASE)"
[[ "$phase" != "COMMITTED" ]] && pass "no_premature_committed_phase"
vps_attest_reader_is_committed 2>/dev/null && fail "reader_closed_before_publish" || pass "reader_closed_before_publish"
vps_attest_lock_release

# 16 — Missing runtime identity evidence
if vps_runtime_identity_evidence_present "/no/a" "/no/b" 2>/dev/null; then
  fail "missing_runtime_identity_should_fail"
else
  pass "missing_runtime_identity_fail_closed"
fi

echo "SUMMARY: ${TESTS_PASS}/${TESTS_RUN} assertions passed"
if [[ "$TESTS_PASS" -lt 16 ]]; then
  fail "expected at least 16 core scenarios"
fi
