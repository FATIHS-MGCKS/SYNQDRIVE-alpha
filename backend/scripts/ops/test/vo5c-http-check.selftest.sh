#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../lib/vps-vo5c-http-check.lib.sh
source "$ROOT/lib/vps-vo5c-http-check.lib.sh"

node -e "require('http').createServer((q,r)=>{r.writeHead(503);r.end('m')}).listen(19103,'127.0.0.1')" &
srv=$!
sleep 0.2
vo5c_http_probe GET "http://127.0.0.1:19103/"
kill "$srv" 2>/dev/null || true
[[ "$VO5C_HTTP_CODE" == "503" ]] || { echo "FAIL expected 503 got $VO5C_HTTP_CODE"; exit 1; }
echo "PASS vo5c-http-check selftest"
