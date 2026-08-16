#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_SCRIPT="$ROOT/scripts/audits/audit-dependencies.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

write_mock_npm() {
  local backend_exit="$1"
  local frontend_exit="$2"
  cat >"$TMP/npm" <<EOF
#!/usr/bin/env bash
set -eu
case "\${PWD}" in
  *"/backend")
    if [[ "\${1:-}" == "audit" ]]; then
      exit ${backend_exit}
    fi
    ;;
  *"/frontend")
    if [[ "\${1:-}" == "audit" ]]; then
      exit ${frontend_exit}
    fi
    ;;
esac
exec $(command -v npm) "\$@"
EOF
  chmod +x "$TMP/npm"
}

run_case() {
  local name="$1"
  local backend_exit="$2"
  local frontend_exit="$3"
  local expect_exit="$4"
  write_mock_npm "$backend_exit" "$frontend_exit"
  local log="$TMP/${name}.log"
  set +e
  PATH="$TMP:$PATH" bash "$AUDIT_SCRIPT" >"$log" 2>&1
  local actual_exit=$?
  set -e
  grep -q "Running dependency audit (backend)..." "$log"
  grep -q "Running dependency audit (frontend)..." "$log"
  if [[ "$actual_exit" -ne "$expect_exit" ]]; then
    echo "FAIL ${name}: expected exit ${expect_exit}, got ${actual_exit}"
    cat "$log"
    exit 1
  fi
  echo "PASS ${name}"
}

run_case backend_fail_frontend_pass 1 0 1
run_case backend_pass_frontend_fail 0 1 1
run_case backend_fail_frontend_fail 1 1 1
run_case backend_pass_frontend_pass 0 0 0

echo "DEPENDENCY_AUDIT_BOTH_SURFACES_ALWAYS_EXECUTED=true"
