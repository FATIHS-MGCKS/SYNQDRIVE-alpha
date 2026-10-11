#!/usr/bin/env bash
# P4B16 — focused offline tests (fixtures only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-release-attestation.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation.lib.sh"
# shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation-env-mirror.lib.sh"

export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1

VERIFY_EXPECT=""
vps_replica_verify_post_deploy() {
  local _rel=$1
  local sha=$2
  [[ "$sha" == "$VERIFY_EXPECT" ]]
}

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

SHA_A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
SHA_B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
APDS_PIN='dddddddddddddddddddddddddddddddddddddddd'
REL_DIR="/tmp/p4b16-release-fixture"

setup_fixture() {
  local root=$1
  export VPS_ATTESTATION_STATE_DIR="${root}/deploy-state"
  export VPS_ATTESTATION_BACKEND_ENV="${root}/backend.env"
  mkdir -p "${VPS_ATTESTATION_STATE_DIR}"
  touch "${VPS_ATTESTATION_BACKEND_ENV}"
}

ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT
setup_fixture "$ROOT"
VERIFY_EXPECT="$SHA_A"
vps_attest_lock_acquire
vps_attest_record_deploy_success "$REL_DIR" "$SHA_A"
vps_attest_lock_release
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "deploy_record_and_read"
[[ "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")" == "$SHA_A" ]] && pass "mirror_updated"

# Idempotent same SHA
vps_attest_lock_acquire
vps_attest_record_deploy_success "$REL_DIR" "$SHA_A"
vps_attest_lock_release
pass "idempotent_same_sha"

# Verify failure blocks commit
ROOT2="$(mktemp -d)"
setup_fixture "$ROOT2"
export VPS_ATTESTATION_STATE_DIR="${ROOT2}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT2}/backend.env"
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=0
VERIFY_EXPECT="$SHA_B"
vps_replica_verify_post_deploy() { return 1; }
if vps_attest_record_deploy_success "$REL_DIR" "$SHA_B" 2>/dev/null; then
  fail "verify_failure_should_block"
fi
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
vps_attest_reader_is_committed 2>/dev/null && fail "no_commit_on_verify_fail"
pass "verify_failure_blocks_commit"

# Missing verify function when SKIP=0
ROOT3="$(mktemp -d)"
setup_fixture "$ROOT3"
export VPS_ATTESTATION_STATE_DIR="${ROOT3}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT3}/backend.env"
unset -f vps_replica_verify_post_deploy 2>/dev/null || true
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=0
if vps_attest_record_deploy_success "$REL_DIR" "$SHA_A" 2>/dev/null; then
  fail "missing_verify_should_fail"
fi
pass "missing_verify_fail_closed"
export VPS_ATTESTATION_SKIP_REPLICA_VERIFY=1
vps_replica_verify_post_deploy() { [[ "$2" == "$SHA_A" ]]; }

# Lock contention
ROOT4="$(mktemp -d)"
setup_fixture "$ROOT4"
export VPS_ATTESTATION_STATE_DIR="${ROOT4}/deploy-state"
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

# Corrupt checksum
export VPS_ATTESTATION_STATE_DIR="${ROOT}/deploy-state"
echo "x" >>"$(vps_attest_state_path)"
vps_attest_reader_is_committed 2>/dev/null && fail "corrupt_checksum"
pass "corrupt_checksum_fail_closed"

# Mirror failure
ROOT5="$(mktemp -d)"
setup_fixture "$ROOT5"
export VPS_ATTESTATION_STATE_DIR="${ROOT5}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT5}/backend.env"
export VPS_ATTESTATION_MIRROR_SIMULATE_FAIL=1
VERIFY_EXPECT="$SHA_B"
if vps_attest_record_deploy_success "$REL_DIR" "$SHA_B" 2>/dev/null; then
  fail "mirror_fail"
fi
unset VPS_ATTESTATION_MIRROR_SIMULATE_FAIL
vps_attest_reader_is_committed 2>/dev/null && fail "mirror_fail_no_commit"
pass "mirror_failure_no_commit"

# Resume after crash before state write
ROOT6="$(mktemp -d)"
setup_fixture "$ROOT6"
export VPS_ATTESTATION_STATE_DIR="${ROOT6}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT6}/backend.env"
VERIFY_EXPECT="$SHA_A"
export VPS_ATTESTATION_CRASH_HOOK=before_state_write
set +e
(
  vps_attest_record_deploy_success "$REL_DIR" "$SHA_A" >/dev/null 2>&1
) || true
set -e
export VPS_ATTESTATION_CRASH_HOOK=
vps_attest_reader_is_committed 2>/dev/null && fail "crash_before_state_not_committed"
vps_attest_resume_incomplete_deploy "$REL_DIR" "$SHA_A"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "resume_after_mirror"

# Rollback success / denied
ROOT7="$(mktemp -d)"
setup_fixture "$ROOT7"
export VPS_ATTESTATION_STATE_DIR="${ROOT7}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT7}/backend.env"
VERIFY_EXPECT="$SHA_A"
vps_attest_record_deploy_success "$REL_DIR" "$SHA_A"
VERIFY_EXPECT="$SHA_B"
vps_attest_record_rollback_success "$REL_DIR" "$SHA_B"
vps_attest_reader_is_rolled_back && pass "rollback_success"
VERIFY_EXPECT="$SHA_A"
vps_attest_record_deploy_success "$REL_DIR" "$SHA_A"
vps_attest_record_rollback_denied
[[ "$(vps_attest_state_read_kv STATUS)" == "COMMITTED" ]] && pass "rollback_denied_stays_committed"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "rollback_denied_keeps_sha"

# APDS non-interference
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
vps_attest_record_deploy_success "$REL_DIR" "$SHA_A"
grep -q "^APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}$" "${VPS_ATTESTATION_BACKEND_ENV}" && pass "apds_preserved"
grep -q '^KEEP=yes$' "${VPS_ATTESTATION_BACKEND_ENV}" && pass "env_preserved"

# Symlink env rejected
SYM="$(mktemp -d)/x.env"
ln -s /etc/hosts "$SYM"
vps_attest_mirror_deployed_git_sha "$SYM" "$SHA_A" 2>/dev/null && fail "symlink_env"
pass "symlink_rejected"

echo "ALL_CORE_TESTS_PASS"
