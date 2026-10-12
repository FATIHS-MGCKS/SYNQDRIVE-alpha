#!/usr/bin/env bash
# R2.7 — HTTP probes without curl -f conflation (status code vs curl exit).
set -euo pipefail

# Outputs: VO5C_HTTP_CODE (3 digits or 000), VO5C_CURL_EXIT (curl exit code).
# Never use curl -f here — expected 503/502 must not fail the probe.
vo5c_http_probe() {
  local method="${1:-GET}"
  local url="$2"
  shift 2 || true
  local body_file
  body_file="$(mktemp)"
  local code curl_ec=0
  set +e
  code="$(curl -sS -m "${VO5C_HTTP_TIMEOUT_SEC:-15}" -o "$body_file" -w '%{http_code}' -X "$method" "$@" "$url")"
  curl_ec=$?
  set -e
  rm -f "$body_file"
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    code="000"
  fi
  export VO5C_HTTP_CODE="$code"
  export VO5C_CURL_EXIT="$curl_ec"
}

vo5c_assert_http_code() {
  local expected="$1"
  local label="${2:-http}"
  [[ "$VO5C_HTTP_CODE" == "$expected" ]] || return 1
  return 0
}

vo5c_replica_health_ok() {
  local port="$1"
  vo5c_http_probe GET "http://127.0.0.1:${port}/api/v1/health"
  [[ "$VO5C_CURL_EXIT" -eq 0 && "$VO5C_HTTP_CODE" =~ ^2 ]] || return 1
  return 0
}

vo5c_any_replica_healthy() {
  vo5c_replica_health_ok 3001 && return 0
  vo5c_replica_health_ok 3002 && return 0
  return 1
}
