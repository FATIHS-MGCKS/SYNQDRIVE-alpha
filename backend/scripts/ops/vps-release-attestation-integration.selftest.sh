#!/usr/bin/env bash
# P4B16 R1B — deploy/rollback hook integration (offline; mocked replica verify).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

SHA_A='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
SHA_B='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
APDS_PIN='dddddddddddddddddddddddddddddddddddddddd'
REL_DIR="/tmp/p4b16-integration-release-fixture"

VERIFY_FAIL=0
VERIFY_EXPECT=""
VERIFY_CALLS=0
vps_replica_verify_post_deploy() {
  VERIFY_CALLS=$((VERIFY_CALLS + 1))
  local _rel=$1
  local sha=$2
  [[ "${VERIFY_FAIL:-0}" == "1" ]] && return 1
  [[ "$(echo "$sha" | tr '[:upper:]' '[:lower:]')" == "$(echo "$VERIFY_EXPECT" | tr '[:upper:]' '[:lower:]')" ]]
}

make_ops_tree() {
  local dest=$1
  local with_attest=${2:-1}
  mkdir -p "${dest}/lib"
  cp "${LIB_DIR}/vps-release-attestation-integration.lib.sh" "${dest}/lib/"
  if [[ "$with_attest" == "1" ]]; then
    cp "${LIB_DIR}/vps-release-attestation.lib.sh" "${dest}/lib/"
    cp "${LIB_DIR}/vps-release-attestation-env-mirror.lib.sh" "${dest}/lib/"
  fi
}

setup_fixture() {
  local root=$1
  export VPS_ATTESTATION_STATE_DIR="${root}/deploy-state"
  export VPS_ATTESTATION_BACKEND_ENV="${root}/backend.env"
  mkdir -p "${VPS_ATTESTATION_STATE_DIR}"
  touch "${VPS_ATTESTATION_BACKEND_ENV}"
}

source_integration() {
  local ops=$1
  # shellcheck source=lib/vps-release-attestation-integration.lib.sh
  source "${ops}/lib/vps-release-attestation-integration.lib.sh"
}

ROOT="$(mktemp -d)"
OPS="$(mktemp -d)"
trap 'rm -rf "${ROOT}" "${OPS}" "${OPS_LEGACY:-}"' EXIT
make_ops_tree "$OPS"
setup_fixture "$ROOT"
source_integration "$OPS"

# Successful deploy hook (post-verify contract)
VERIFY_EXPECT="$SHA_A"
VERIFY_CALLS=0
if ! vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_A"; then
  fail "deploy_publish_success"
fi
# shellcheck source=lib/vps-release-attestation.lib.sh
source "${OPS}/lib/vps-release-attestation.lib.sh"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "integration_deploy_success"
[[ "$VERIFY_CALLS" -ge 1 ]] && pass "integration_deploy_invokes_verify"

# Deploy verify failure inside attestation record → partial success RC 3, no commit
VERIFY_FAIL=1
VERIFY_EXPECT="$SHA_B"
GEN_BEFORE="$(vps_attest_state_read_kv GENERATION 2>/dev/null || echo 0)"
set +e
vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_B" >/dev/null
_rc=$?
set -e
[[ "$_rc" -eq 3 ]] || fail "deploy_verify_fail_rc3 expected 3 got ${_rc}"
pass "integration_deploy_verify_failure_rc3"
VERIFY_FAIL=0
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "integration_deploy_verify_failure_no_sha_change"
GEN_AFTER="$(vps_attest_state_read_kv GENERATION)"
[[ "$GEN_BEFORE" == "$GEN_AFTER" ]] && pass "integration_deploy_verify_failure_no_gen_bump"

