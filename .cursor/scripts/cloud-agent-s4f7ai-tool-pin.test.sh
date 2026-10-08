#!/usr/bin/env bash
# EXP-021 S4F-7AI — bootstrap authority migration tests (no Production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/cloud-agent-s4f7ai-tool-pin.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-s4f7ai-tool-pin.lib.sh"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

CERTIFIED="$S4F7AI_CERTIFIED_TOOL_SHA"
Z2_SHA="715dea5648ebb862eeedfc30e7dc3d3cd57bb02c"
AH_EVIDENCE="${REPO_ROOT}/architecture/drivingintelligence/evidence/EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md"
AA_BOOTSTRAP="${SCRIPT_DIR}/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh"
AI_BOOTSTRAP="${SCRIPT_DIR}/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh"

make_evidence() {
  local sha="$1"
  local dup="${2:-}"
  cat >"${TMPDIR}/ev.md" <<EOF
| **\`NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA\`** | **\`${sha}\`** |
EOF
  if [[ -n "$dup" ]]; then
    echo "| **\`NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA\`** | **\`${dup}\`** |" >>"${TMPDIR}/ev.md"
  fi
}

echo "==> A/B read authoritative S4F-7AH evidence"
[[ -f "$AH_EVIDENCE" ]] || fail "missing AH evidence on main"
resolved="$(s4f7ai_read_sealed_tool_sha_from_evidence "$AH_EVIDENCE")"
[[ "$resolved" == "$CERTIFIED" ]] || fail "A/B seal read"
pass "A/B authoritative evidence"

echo "==> C AA.1 bootstrap still Z2-pinned"
grep -q 'EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md' "$AA_BOOTSTRAP" || fail "AA must reference Z2"
grep -q 's4f7aa_read_sealed_tool_sha_from_evidence' "$AA_BOOTSTRAP" || fail "AA must use Z2 reader"
! grep -q 'S4F7AH_POST_MERGE' "$AA_BOOTSTRAP" || fail "AA must not reference S4F-7AH evidence"
pass "C historical AA.1 unchanged"

echo "==> D missing evidence"
if s4f7ai_read_sealed_tool_sha_from_evidence "${TMPDIR}/missing.md" 2>"${TMPDIR}/d.err"; then
  fail "D should abort"
fi
grep -q 'S4F7AH_EVIDENCE_MISSING' "${TMPDIR}/d.err" || fail "D marker"
pass "D"

echo "==> E missing seal field"
printf 'no seal here\n' >"${TMPDIR}/empty.md"
if s4f7ai_read_sealed_tool_sha_from_evidence "${TMPDIR}/empty.md" 2>/dev/null; then fail "E"; fi
pass "E missing field"

echo "==> E2 duplicate seal field"
make_evidence "$CERTIFIED" "$CERTIFIED"
if s4f7ai_read_sealed_tool_sha_from_evidence "${TMPDIR}/ev.md" 2>"${TMPDIR}/e2.err"; then fail "E2"; fi
grep -q 'SEAL_FIELD_COUNT_2' "${TMPDIR}/e2.err" || fail "E2 marker"
pass "E2 duplicate field"

echo "==> F invalid sha"
make_evidence "not-a-valid-sha-xxxxxxxxxxxxxxxxxxxxxx"
if s4f7ai_read_sealed_tool_sha_from_evidence "${TMPDIR}/ev.md" 2>/dev/null; then fail "F"; fi
pass "F"

echo "==> G stale pin"
make_evidence "$CERTIFIED"
export TOOL_AUTHORITY_SHA="$Z2_SHA"
if s4f7ai_resolve_tool_sha_for_dispatch "${TMPDIR}/ev.md" "$REPO_ROOT" "" 2>"${TMPDIR}/g.err"; then
  fail "G"
fi
grep -q 'STALE_TOOL_PIN_ENV' "${TMPDIR}/g.err" || fail "G marker"
unset TOOL_AUTHORITY_SHA
pass "G"

echo "==> H/I blob parity at certified commit"
s4f7ai_verify_six_file_blob_parity_at_commit "$CERTIFIED" "$REPO_ROOT" || fail "H blobs at certified"
if s4f7ai_verify_six_file_blob_parity_at_commit "$Z2_SHA" "$REPO_ROOT" 2>"${TMPDIR}/i.err"; then
  fail "I should reject Z2 blobs"
fi
grep -q 'GIT_BLOB_MISMATCH' "${TMPDIR}/i.err" || fail "I marker"
pass "H/I blob parity"

echo "==> J/K local guards"
export DRY_RUN=0
if s4f7ai_assert_local_dispatch_guards 2>/dev/null; then fail "J local"; fi
unset DRY_RUN
export DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES
if s4f7ai_assert_local_dispatch_guards 2>/dev/null; then fail "K local"; fi
unset DI_S4F7Y_LIVE_STAGING_AUTHORIZED
pass "J/K"

echo "==> L/M/N operator path strings at certified commit"
s4f7ai_verify_db_clock_operator_paths "$REPO_ROOT" "$CERTIFIED" || fail "L/M/N paths"
pass "L/M/N db-clock + validator paths"

echo "==> O AA.1 regression"
bash "${SCRIPT_DIR}/cloud-agent-s4f7aa-tool-pin.test.sh"
pass "O AA.1 regression"

echo "==> bootstrap engineering local certification (no SSH)"
S4F7AI_SKIP_PRODUCTION_DISPATCH=1 S4F7AI_SKIP_DETACHED_FETCH=1 bash "$AI_BOOTSTRAP" | tee "${TMPDIR}/boot.out"
grep -q 'EXP021_S4F7AI_ENGINEERING_LOCAL_CERTIFICATION=PASS' "${TMPDIR}/boot.out" || fail "bootstrap local cert"
grep -q "SEALED_TOOL_SHA=${CERTIFIED}" "${TMPDIR}/boot.out" || fail "bootstrap sealed sha"
grep -q 'PRODUCTION_SSH_DISPATCH_EXECUTED=NO' "${TMPDIR}/boot.out" || fail "no ssh"
pass "bootstrap local slice"

echo "All cloud-agent-s4f7ai-tool-pin tests passed."
