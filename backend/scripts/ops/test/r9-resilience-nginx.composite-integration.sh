#!/usr/bin/env bash
# R2.7 — Integration tests using generated Phase-1 maintenance config (not simplified hand-written nginx).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE_SSL="$TEST_DIR/fixtures/letsencrypt"
GEN_SITE="$TEST_DIR/r9-phase1.generated.site.conf"
WRAP="$TEST_DIR/r9-phase1.nginx.conf"
PORT_A=19011
PORT_B=19012
PORT_N=18082
PID_A="$TEST_DIR/.ca.pid"
PID_B="$TEST_DIR/.cb.pid"

# shellcheck source=../lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

cleanup() {
  [[ -f "$TEST_DIR/.nginx-master.pid" ]] && kill "$(cat "$TEST_DIR/.nginx-master.pid")" 2>/dev/null || true
  [[ -f "$PID_A" ]] && kill "$(cat "$PID_A")" 2>/dev/null || true
  [[ -f "$PID_B" ]] && kill "$(cat "$PID_B")" 2>/dev/null || true
  rm -f "$GEN_SITE" "$WRAP" "$PID_A" "$PID_B" "$TEST_DIR/.nginx-master.pid"
}
trap cleanup EXIT

mkdir -p "$FIXTURE_SSL"
if [[ ! -f "$FIXTURE_SSL/options-ssl-nginx.conf" ]]; then
  cat >"$FIXTURE_SSL/options-ssl-nginx.conf" <<'SSL'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
SSL
fi

start_backend() {
  local port="$1" _label="$2" pidfile="$3"
  node -e 'const http=require("http");const port=Number(process.argv[1]);http.createServer((q,r)=>{if(q.url==="/api/v1/webhooks/dimo"&&q.method==="POST"){const len=parseInt(q.headers["content-length"]||"0",10);if(len>1e6){r.writeHead(413);r.end("big");return}r.writeHead(200);r.end("ok");return}if(q.url==="/api/v1/health"){r.writeHead(200);r.end("ok");return}r.writeHead(404);r.end()}).listen(port,"127.0.0.1")' "$port" &
  echo $! >"$pidfile"
  sleep 0.25
}

build_nginx_conf() {
  vo5c_emit_phase1_maintenance_nginx_file synqdrive_backend /api/v1/webhooks/dimo >"$GEN_SITE"
  vo5c_validate_webhook_safe_site "$GEN_SITE" /api/v1/webhooks/dimo
  sed -e "s|127.0.0.1:3001|127.0.0.1:${PORT_A}|g" \
    -e "s|127.0.0.1:3002|127.0.0.1:${PORT_B}|g" \
    -e "s|/etc/letsencrypt/options-ssl-nginx.conf|${FIXTURE_SSL}/options-ssl-nginx.conf|g" \
    -e '/ssl_certificate /d' -e '/ssl_certificate_key/d' -e '/ssl_dhparam/d' \
    -e "s/listen \[::\]:443 ssl ipv6only=on;/listen ${PORT_N};/" \
    -e '/listen 443 ssl/d' \
    "$GEN_SITE" >"$TEST_DIR/r9-phase1.stripped.conf"
  cat >"$WRAP" <<EOF
worker_processes 1;
pid ${TEST_DIR}/.nginx-master.pid;
events { worker_connections 128; }
http {
  include ${TEST_DIR}/r9-phase1.stripped.conf;
}
EOF
  nginx -t -c "$WRAP"
}

probe() {
  local method="$1" path="$2" extra="${3:-}"
  curl -sS -m 5 -o /dev/null -w '%{http_code}' -X "$method" "http://127.0.0.1:${PORT_N}${path}" $extra
}

start_backend "$PORT_A" a "$PID_A"
start_backend "$PORT_B" b "$PID_B"
build_nginx_conf
nginx -c "$WRAP"
sleep 0.4

code_post="$(probe POST /api/v1/webhooks/dimo)"
code_root="$(probe GET /)"
[[ "$code_post" == "200" ]] || { echo "FAIL both_up post=$code_post"; exit 1; }
[[ "$code_root" == "503" ]] || { echo "FAIL both_up root=$code_root"; exit 1; }

kill "$(cat "$PID_A")"; rm -f "$PID_A"
sleep 3
code_b="$(probe POST /api/v1/webhooks/dimo)"
[[ "$code_b" == "200" ]] || { echo "FAIL only_b post=$code_b"; exit 1; }

start_backend "$PORT_A" a "$PID_A"
kill "$(cat "$PID_B")" 2>/dev/null; rm -f "$PID_B"
sleep 0.3
code_a="$(probe POST /api/v1/webhooks/dimo)"
[[ "$code_a" == "200" ]] || { echo "FAIL only_a post=$code_a"; exit 1; }

kill "$(cat "$PID_A")"; rm -f "$PID_A"
sleep 3
code_none="$(probe POST /api/v1/webhooks/dimo)" || code_none="000"
[[ "$code_none" != "200" ]] || { echo "FAIL both_down returned 200"; exit 1; }

# duplicate upstream must fail validation
dup="$TEST_DIR/dup.conf"
vo5c_emit_phase1_maintenance_nginx_file synqdrive_backend /api/v1/webhooks/dimo >"$dup"
cat >>"$dup" <<'DUP'
upstream synqdrive_backend { server 127.0.0.1:9; }
DUP
if vo5c_validate_webhook_safe_site "$dup" /api/v1/webhooks/dimo 2>/dev/null; then
  echo "FAIL duplicate upstream accepted"
  exit 1
fi

# oversized payload → backend 413 or nginx 413
start_backend "$PORT_A" a "$PID_A"
start_backend "$PORT_B" b "$PID_B"
BIG_BODY="$TEST_DIR/big-body.bin"
dd if=/dev/zero of="$BIG_BODY" bs=1M count=2 status=none 2>/dev/null || head -c 2000000 /dev/zero >"$BIG_BODY"
big_code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT_N}/api/v1/webhooks/dimo" --data-binary @"$BIG_BODY" || echo 000)"
rm -f "$BIG_BODY"
[[ "$big_code" != "200" ]] || { echo "FAIL oversized payload returned 200"; exit 1; }

echo "PASS r9-resilience-nginx composite integration"
