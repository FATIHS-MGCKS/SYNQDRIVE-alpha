#!/usr/bin/env bash
# R2.6 — Real nginx routing tests without Docker (isolated temp ports).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
GEN="$TEST_DIR/r9-resilience-nginx.local.generated.conf"
PID_A="$TEST_DIR/.backend_a.pid"
PID_B="$TEST_DIR/.backend_b.pid"
PID_N="$TEST_DIR/.nginx.pid"
PORT_A=19001
PORT_B=19002
PORT_N=18081

cleanup() {
  [[ -f "${TEST_DIR}/.nginx-master.pid" ]] && kill "$(cat "${TEST_DIR}/.nginx-master.pid")" 2>/dev/null || true
  [[ -f "$PID_N" ]] && kill "$(cat "$PID_N")" 2>/dev/null || true
  [[ -f "$PID_A" ]] && kill "$(cat "$PID_A")" 2>/dev/null || true
  [[ -f "$PID_B" ]] && kill "$(cat "$PID_B")" 2>/dev/null || true
  rm -f "$PID_N" "$PID_A" "$PID_B" "$GEN"
}
trap cleanup EXIT

start_backend() {
  local port="$1" label="$2" pidfile="$3"
  node -e "
const http=require('http');
http.createServer((q,r)=>{
  if(q.url==='/api/v1/webhooks/dimo'&&q.method==='POST'){r.writeHead(200);r.end('ok-${label}');return}
  if(q.url==='/api/v1/health'){r.writeHead(200);r.end('ok');return}
  r.writeHead(404);r.end();
}).listen(${port},'127.0.0.1');
" &
  echo $! >"$pidfile"
  sleep 0.3
}

start_backend "$PORT_A" a "$PID_A"
start_backend "$PORT_B" b "$PID_B"

cat >"$GEN" <<NGINX
worker_processes 1;
pid ${TEST_DIR}/.nginx-master.pid;
events { worker_connections 64; }
http {
    upstream synqdrive_backend {
        server 127.0.0.1:${PORT_A} max_fails=1 fail_timeout=2s;
        server 127.0.0.1:${PORT_B} max_fails=1 fail_timeout=2s;
    }
    server {
        listen ${PORT_N};
        location = /api/v1/webhooks/dimo {
            proxy_pass http://synqdrive_backend;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_connect_timeout 2s;
            proxy_read_timeout 5s;
            client_max_body_size 1m;
            proxy_intercept_errors off;
        }
        location / {
            default_type text/plain;
            return 503 "maintenance";
        }
    }
}
NGINX

nginx -t -c "$GEN"
nginx -c "$GEN"
sleep 0.5

code_webhook="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT_N}/api/v1/webhooks/dimo" -d '{}')"
code_root="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT_N}/")"
[[ "$code_webhook" == "200" ]] || { echo "FAIL both_up webhook=$code_webhook"; exit 1; }
[[ "$code_root" == "503" ]] || { echo "FAIL both_up root=$code_root"; exit 1; }

kill "$(cat "$PID_A")" && rm -f "$PID_A"
sleep 3
code_a_down="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT_N}/api/v1/webhooks/dimo" -d '{}')"
[[ "$code_a_down" == "200" ]] || { echo "FAIL only_b webhook=$code_a_down"; exit 1; }

kill "$(cat "$PID_B")" 2>/dev/null || true
rm -f "$PID_B"
sleep 3
code_none="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT_N}/api/v1/webhooks/dimo" -d '{}' || true)"
[[ "$code_none" != "200" ]] || { echo "FAIL both_down returned 200"; exit 1; }

echo "PASS r9-resilience-nginx local failover tests"
