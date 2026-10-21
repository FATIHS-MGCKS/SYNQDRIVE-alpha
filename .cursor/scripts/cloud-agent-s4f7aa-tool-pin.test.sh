#!/usr/bin/env bash
# EXP-021 S4F-7AA.1 — negative tests for S4F-7AA tool-pin lib (no Production).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/cloud-agent-s4f7aa-tool-pin.lib.sh
source "${SCRIPT_DIR}/lib/cloud-agent-s4f7aa-tool-pin.lib.sh"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

GOOD_SHA="715dea5648ebb862eeedfc30e7dc3d3cd57bb02c"
BAD_SHA="11b4a80ccb88d1d6f747399f84667b06c9a71050"

cat >"${TMPDIR}/z2-good.md" <<EOF
| **\`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA\`** | **\`${GOOD_SHA}\`** |
EOF

cat >"${TMPDIR}/z2-bad.md" <<'EOF'
| broken row without sha |
EOF

echo "==> read sealed sha"
[[ "$(s4f7aa_read_sealed_tool_sha_from_evidence "${TMPDIR}/z2-good.md")" == "$GOOD_SHA" ]] || fail "read good seal"
if s4f7aa_read_sealed_tool_sha_from_evidence "${TMPDIR}/z2-bad.md" 2>/dev/null; then
  fail "bad evidence should not parse"
fi
pass "read sealed sha"

echo "==> stale pin detection"
export TOOL_AUTHORITY_SHA="$BAD_SHA"
if s4f7aa_resolve_tool_sha_for_dispatch "${TMPDIR}/z2-good.md" 2>"${TMPDIR}/stale.err"; then
  fail "stale TOOL_AUTHORITY_SHA should fail closed"
fi
grep -q 'STALE_TOOL_PIN_ENV' "${TMPDIR}/stale.err" || fail "stale error marker"
pass "stale TOOL_AUTHORITY_SHA rejected"

unset TOOL_AUTHORITY_SHA
export EXPECTED_FRESH_TINY_STAGING_TOOL_SHA="$GOOD_SHA"
sealed="$(s4f7aa_read_sealed_tool_sha_from_evidence "${TMPDIR}/z2-good.md")"
s4f7aa_collect_stale_tool_pin_violations "$sealed" >/dev/null || fail "matching pin should not be stale"
s4f7aa_clear_tool_pin_env
[[ "$sealed" == "$GOOD_SHA" ]] || fail "sealed read"
[[ -z "${EXPECTED_FRESH_TINY_STAGING_TOOL_SHA:-}" ]] || fail "env should be cleared in parent shell"
pass "matching pin clears env in parent"

echo "==> local dispatch guards"
export DRY_RUN=0
if s4f7aa_assert_local_dispatch_guards 2>/dev/null; then fail "DRY_RUN=0 local"; fi
unset DRY_RUN
export DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES
if s4f7aa_assert_local_dispatch_guards 2>/dev/null; then fail "live auth local"; fi
unset DI_S4F7Y_LIVE_STAGING_AUTHORIZED
s4f7aa_assert_local_dispatch_guards || fail "clean local guards"
pass "local dispatch guards"

echo "All cloud-agent-s4f7aa-tool-pin tests passed."
