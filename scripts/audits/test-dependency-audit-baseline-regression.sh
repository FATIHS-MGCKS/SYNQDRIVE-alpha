#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPARE="$ROOT/scripts/audits/compare-dependency-audit-baseline.js"
FIXTURES="$ROOT/scripts/audits/fixtures/dependency-audit"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$FIXTURES"

write_fixture() {
  local name="$1"
  shift
  printf '%s\n' "$@" >"$FIXTURES/${name}.json"
}

write_fixture base-empty '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'
write_fixture pr-empty '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'

write_fixture base-one-high '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"lodash":{"name":"lodash","severity":"high","isDirect":false,"via":[{"source":1115806,"name":"lodash","url":"https://github.com/advisories/GHSA-xxjr-mmjv-4gpg","severity":"high","range":"<=4.17.23"}],"range":"<=4.17.23","nodes":["node_modules/lodash"]}}}'
write_fixture pr-one-high "$(
  cat "$FIXTURES/base-one-high.json"
)"

write_fixture pr-add-high '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"multer":{"name":"multer","severity":"high","isDirect":true,"via":[{"source":1113635,"name":"multer","url":"https://github.com/advisories/GHSA-xf7r-hgr6-v32p","severity":"high","range":"<=2.1.1"}],"range":"<=2.1.1","nodes":["node_modules/multer"]}}}'

write_fixture pr-add-critical '{"metadata":{"vulnerabilities":{"high":0,"critical":1}},"vulnerabilities":{"pkg":{"name":"pkg","severity":"critical","isDirect":false,"via":[{"source":9999999,"name":"pkg","url":"https://github.com/advisories/GHSA-critical-test","severity":"critical","range":"<1.0.0"}],"range":"<1.0.0","nodes":["node_modules/pkg"]}}}'

write_fixture base-high-only '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"pkg":{"name":"pkg","severity":"high","isDirect":false,"via":[{"source":8888888,"name":"pkg","url":"https://github.com/advisories/GHSA-escalate-test","severity":"high","range":"<1.0.0"}],"range":"<1.0.0","nodes":["node_modules/pkg"]}}}'
write_fixture pr-critical-same-advisory '{"metadata":{"vulnerabilities":{"high":0,"critical":1}},"vulnerabilities":{"pkg":{"name":"pkg","severity":"critical","isDirect":false,"via":[{"source":8888888,"name":"pkg","url":"https://github.com/advisories/GHSA-escalate-test","severity":"critical","range":"<1.0.0"}],"range":"<1.0.0","nodes":["node_modules/pkg"]}}}'

write_fixture base-direct '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'
write_fixture pr-new-direct '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"directpkg":{"name":"directpkg","severity":"high","isDirect":true,"via":[{"source":7777777,"name":"directpkg","url":"https://github.com/advisories/GHSA-direct-test","severity":"high","range":"<2.0.0"}],"range":"<2.0.0","nodes":["node_modules/directpkg"]}}}'

run_compare() {
  local expect_exit="$1"
  shift
  set +e
  node "$COMPARE" "$@" >"$TMP/out.log" 2>&1
  local actual_exit=$?
  set -e
  if [[ "$actual_exit" -ne "$expect_exit" ]]; then
    echo "FAIL expected exit ${expect_exit}, got ${actual_exit}"
    cat "$TMP/out.log"
    exit 1
  fi
  echo "PASS exit=${expect_exit} $*"
}

# 1. PR equals base => PASS
run_compare 0 \
  --base-backend "$FIXTURES/base-one-high.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-one-high.json" \
  --pr-frontend "$FIXTURES/pr-empty.json"

# 2. PR removes one High => PASS
run_compare 0 \
  --base-backend "$FIXTURES/base-one-high.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/base-empty.json" \
  --pr-frontend "$FIXTURES/pr-empty.json"

# 3. PR adds new High => FAIL
run_compare 1 \
  --base-backend "$FIXTURES/base-empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-add-high.json" \
  --pr-frontend "$FIXTURES/pr-empty.json"

# 4. PR adds new Critical => FAIL
run_compare 1 \
  --base-backend "$FIXTURES/base-empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-add-critical.json" \
  --pr-frontend "$FIXTURES/pr-empty.json"

# 5. existing High escalates to Critical => FAIL
run_compare 1 \
  --base-backend "$FIXTURES/base-high-only.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-critical-same-advisory.json" \
  --pr-frontend "$FIXTURES/pr-empty.json"

# 6. same advisory adds new vulnerable direct dependency => FAIL
run_compare 1 \
  --base-backend "$FIXTURES/base-direct.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-new-direct.json" \
  --pr-frontend "$FIXTURES/pr-empty.json"

# 7. malformed/missing audit JSON => FAIL CLOSED
set +e
node "$COMPARE" \
  --base-backend "$FIXTURES/does-not-exist.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-empty.json" \
  --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/missing.log" 2>&1
missing_exit=$?
set -e
if [[ "$missing_exit" -ne 2 ]]; then
  echo "FAIL missing JSON expected exit 2, got ${missing_exit}"
  cat "$TMP/missing.log"
  exit 1
fi
echo "PASS exit=2 missing JSON fail-closed"

# 8. base audit command fails => FAIL CLOSED (simulated by empty file)
: >"$TMP/empty.json"
set +e
node "$COMPARE" \
  --base-backend "$TMP/empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-empty.json" \
  --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/empty.log" 2>&1
empty_exit=$?
set -e
if [[ "$empty_exit" -ne 2 ]]; then
  echo "FAIL empty JSON expected exit 2, got ${empty_exit}"
  cat "$TMP/empty.log"
  exit 1
fi
echo "PASS exit=2 empty JSON fail-closed"

# 9. PR audit command fails => FAIL CLOSED (simulated by invalid JSON)
printf 'not-json' >"$TMP/bad.json"
set +e
node "$COMPARE" \
  --base-backend "$FIXTURES/base-empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$TMP/bad.json" \
  --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/bad.log" 2>&1
bad_exit=$?
set -e
if [[ "$bad_exit" -ne 2 ]]; then
  echo "FAIL invalid JSON expected exit 2, got ${bad_exit}"
  cat "$TMP/bad.log"
  exit 1
fi
echo "PASS exit=2 invalid JSON fail-closed"

echo "SECURITY_GATE_TESTS=9"
echo "SECURITY_GATE_FALSE_ACCEPTANCES=0"
