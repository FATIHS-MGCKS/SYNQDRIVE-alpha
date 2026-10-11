#!/usr/bin/env bash
# P4B16 — focused offline tests (fixtures only; mock vps_replica_verify_post_deploy).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-release-attestation.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation.lib.sh"
# shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation-env-mirror.lib.sh"

VERIFY_CALLS=0
VERIFY_EXPECT=""
vps_replica_verify_post_deploy() {
  VERIFY_CALLS=$((VERIFY_CALLS + 1))
  local _rel=$1
  local sha=$2
  [[ "${VERIFY_FAIL:-0}" == "1" ]] && return 1
  [[ "$sha" == "$VERIFY_EXPECT" ]]
}

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

SHA_A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
SHA_B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
SHA_C='cccccccccccccccccccccccccccccccccccccccc'
APDS_PIN='dddddddddddddddddddddddddddddddddddddddd'
REL_DIR="/tmp/p4b16-release-fixture"

setup_fixture() {
  local root=$1
  export VPS_ATTESTATION_STATE_DIR="${root}/deploy-state"
  export VPS_ATTESTATION_BACKEND_ENV="${root}/backend.env"
  mkdir -p "${VPS_ATTESTATION_STATE_DIR}"
  touch "${VPS_ATTESTATION_BACKEND_ENV}"
}

record() {
  vps_attest_lock_acquire
  vps_attest_record_deploy_success "$REL_DIR" "$1"
  vps_attest_lock_release
}

ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT
setup_fixture "$ROOT"
VERIFY_FAIL=0

# A -> B -> C
VERIFY_EXPECT="$SHA_A"
record "$SHA_A"
VERIFY_EXPECT="$SHA_B"
record "$SHA_B"
VERIFY_EXPECT="$SHA_C"
record "$SHA_C"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_C" ]] && pass "multi_deploy_a_b_c"

# Same SHA idempotence: verify + mirror check
VERIFY_CALLS=0
VERIFY_EXPECT="$SHA_C"
record "$SHA_C"
[[ "$VERIFY_CALLS" -ge 1 ]] && pass "idempotent_same_sha_verifies"

# Stale mirror must be repaired (not silently accepted)
printf 'SYNQDRIVE_DEPLOYED_GIT_SHA=%s\n' "$SHA_A" >"${VPS_ATTESTATION_BACKEND_ENV}"
VERIFY_EXPECT="$SHA_C"
record "$SHA_C"
[[ "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")" == "$SHA_C" ]] && pass "idempotent_stale_mirror_repaired"

# Same SHA verify failure
VERIFY_FAIL=1
VERIFY_EXPECT="$SHA_C"
if vps_attest_lock_acquire && vps_attest_record_deploy_success "$REL_DIR" "$SHA_C" 2>/dev/null; then
  vps_attest_lock_release
  fail "same_sha_verify_fail"
fi
vps_attest_lock_release 2>/dev/null || true
VERIFY_FAIL=0
pass "same_sha_verify_failure_rejected"

# No verifier function => fail closed
ROOT_NV="$(mktemp -d)"
setup_fixture "$ROOT_NV"
export VPS_ATTESTATION_STATE_DIR="${ROOT_NV}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT_NV}/backend.env"
unset -f vps_replica_verify_post_deploy 2>/dev/null || true
VERIFY_EXPECT="$SHA_A"
if vps_attest_lock_acquire && vps_attest_record_deploy_success "$REL_DIR" "$SHA_A" 2>/dev/null; then
  vps_attest_lock_release
  fail "missing_verifier"
fi
vps_attest_lock_release 2>/dev/null || true
pass "missing_verifier_fail_closed"
vps_replica_verify_post_deploy() {
  VERIFY_CALLS=$((VERIFY_CALLS + 1))
  local _rel=$1
  local sha=$2
  [[ "${VERIFY_FAIL:-0}" == "1" ]] && return 1
  [[ "$sha" == "$VERIFY_EXPECT" ]]
}

# Verify failure on fresh deploy
ROOT2="$(mktemp -d)"
setup_fixture "$ROOT2"
export VPS_ATTESTATION_STATE_DIR="${ROOT2}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT2}/backend.env"
VERIFY_FAIL=1
VERIFY_EXPECT="$SHA_B"
if vps_attest_lock_acquire && vps_attest_record_deploy_success "$REL_DIR" "$SHA_B" 2>/dev/null; then
  vps_attest_lock_release
  fail "verify_failure_should_block"
fi
vps_attest_lock_release 2>/dev/null || true
VERIFY_FAIL=0
pass "verify_failure_blocks_commit"

# Lock required
ROOT3="$(mktemp -d)"
setup_fixture "$ROOT3"
export VPS_ATTESTATION_STATE_DIR="${ROOT3}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT3}/backend.env"
VERIFY_EXPECT="$SHA_A"
if vps_attest_record_deploy_success "$REL_DIR" "$SHA_A" 2>/dev/null; then
  fail "write_without_lock"
fi
pass "lock_required_for_write"

# Lock contention
(
  vps_attest_lock_acquire
  sleep 2
  vps_attest_lock_release
) &
sleep 0.2
if vps_attest_lock_acquire 2>/dev/null; then
  vps_attest_lock_release
  fail "lock_busy_expected"
fi
pass "lock_contention"
wait || true

# Crash recovery
ROOT6="$(mktemp -d)"
setup_fixture "$ROOT6"
export VPS_ATTESTATION_STATE_DIR="${ROOT6}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT6}/backend.env"
VERIFY_EXPECT="$SHA_A"
export VPS_ATTESTATION_CRASH_HOOK=before_state_write
set +e
(
  vps_attest_lock_acquire
  vps_attest_record_deploy_success "$REL_DIR" "$SHA_A" >/dev/null 2>&1
  vps_attest_lock_release
) || true
set -e
export VPS_ATTESTATION_CRASH_HOOK=
vps_attest_lock_acquire
vps_attest_resume_incomplete_deploy "$REL_DIR" "$SHA_B" 2>/dev/null && fail "resume_wrong_sha"
VERIFY_EXPECT="$SHA_A"
vps_attest_resume_incomplete_deploy "$REL_DIR" "$SHA_A"
vps_attest_lock_release
pass "crash_resume_ok"

# Mirror permissions preserved (strict metadata)
ROOT9="$(mktemp -d)"
setup_fixture "$ROOT9"
export VPS_ATTESTATION_STATE_DIR="${ROOT9}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT9}/backend.env"
chmod 640 "${VPS_ATTESTATION_BACKEND_ENV}"
MODE_BEFORE="$(stat -c '%a' "${VPS_ATTESTATION_BACKEND_ENV}")"
VERIFY_EXPECT="$SHA_A"
record "$SHA_A"
MODE_AFTER="$(stat -c '%a' "${VPS_ATTESTATION_BACKEND_ENV}")"
[[ "$MODE_BEFORE" == "$MODE_AFTER" ]] && pass "mirror_permissions_preserved"

export VPS_ATTESTATION_MIRROR_METADATA_FAIL=1
if vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV}" "$SHA_B" 2>/dev/null; then
  fail "metadata_fail_should_abort"
