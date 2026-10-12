#!/usr/bin/env bash
# EXP021-S4P2 — offline Prometheus rule syntax + unit tests for DI S4 alerts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROM_DIR="${REPO_ROOT}/monitoring/prometheus"
RULES="${PROM_DIR}/alerts-di-s4.yml"
TESTS="${PROM_DIR}/alerts-di-s4-promtool-tests.yml"
PROM_VERSION="${PROMTOOL_VERSION:-2.54.1}"
PROM_IMAGE="prom/prometheus:v${PROM_VERSION}"
PROMTOOL_BIN="${PROMTOOL_BIN:-}"

resolve_promtool() {
  if [[ -n "$PROMTOOL_BIN" && -x "$PROMTOOL_BIN" ]]; then
    echo "$PROMTOOL_BIN"
    return 0
  fi
  if command -v promtool >/dev/null 2>&1; then
    local candidate
    candidate="$(command -v promtool)"
    if "$candidate" --version >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  fi
  local cache="/tmp/prometheus-${PROM_VERSION}.linux-amd64/promtool"
  if [[ -x "$cache" ]]; then
    echo "$cache"
    return 0
  fi
  local archive="/tmp/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
  if [[ ! -f "$archive" ]]; then
    curl -fsSL -o "$archive" \
      "https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
  fi
  tar -xzf "$archive" -C /tmp
  echo "$cache"
}

PROMTOOL="$(resolve_promtool)"

echo "==> promtool check rules ${RULES}"
"$PROMTOOL" check rules "$RULES"

echo "==> promtool test rules ${TESTS}"
"$PROMTOOL" test rules "$TESTS"

echo "DI_S4_PROMETHEUS_RULES_VALIDATION=PASS"
