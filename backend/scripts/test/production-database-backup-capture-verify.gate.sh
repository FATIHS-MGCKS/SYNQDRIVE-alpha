#!/usr/bin/env bash
# Unit gate: production-database-backup-capture-verify.py (PG16 plain + legacy connect paths).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERIFY_PY="${ROOT}/scripts/ops/lib/production-database-backup-capture-verify.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log() { printf '[backup-capture-verify-gate] %s\n' "$*"; }
fail() { echo "!! FAIL: $*" >&2; exit 1; }

run_verify() {
  python3 "$VERIFY_PY" "$1" "$2" "$3"
}

expect_ok() {
  local out
  out="$(run_verify "$1" "$2" "$3")"
  [[ "${out%%|*}" == "OK" ]] || fail "expected OK got: $out"
}

expect_fail() {
  local out
  out="$(run_verify "$1" "$2" "$3")"
  [[ "${out%%|*}" == "FAIL" ]] || fail "expected FAIL got: $out"
}

CAP="${TMP}/capture.json"
DUMP="${TMP}/dump.sql.gz"
echo '{"dbname":"synqdrive","db_oid":"12345","server_port":5432}' > "$CAP"

log 'PG16 plain dump without connect directives accepts via capture sidecar proof'
printf '%s\n' '-- PostgreSQL database dump' '\restrict synqdrive' | gzip -c > "$DUMP"
out="$(run_verify "$CAP" "$DUMP" synqdrive)"
[[ "${out%%|*}" == "OK" ]] || fail "$out"
[[ "$out" == *capture_sidecar_pg16_plain* ]] || fail "missing pg16 proof marker: $out"

log 'legacy dump with connect synqdrive'
printf '%s\n' '\connect synqdrive' | gzip -c > "$DUMP"
expect_ok "$CAP" "$DUMP" synqdrive

log 'reject wrong expected database name'
expect_fail "$CAP" "$DUMP" other_db

log 'reject capture sidecar missing db_oid'
echo '{"dbname":"synqdrive","server_port":5432}' > "${TMP}/bad-cap.json"
expect_fail "${TMP}/bad-cap.json" "$DUMP" synqdrive

log 'reject dump connecting to foreign database'
printf '%s\n' '\connect evil_db' | gzip -c > "$DUMP"
expect_fail "$CAP" "$DUMP" synqdrive

log 'reject unreadable dump file'
echo 'not a gzip stream' > "$DUMP"
expect_fail "$CAP" "$DUMP" synqdrive

log 'ALL backup-capture-verify gate checks PASS'
