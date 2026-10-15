#!/usr/bin/env bash
# Contract tests for vsi03-p2c-postgres-guard (no database mutations).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vsi03-p2c-postgres-guard.sh
source "${SCRIPT_DIR}/lib/vsi03-p2c-postgres-guard.sh"

failures=0

assert_rejects() {
  local name=$1
  shift
  if ( "$@" >/dev/null 2>&1 ); then
    echo "FAIL: expected rejection for ${name}"
    failures=$((failures + 1))
  else
    echo "OK: rejected ${name}"
  fi
}

assert_accepts() {
  local name=$1
  shift
  if ( "$@" >/dev/null 2>&1 ); then
    echo "OK: accepted ${name}"
  else
    echo "FAIL: expected acceptance for ${name}"
    failures=$((failures + 1))
  fi
}

assert_rejects "production database name" vsi03_p2c_assert_safe_database_name synqdrive
assert_rejects "invalid characters" vsi03_p2c_assert_safe_database_name 'vsi03_test_;drop'
assert_rejects "wrong prefix" vsi03_p2c_assert_safe_database_name b1_h3_ephemeral
assert_accepts "disposable name" vsi03_p2c_assert_safe_database_name vsi03_test_ci

assert_rejects "production host" vsi03_p2c_assert_safe_host app.synqdrive.eu
assert_rejects "remote host" vsi03_p2c_assert_safe_host db.example.com
assert_accepts "localhost" vsi03_p2c_assert_safe_host 127.0.0.1
assert_accepts "ci service host" vsi03_p2c_assert_safe_host postgres

assert_rejects "prod database in target" vsi03_p2c_assert_disposable_target 127.0.0.1 synqdrive 'postgresql://u@127.0.0.1/synqdrive'
assert_rejects "prod-like url host" vsi03_p2c_assert_disposable_target app.synqdrive.eu vsi03_test_ci 'postgresql://u@app.synqdrive.eu/vsi03_test_ci'
assert_accepts "disposable target" vsi03_p2c_assert_disposable_target 127.0.0.1 vsi03_test_ci 'postgresql://u@127.0.0.1/vsi03_test_ci'

assert_accepts "admin postgres" vsi03_p2c_assert_safe_admin_database_name postgres
assert_rejects "admin synqdrive" vsi03_p2c_assert_safe_admin_database_name synqdrive

if [[ "${failures}" -gt 0 ]]; then
  echo "vsi03-p2c-postgres-guard contract: ${failures} failure(s)" >&2
  exit 1
fi

echo "vsi03-p2c-postgres-guard contract: all checks passed"
