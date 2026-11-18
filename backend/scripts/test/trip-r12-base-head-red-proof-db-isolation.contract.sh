#!/usr/bin/env bash
# Contract tests for trip-r12-base-head-red-proof-db-isolation (no database mutations).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail_infra() {
  echo "unexpected fail_infra: $*" >&2
  exit 99
}

# shellcheck source=lib/trip-r12-base-head-red-proof-db-isolation.lib.sh
source "${SCRIPT_DIR}/lib/trip-r12-base-head-red-proof-db-isolation.lib.sh"
trip_r12_bh_db_isolation_init "${SCRIPT_DIR}/../.." "test_trip_r12_contract" "contract"

failures=0

assert_rejects() {
  local name=$1
  shift
  if ( "$@" ); then
    echo "FAIL: expected rejection for ${name}"
    failures=$((failures + 1))
  else
    echo "OK: rejected ${name}"
  fi
}

assert_accepts() {
  local name=$1
  shift
  if ( "$@" ); then
    echo "OK: accepted ${name}"
  else
    echo "FAIL: expected acceptance for ${name}"
    failures=$((failures + 1))
  fi
}

assert_f1_rejects() {
  local name=$1
  local url=$2
  local role="${3:-parent}"
  assert_rejects "$name" bash -c '
    fail_infra() { exit 99; }
    source "'"${SCRIPT_DIR}"'/lib/trip-r12-base-head-red-proof-db-isolation.lib.sh"
    trip_r12_bh_db_isolation_init "'"${SCRIPT_DIR}"'/../.." "test_trip_r12_contract" "contract"
    trip_r12_bh_assert_ci_local_postgres_url "$1" "CONTRACT" "$2"
  ' _ "$url" "$role"
}

assert_f1_accepts() {
  local name=$1
  local url=$2
  local role="${3:-parent}"
  assert_accepts "$name" bash -c '
    fail_infra() { exit 99; }
    source "'"${SCRIPT_DIR}"'/lib/trip-r12-base-head-red-proof-db-isolation.lib.sh"
    trip_r12_bh_db_isolation_init "'"${SCRIPT_DIR}"'/../.." "test_trip_r12_contract" "contract"
    trip_r12_bh_assert_ci_local_postgres_url "$1" "CONTRACT" "$2"
  ' _ "$url" "$role"
}

# F1 — strict host validation (negative)
assert_f1_rejects "remote host (localhost in query)" \
  "postgresql://u:p@db.evil.example:5432/synqdrive_ci_ephemeral?schema=public&noise=localhost"
assert_f1_rejects "remote host (localhost in password)" \
  "postgresql://u:localhost@db.evil.example:5432/synqdrive_ci_ephemeral?schema=public"
assert_f1_rejects "remote host (localhost as database name)" \
  "postgresql://u:p@db.evil.example:5432/localhost?schema=public"
assert_f1_rejects "production host fragment" \
  "postgresql://u:p@127.0.0.1:5432/synqdrive_ci_ephemeral?schema=public&via=srv1374778.hstgr.cloud"
assert_f1_rejects "malformed URL" "not-a-url"
assert_f1_rejects "non-postgres scheme" "mysql://u:p@127.0.0.1:5432/synqdrive_ci_ephemeral"
assert_f1_rejects "disallowed parent database name" \
  "postgresql://u:p@127.0.0.1:5432/synqdrive?schema=public"
assert_f1_rejects "invalid probe database name" \
  "postgresql://u:p@127.0.0.1:5432/random_probe_db?schema=public" probe

# F1 — positive
assert_f1_accepts "CI localhost 127.0.0.1 parent" \
  "postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_ci_ephemeral?schema=public"
assert_f1_accepts "CI localhost hostname parent" \
  "postgresql://synqdrive:synqdrive@localhost:5432/test_runner?schema=public"
assert_f1_accepts "CI probe name" \
  "postgresql://synqdrive:synqdrive@127.0.0.1:5432/test_trip_r12_contract_base_contract_1?schema=public" probe

# F2 — drop refused (no mutations)
assert_rejects "foreign probe database drop" bash -c '
  fail_infra() { exit 99; }
  source "'"${SCRIPT_DIR}"'/lib/trip-r12-base-head-red-proof-db-isolation.lib.sh"
  trip_r12_bh_db_isolation_init "'"${SCRIPT_DIR}"'/../.." "test_trip_r12_contract" "contract"
  trip_r12_bh_release_probe_database "not_our_database"
'
assert_rejects "production-like database drop" bash -c '
  fail_infra() { exit 99; }
  source "'"${SCRIPT_DIR}"'/lib/trip-r12-base-head-red-proof-db-isolation.lib.sh"
  trip_r12_bh_db_isolation_init "'"${SCRIPT_DIR}"'/../.." "test_trip_r12_contract" "contract"
  trip_r12_bh_release_probe_database "synqdrive"
'

# F2 — parent-shell registration (no subshell state loss)
TRIP_R12_BH_CREATED_DB_NAMES=()
(
  TRIP_R12_BH_CREATED_DB_NAMES+=("lost_in_subshell")
)
if ((${#TRIP_R12_BH_CREATED_DB_NAMES[@]} != 0)); then
  echo "FAIL: subshell mutated parent CREATED_DB_NAMES"
  failures=$((failures + 1))
else
  echo "OK: subshell does not mutate parent CREATED_DB_NAMES"
fi

TRIP_R12_BH_CREATED_DB_NAMES=()
TRIP_R12_BH_CREATED_DB_NAMES+=("registered_in_parent")
if ((${#TRIP_R12_BH_CREATED_DB_NAMES[@]} != 1)); then
  echo "FAIL: parent registration not preserved"
  failures=$((failures + 1))
else
  echo "OK: parent registration preserved"
fi

# F2 — idempotent leave without active scope
assert_accepts "probe_scope_leave idempotent" trip_r12_bh_probe_scope_leave

if [[ "$failures" -gt 0 ]]; then
  echo "trip-r12-base-head-red-proof-db-isolation contract: ${failures} failure(s)" >&2
  exit 1
fi

echo "trip-r12-base-head-red-proof-db-isolation contract: OK"