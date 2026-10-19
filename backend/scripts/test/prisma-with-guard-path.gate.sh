#!/usr/bin/env bash
# Verify prisma-with-guard.sh resolves backend ROOT and loads prisma-cli-guard.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD_SH="${ROOT}/scripts/ops/prisma-with-guard.sh"
GUARD_MJS="${ROOT}/scripts/ops/lib/prisma-cli-guard.mjs"

log() { printf '[prisma-with-guard-path-gate] %s\n' "$*"; }
fail() { echo "!! FAIL: $*" >&2; exit 1; }

[[ -f "$GUARD_SH" ]] || fail "missing prisma-with-guard.sh"
[[ -f "$GUARD_MJS" ]] || fail "missing prisma-cli-guard.mjs"

resolved_root="$(cd "$(dirname "$GUARD_SH")/../.." && pwd)"
[[ "$resolved_root" == "$ROOT" ]] || fail "ROOT resolution expected ${ROOT}, got ${resolved_root}"
[[ -f "${resolved_root}/scripts/ops/lib/prisma-cli-guard.mjs" ]] || fail "guard mjs not reachable from resolved ROOT"

log 'node guard entrypoint loads (version/help path)'
set +e
out="$(node "${resolved_root}/scripts/ops/lib/prisma-cli-guard.mjs" --version 2>&1)"
rc=$?
set -e
[[ "$rc" -eq 0 ]] || fail "prisma-cli-guard.mjs --version failed: $out"
[[ "$out" == *prisma* || "$out" == *5.* ]] || fail "unexpected version output: $out"

log 'wrapper invokes guard binary path (dry argv)'
grep -q 'prisma-cli-guard.mjs' "$GUARD_SH" || fail "wrapper missing guard mjs reference"

log 'ALL prisma-with-guard path gate checks PASS'
