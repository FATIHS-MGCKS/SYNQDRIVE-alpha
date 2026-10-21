#!/usr/bin/env bash
# Offline tests for VO5C Cloud Agent fixed VPS bootstrap (no SSH/production).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${ROOT}/../../.." && pwd)"
# shellcheck source=lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh
source "${ROOT}/lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh"
# shellcheck source=lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh
source "${ROOT}/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

SD_ROOT="$(mktemp -d)"
SHARED="${SD_ROOT}/synqdrive/shared"
mkdir -p "$SHARED"
trap 'rm -rf "$SD_ROOT"' EXIT

export VO5C_CLOUD_AGENT_BOOTSTRAP_TEST_SKIP_OWNER=1
export VO5C_OPERATOR_SESSION_TEST_SKIP_OWNER=1
export VO5C_OPERATOR_SESSION_TEST_SKIP_PATH_ROOT=1
export VO5C_OPERATOR_SESSION_TEST_PATH_ROOT="${SD_ROOT}/synqdrive"

VO5C_CLOUD_AGENT_BOOTSTRAP_PATH="${SHARED}/vo5c-cloud-agent-pinned-deploy-bootstrap.sh"
VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB="${SHARED}/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh"
VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST="${SHARED}/vo5c-cloud-agent-pinned-deploy-bootstrap.manifest.env"
VO5C_CLOUD_AGENT_PIN_ENV="${SHARED}/vo5c-pinned-executor.env"
VO5C_CLOUD_AGENT_OPERATOR_SESSION="${SHARED}/vo5c-operator-deploy-session.env"
VO5C_CLOUD_AGENT_AUTHORITY_ENV="${SHARED}/vo5c-production-deploy-authority.env"
VO5C_CLOUD_AGENT_ENFORCEMENT_ARMED="${SHARED}/vo5c-production-deploy-enforcement-armed"
VO5C_CLOUD_AGENT_STAGED_ROOT="${SD_ROOT}/synqdrive/staging-release"
export VO5C_CLOUD_AGENT_BOOTSTRAP_PATH VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST
export VO5C_CLOUD_AGENT_PIN_ENV VO5C_CLOUD_AGENT_OPERATOR_SESSION
export VO5C_CLOUD_AGENT_AUTHORITY_ENV VO5C_CLOUD_AGENT_ENFORCEMENT_ARMED VO5C_CLOUD_AGENT_STAGED_ROOT

HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
WT_PIN="$(mktemp -d)"
git -C "$REPO_ROOT" worktree add --detach "$WT_PIN" "$HEAD_SHA" >/dev/null
trap 'git -C "$REPO_ROOT" worktree remove --force "$WT_PIN" 2>/dev/null || rm -rf "$WT_PIN"; rm -rf "$SD_ROOT"' EXIT

install_bootstrap_bundle() {
  cp "${ROOT}/vo5c-cloud-agent-pinned-deploy-bootstrap.sh" "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"
  cp "${ROOT}/lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh" "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB"
  chmod 750 "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"
  chmod 600 "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB"
  export VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH="$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"
  bash "${ROOT}/vo5c-cloud-agent-pinned-deploy-bootstrap-write-manifest.sh" \
    "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH" "$VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB" \
    "$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST" "$WT_PIN" "$HEAD_SHA" >/dev/null
}

write_session() {
  local sha=$1
  local until=$(( $(date -u +%s) + 600 ))
  cat >"$VO5C_CLOUD_AGENT_OPERATOR_SESSION" <<EOF
SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
AUTHORIZED_REQUESTED_SHA=${sha}
AUTHORIZED_UNTIL_EPOCH=${until}
EOF
  chmod 600 "$VO5C_CLOUD_AGENT_OPERATOR_SESSION"
}

setup_pin_and_auth() {
  cat >"$VO5C_CLOUD_AGENT_PIN_ENV" <<EOF
SYNQDRIVE_PINNED_EXECUTOR_ROOT=${WT_PIN}
SYNQDRIVE_PINNED_EXECUTOR_SHA=${HEAD_SHA}
EOF
  echo 'VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=0' >"$VO5C_CLOUD_AGENT_AUTHORITY_ENV"
  write_session "$HEAD_SHA"
}

set +e
vo5c_cloud_agent_bootstrap_verify_shared_installation >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -ne 0 ]] && pass bootstrap_missing_fail_closed

install_bootstrap_bundle
setup_pin_and_auth
vo5c_cloud_agent_bootstrap_verify_shared_installation && pass bootstrap_integrity_ok
vo5c_cloud_agent_bootstrap_verify_pinned_libraries "$WT_PIN" "$HEAD_SHA" && pass pinned_library_integrity_ok