# Attestation write failure (mirror metadata) → partial success; prior COMMITTED SHA unchanged
VERIFY_EXPECT="$SHA_B"
export VPS_ATTESTATION_MIRROR_METADATA_FAIL=1
set +e
vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_B" >/dev/null
_rc=$?
set -e
unset VPS_ATTESTATION_MIRROR_METADATA_FAIL
[[ "$_rc" -eq 3 ]] || fail "mirror_fail_rc3 expected 3 got ${_rc}"
pass "integration_attestation_write_failure_partial"
# Mirror failure may leave FAILED state; restore COMMITTED @ SHA_A for rollback tests
VERIFY_EXPECT="$SHA_A"
vps_attest_lock_acquire
vps_attest_record_deploy_success "$REL_DIR" "$SHA_A"
vps_attest_lock_release
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] || fail "restore_after_mirror_fail"

# Successful rollback hook
VERIFY_EXPECT="$SHA_B"
vps_attest_lock_acquire
vps_attest_record_deploy_success "$REL_DIR" "$SHA_B"
vps_attest_lock_release
VERIFY_CALLS=0
VERIFY_EXPECT="$SHA_A"
if ! vps_p4b16_publish_after_rollback_verify "$OPS" "$REL_DIR" "$SHA_A"; then
  fail "rollback_publish_success"
fi
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "integration_rollback_success"

# Denied rollback (no false publish)
VERIFY_EXPECT="$SHA_A"
GEN_BEFORE="$(vps_attest_state_read_kv GENERATION)"
vps_p4b16_on_rollback_denied "$OPS" "$REL_DIR"
GEN_AFTER="$(vps_attest_state_read_kv GENERATION)"
[[ "$GEN_BEFORE" == "$GEN_AFTER" ]] && pass "integration_rollback_denied_no_renewal"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "integration_rollback_denied_keeps_sha"

# Manual rollback path uses same publish helper (simulated)
VERIFY_EXPECT="$SHA_B"
vps_attest_lock_acquire
vps_attest_record_deploy_success "$REL_DIR" "$SHA_B"
vps_attest_lock_release
VERIFY_EXPECT="$SHA_A"
vps_p4b16_publish_after_rollback_verify "$OPS" "$REL_DIR" "$SHA_A" >/dev/null
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_A" ]] && pass "integration_manual_rollback_helper"

# Repeated same-SHA deploy via hook
VERIFY_CALLS=0
VERIFY_EXPECT="$SHA_A"
printf 'SYNQDRIVE_DEPLOYED_GIT_SHA=%s\n' "$SHA_B" >"${VPS_ATTESTATION_BACKEND_ENV}"
if ! vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_A"; then
  fail "repeat_same_sha_deploy"
fi
# shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
source "${OPS}/lib/vps-release-attestation-env-mirror.lib.sh"
[[ "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")" == "$SHA_A" ]] && pass "integration_repeat_same_sha_repairs_mirror"

# APDS pin unchanged
ROOT_APDS="$(mktemp -d)"
setup_fixture "$ROOT_APDS"
export VPS_ATTESTATION_STATE_DIR="${ROOT_APDS}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT_APDS}/backend.env"
cat >"${VPS_ATTESTATION_BACKEND_ENV}" <<EOF
SYNQDRIVE_DEPLOYED_GIT_SHA=${SHA_B}
APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}
KEEP=yes
EOF
VERIFY_EXPECT="$SHA_A"
vps_p4b16_publish_after_deploy_verify "$OPS" "$REL_DIR" "$SHA_A" >/dev/null
grep -q "^APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA=${APDS_PIN}$" "${VPS_ATTESTATION_BACKEND_ENV}" && pass "integration_apds_pin_unchanged"
rm -rf "$ROOT_APDS"

# Integration without core attestation lib → partial success RC 3 (not silent full success)
OPS_LEGACY="$(mktemp -d)"
make_ops_tree "$OPS_LEGACY" 0
set +e
vps_p4b16_publish_after_deploy_verify "$OPS_LEGACY" "$REL_DIR" "$SHA_A" >/dev/null
_legacy_rc=$?
set -e
[[ "$_legacy_rc" -eq 3 ]] || fail "integration_without_core_lib_rc3"
pass "integration_missing_core_lib_rc3"

echo "ALL_INTEGRATION_TESTS_PASS"
