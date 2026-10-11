#!/usr/bin/env bash
# R2.6 — Executes real docker-based nginx routing tests (offline). Requires docker compose.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
GEN="$TEST_DIR/r9-resilience-nginx.generated.conf"

# shellcheck source=../lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh
source "$ROOT/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh"

cat >"$GEN" <<'NGINX'
events { worker_connections 64; }
http {
    upstream synqdrive_backend {
        server backend_a:80 max_fails=1 fail_timeout=2s;
        server backend_b:80 max_fails=1 fail_timeout=2s;
    }
    server {
        listen 8080;
        location = /api/v1/webhooks/dimo {
            proxy_pass http://synqdrive_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_connect_timeout 2s;
            proxy_read_timeout 5s;
        }
        location / {
            default_type text/plain;
            return 503 "maintenance";
        }
    }
}
NGINX

/usr/sbin/nginx -t -c "$GEN" 2>/dev/null || docker run --rm -v "$GEN:/etc/nginx/nginx.conf:ro" nginx:1.27-alpine nginx -t

cd "$TEST_DIR"
docker compose -f r9-resilience-nginx.docker-compose.yml up -d --wait 2>/dev/null || docker compose -f r9-resilience-nginx.docker-compose.yml up -d
sleep 2

code_webhook="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18080/api/v1/webhooks/dimo -d '{}')"
code_root="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/)"
[[ "$code_webhook" == "200" ]] || { echo "FAIL both_up webhook=$code_webhook"; exit 1; }
[[ "$code_root" == "503" ]] || { echo "FAIL both_up root=$code_root"; exit 1; }

docker compose -f r9-resilience-nginx.docker-compose.yml stop backend_a
sleep 3
code_a_down="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18080/api/v1/webhooks/dimo -d '{}')"
[[ "$code_a_down" == "200" ]] || { echo "FAIL only_b webhook=$code_a_down"; exit 1; }

docker compose -f r9-resilience-nginx.docker-compose.yml stop backend_b
sleep 3
code_none="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:18080/api/v1/webhooks/dimo -d '{}' || true)"
[[ "$code_none" != "200" ]] || { echo "FAIL both_down returned 200"; exit 1; }

docker compose -f r9-resilience-nginx.docker-compose.yml down -v
echo "PASS r9-resilience-nginx docker failover tests"