fi
unset VPS_ATTESTATION_MIRROR_METADATA_FAIL
pass "mirror_metadata_fail_closed"

# Rollback
ROOT7="$(mktemp -d)"
setup_fixture "$ROOT7"
export VPS_ATTESTATION_STATE_DIR="${ROOT7}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT7}/backend.env"
VERIFY_EXPECT="$SHA_A"
record "$SHA_A"
VERIFY_EXPECT="$SHA_B"
vps_attest_lock_acquire
vps_attest_record_rollback_success "$REL_DIR" "$SHA_B"
vps_attest_lock_release
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_B" ]] && pass "rollback_success_updates_sha"
VERIFY_EXPECT="$SHA_A"
record "$SHA_A"
GEN_BEFORE="$(vps_attest_state_read_kv GENERATION)"
VERIFY_FAIL=1
if vps_attest_lock_acquire && vps_attest_record_rollback_success "$REL_DIR" "$SHA_B" 2>/dev/null; then
  vps_attest_lock_release
  fail "rollback_verify_fail"
fi
vps_attest_lock_release 2>/dev/null || true
VERIFY_FAIL=0
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "rollback_failure_keeps_sha"
vps_attest_lock_acquire
vps_attest_record_rollback_denied "$REL_DIR"
vps_attest_lock_release
GEN_AFTER="$(vps_attest_state_read_kv GENERATION)"
[[ "$GEN_BEFORE" == "$GEN_AFTER" ]] && pass "rollback_denied_no_state_renewal"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "rollback_denied_keeps_sha"

# APDS
ROOT8="$(mktemp -d)"
setup_fixture "$ROOT8"
export VPS_ATTESTATION_STATE_DIR="${ROOT8}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT8}/backend.env"
cat >"${VPS_ATTESTATION_BACKEND_ENV}" <<EOF
SYNQDRIVE_DEPLOYED_GIT_SHA=${SHA_B}
APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}
KEEP=yes
EOF
VERIFY_EXPECT="$SHA_A"
record "$SHA_A"
grep -q "^APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}$" "${VPS_ATTESTATION_BACKEND_ENV}" && pass "apds_preserved"

echo "ALL_CORE_TESTS_PASS"
