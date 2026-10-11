#!/usr/bin/env bash
# R2.7b — Offline abort/restore injection (mock nginx/systemctl; no production).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
MOCK_BIN="$TMP/bin"
SITE="$TMP/nginx-site.conf"
BACKUP="$TMP/golden.bak"
RESULT="$TMP/result.env"
MAINT="$TMP/maintenance.conf"
export PATH="$MOCK_BIN:$PATH"
export VO5C_NGINX_CMD="$MOCK_BIN/nginx"
export VO5C_SYSTEMCTL_CMD="$MOCK_BIN/systemctl"

mkdir -p "$MOCK_BIN"
# shellcheck source=../lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

cat >"$BACKUP" <<'EOF'
upstream synqdrive_backend { server 127.0.0.1:3001; server 127.0.0.1:3002; }
server { location / { proxy_pass http://synqdrive_backend; } }
EOF
cp -a "$BACKUP" "$SITE"
vo5c_emit_phase1_maintenance_nginx_file synqdrive_backend /api/v1/webhooks/dimo >"$MAINT"

cat >"$MOCK_BIN/nginx" <<'SH'
#!/usr/bin/env bash
[[ "${1:-}" == "-t" ]] && exit 0
exit 0
SH
cat >"$MOCK_BIN/systemctl" <<'SH'
#!/usr/bin/env bash
[[ "${1:-}" == "reload" && "${2:-}" == "nginx" ]] && exit 0
exit 1
SH
chmod +x "$MOCK_BIN/nginx" "$MOCK_BIN/systemctl"

# shellcheck source=../lib/vps-vo5c-orchestrator-abort.lib.sh
source "$ROOT/lib/vps-vo5c-orchestrator-abort.lib.sh"

assert_restored() {
  local sum_b sum_s
  sum_b="$(cksum "$BACKUP" | awk '{print $1}')"
  sum_s="$(cksum "$SITE" | awk '{print $1}')"
  [[ "$sum_b" == "$sum_s" ]] || { echo "FAIL site not restored"; exit 1; }
}

assert_result_contains() {
  grep -q "$1" "$RESULT" || { echo "FAIL missing result line: $1"; cat "$RESULT"; exit 1; }
}

run_case_explicit_exit() {
  : >"$RESULT"
  cp -a "$MAINT" "$SITE"
  (
    vo5c_abort_init "$SITE" "$BACKUP" "$RESULT"
    vo5c_abort_mark_nginx_mutation_begun
    vo5c_abort_mark_maintenance_reloaded
    echo "PHASE1=PASS" >>"$RESULT"
    echo "BACKUP_CREATED=/tmp/x.sql.gz" >>"$RESULT"
    vo5c_abort_fail "backup_empty"
  ) || true
  assert_restored
  assert_result_contains "PUBLIC_TRAFFIC_RESTORED=YES"
  assert_result_contains "CRITICAL_ERRORS=backup_empty"
  echo "PASS explicit_exit backup_empty path"
}

run_case_double_restore_idempotent() {
  : >"$RESULT"
  cp -a "$MAINT" "$SITE"
  vo5c_abort_init "$SITE" "$BACKUP" "$RESULT"
  vo5c_abort_mark_nginx_mutation_begun
  vo5c_abort_restore_idempotent
  vo5c_abort_restore_idempotent
  assert_restored
  assert_result_contains "PUBLIC_TRAFFIC_RESTORED=YES"
  vo5c_abort_disable_traps
  echo "PASS idempotent double restore"
}

run_case_sigterm() {
  : >"$RESULT"
  cp -a "$MAINT" "$SITE"
  (
    vo5c_abort_init "$SITE" "$BACKUP" "$RESULT"
    vo5c_abort_mark_nginx_mutation_begun
    sleep 60
  ) &
  pid=$!
  sleep 0.3
  kill -TERM "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || ec=$?
  assert_restored
  assert_result_contains "ORCHESTRATOR_SIGNAL=TERM"
  echo "PASS SIGTERM injection (wait_ec=${ec:-0})"
}

run_case_explicit_exit
run_case_double_restore_idempotent
run_case_sigterm

if grep -q 'resolve.*app.synqdrive.eu:443' "$ROOT/lib/vps-vo5c-phase1-webhook-safe-gates.lib.sh"; then
  echo "FAIL live webhook POST probe still present in gates lib"
  exit 1
fi

rm -rf "$TMP"
echo "PASS vo5c-orchestrator-abort-injection selftest"