printf 'tamper\n' >>"${WT_PIN}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"
set +e
vo5c_cloud_agent_bootstrap_verify_pinned_libraries "$WT_PIN" "$HEAD_SHA" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 45 ]] && pass pinned_impl_tamper_reject
git -C "$WT_PIN" checkout -- backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh

NEG_MARKER="${SD_ROOT}/neg_presource_sourced.marker"
rm -f "$NEG_MARKER"
FLOOR_LIB="${WT_PIN}/backend/scripts/ops/lib/vps-vo5c-security-floor.lib.sh"
{
  echo ": >\"${NEG_MARKER}\" # vo5c_neg_test_presource"
  cat "$FLOOR_LIB"
} >"${FLOOR_LIB}.tampered"
mv "${FLOOR_LIB}.tampered" "$FLOOR_LIB"
set +e
vo5c_cloud_agent_bootstrap_verify_pinned_libraries "$WT_PIN" "$HEAD_SHA" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 45 ]] || fail "security_floor_tamper expected exit 45 got ${rc}"
[[ ! -f "$NEG_MARKER" ]] || fail "security_floor_tamper executed before rejection"
pass pinned_security_floor_tamper_reject_presource
git -C "$WT_PIN" checkout -- backend/scripts/ops/lib/vps-vo5c-security-floor.lib.sh
rm -f "$NEG_MARKER"

rm -f "$NEG_MARKER"
ADMISSION_LIB="${WT_PIN}/backend/scripts/ops/lib/vps-vo5c-deploy-admission.lib.sh"
{
  echo ": >\"${NEG_MARKER}\" # vo5c_neg_test_presource"
  cat "$ADMISSION_LIB"
} >"${ADMISSION_LIB}.tampered"
mv "${ADMISSION_LIB}.tampered" "$ADMISSION_LIB"
set +e
vo5c_cloud_agent_bootstrap_verify_pinned_libraries "$WT_PIN" "$HEAD_SHA" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 45 ]] || fail "admission_tamper expected exit 45 got ${rc}"
[[ ! -f "$NEG_MARKER" ]] || fail "admission_tamper executed before rejection"
pass pinned_admission_tamper_reject_presource
git -C "$WT_PIN" checkout -- backend/scripts/ops/lib/vps-vo5c-deploy-admission.lib.sh
rm -f "$NEG_MARKER"

install_bootstrap_bundle
echo 'VO5C_CLOUD_AGENT_BOOTSTRAP_SHA256=0000000000000000000000000000000000000000000000000000000000000000' >"$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
echo "VO5C_CLOUD_AGENT_BOOTSTRAP_VERIFY_LIB_SHA256=0000000000000000000000000000000000000000000000000000000000000000" >>"$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
echo "VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALLED_FROM_COMMIT=${HEAD_SHA}" >>"$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
echo 'VO5C_CLOUD_AGENT_PINNED_IMPL_SHA256=0000000000000000000000000000000000000000000000000000000000000000' >>"$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
echo 'VO5C_CLOUD_AGENT_PINNED_SESSION_LIB_SHA256=0000000000000000000000000000000000000000000000000000000000000000' >>"$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
echo 'VO5C_CLOUD_AGENT_BOOTSTRAP_VERSION=2' >>"$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
chmod 600 "$VO5C_CLOUD_AGENT_BOOTSTRAP_MANIFEST"
set +e
vo5c_cloud_agent_bootstrap_verify_shared_installation >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 45 ]] && pass manifest_mismatch_reject
install_bootstrap_bundle

chmod 644 "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"
set +e
vo5c_bootstrap_verify_root_owned_no_world_access "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH" "750" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -ne 0 ]] && pass bootstrap_mode_reject
chmod 750 "$VO5C_CLOUD_AGENT_BOOTSTRAP_PATH"

vo5c_cloud_agent_invoke_pinned_runner_hook() {
  echo "MOCK_PINNED_RUNNER_OK"
  return 0
}

out="$(vo5c_cloud_agent_run_pinned_deploy "$HEAD_SHA" 2>&1)"
echo "$out" | grep -q MOCK_PINNED_RUNNER_OK && pass bootstrap_pinned_execution_ok

rm -f "$VO5C_CLOUD_AGENT_OPERATOR_SESSION"
set +e
vo5c_cloud_agent_run_pinned_deploy "$HEAD_SHA" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 42 ]] && pass bootstrap_missing_session_exit_42

write_session "$HEAD_SHA"
SHA_BAD='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
set +e
vo5c_cloud_agent_run_pinned_deploy "$SHA_BAD" >/dev/null 2>&1
rc=$?
set -e
[[ "$rc" -eq 42 ]] && pass bootstrap_wrong_requested_sha_exit_42

echo "ALL_VO5C_CLOUD_AGENT_BOOTSTRAP_SELFTEST_PASS"
