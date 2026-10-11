#!/usr/bin/env bash
# P4B16 — focused offline tests (fixtures only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-release-attestation.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation.lib.sh"
# shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation-env-mirror.lib.sh"

export VPS_ATTESTATION_OFFLINE_SELFTEST=1
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1

VERIFY_CALLS=0
VERIFY_EXPECT=""
vps_replica_verify_post_deploy() {
  VERIFY_CALLS=$((VERIFY_CALLS + 1))
  local _rel=$1
  local sha=$2
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

# A -> B -> C
VERIFY_EXPECT="$SHA_A"
record "$SHA_A"
VERIFY_EXPECT="$SHA_B"
record "$SHA_B"
VERIFY_EXPECT="$SHA_C"
record "$SHA_C"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_C" ]] && pass "multi_deploy_a_b_c"

# Same SHA idempotence runs verify again (mock must run, not skip)
VERIFY_CALLS=0
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=0
VERIFY_EXPECT="$SHA_C"
vps_attest_lock_acquire
vps_attest_record_deploy_success "$REL_DIR" "$SHA_C"
vps_attest_lock_release
[[ "$VERIFY_CALLS" -ge 1 ]] && pass "idempotent_same_sha_verifies"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_C" ]] && pass "idempotent_same_sha_still_c"
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1

# Same SHA but verify fails must not succeed
VERIFY_FAIL=1
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=0
vps_replica_verify_post_deploy() {
  VERIFY_CALLS=$((VERIFY_CALLS + 1))
  [[ "${VERIFY_FAIL:-0}" == "1" ]] && return 1
  [[ "$2" == "$VERIFY_EXPECT" ]]
}
VERIFY_EXPECT="$SHA_C"
if vps_attest_lock_acquire && vps_attest_record_deploy_success "$REL_DIR" "$SHA_C" 2>/dev/null; then
  vps_attest_lock_release
  fail "same_sha_verify_fail_should_not_succeed"
fi
vps_attest_lock_release 2>/dev/null || true
VERIFY_FAIL=0
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
vps_replica_verify_post_deploy() {
  VERIFY_CALLS=$((VERIFY_CALLS + 1))
  [[ "$2" == "$VERIFY_EXPECT" ]]
}
pass "same_sha_verify_failure_rejected"

# Production cannot bypass verify
export VPS_ATTESTATION_OFFLINE_SELFTEST=0
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
if vps_attest_lock_acquire && vps_attest_record_deploy_success "$REL_DIR" "$SHA_C" 2>/dev/null; then
  vps_attest_lock_release
  fail "prod_skip_blocked"
fi
vps_attest_lock_release 2>/dev/null || true
export VPS_ATTESTATION_OFFLINE_SELFTEST=1
pass "verify_gate_prod_skip_blocked"

# Verify failure on fresh deploy
ROOT2="$(mktemp -d)"
setup_fixture "$ROOT2"
export VPS_ATTESTATION_STATE_DIR="${ROOT2}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT2}/backend.env"
export VPS_ATTESTATION_OFFLINE_SELFTEST=0
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=0
VERIFY_EXPECT="$SHA_B"
vps_replica_verify_post_deploy() { return 1; }
if vps_attest_lock_acquire && vps_attest_record_deploy_success "$REL_DIR" "$SHA_B" 2>/dev/null; then
  vps_attest_lock_release
  fail "verify_failure_should_block"
fi
vps_attest_lock_release 2>/dev/null || true
export VPS_ATTESTATION_OFFLINE_SELFTEST=1
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
vps_replica_verify_post_deploy() { VERIFY_CALLS=$((VERIFY_CALLS + 1)); [[ "$2" == "$VERIFY_EXPECT" ]]; }
pass "verify_failure_blocks_commit"

# Lock required for writes
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

# Crash recovery + resume rejects wrong SHA
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
vps_attest_reader_is_committed 2>/dev/null && fail "crash_before_state_not_committed"
vps_attest_lock_acquire
vps_attest_resume_incomplete_deploy "$REL_DIR" "$SHA_B" 2>/dev/null && fail "resume_wrong_sha"
VERIFY_EXPECT="$SHA_A"
vps_attest_resume_incomplete_deploy "$REL_DIR" "$SHA_A"
vps_attest_lock_release
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "crash_resume_ok"

# Mirror permissions preserved
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
if compgen -G "${VPS_ATTESTATION_BACKEND_ENV}.bak-*" >/dev/null; then
  fail "backup_file_left"
fi
pass "no_env_backup_files"

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
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=0
vps_replica_verify_post_deploy() { return 1; }
if vps_attest_lock_acquire && vps_attest_record_rollback_success "$REL_DIR" "$SHA_B" 2>/dev/null; then
  vps_attest_lock_release
  fail "rollback_verify_fail"
fi
vps_attest_lock_release 2>/dev/null || true
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "rollback_failure_keeps_sha"
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
vps_replica_verify_post_deploy() { [[ "$2" == "$VERIFY_EXPECT" ]]; }
vps_attest_lock_acquire
vps_attest_record_rollback_denied
vps_attest_lock_release
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
