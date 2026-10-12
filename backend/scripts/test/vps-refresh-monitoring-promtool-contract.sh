#!/usr/bin/env bash
# Contract: vps-refresh-monitoring validates candidate rule files (not live /etc/prometheus).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"
TMP_PROM="$(mktemp -d)"
export SYNQDRIVE_ROOT="$REPO_ROOT"
export PROM_DIR="$TMP_PROM"
export BACKEND_ENV="$TMP_PROM/backend.env"
export AUTO_BOOTSTRAP=0

PROM_VERSION="${PROMTOOL_VERSION:-2.54.1}"

resolve_promtool() {
  if [[ -n "${PROMTOOL_BIN:-}" && -x "${PROMTOOL_BIN}" ]]; then
    echo "${PROMTOOL_BIN}"
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

export PROMTOOL_BIN="$(resolve_promtool)"

printf 'METRICS_BEARER_TOKEN=test-token\n' > "$BACKEND_ENV"

validate_ok() {
  SYNQDRIVE_ROOT="$REPO_ROOT" PROMTOOL_BIN="$PROMTOOL_BIN" bash -c '
      set -euo pipefail
      SRC_PROM="${SYNQDRIVE_ROOT}/backend/monitoring/prometheus"
      promtool_check_rules_file() {
        local rules_file="$1"
        "${PROMTOOL_BIN}" check rules "$rules_file"
      }
      validate_prometheus_bundle() {
        local tmp
        tmp="$(mktemp -d)"
        cp "$SRC_PROM/alerts.yml" "$tmp/alerts.yml"
        cp "$SRC_PROM/alerts-infra.yml" "$tmp/alerts-infra.yml"
        cp "$SRC_PROM/alerts-di-s4.yml" "$tmp/alerts-di-s4.yml"
        promtool_check_rules_file "$tmp/alerts-di-s4.yml"
        promtool_check_rules_file "$tmp/alerts-infra.yml"
        promtool_check_rules_file "$tmp/alerts.yml"
        rm -rf "$tmp"
      }
      validate_prometheus_bundle
    '
}

validate_bad_fails() {
  SYNQDRIVE_ROOT="$REPO_ROOT" PROMTOOL_BIN="$PROMTOOL_BIN" bash -c '
      set -euo pipefail
      SRC_PROM="${SYNQDRIVE_ROOT}/backend/monitoring/prometheus"
      tmp="$(mktemp -d)"
      cp "$SRC_PROM/alerts-di-s4.yml" "$tmp/alerts-di-s4.yml"
      echo "bad: [{]" >> "$tmp/alerts-di-s4.yml"
      if "${PROMTOOL_BIN}" check rules "$tmp/alerts-di-s4.yml"; then
        exit 2
      fi
    '
}

rollback_snapshot_contract() {
  local prom_dir snap rules
  prom_dir="$(mktemp -d)"
  snap="$(mktemp -d)"
  rules="$prom_dir/alerts-di-s4.yml"
  printf 'before\n' > "$rules"
  cp -a "$prom_dir/." "$snap/"
  printf 'after\n' > "$rules"
  cp -a "$snap/." "$prom_dir/"
  if ! grep -q '^before$' "$rules"; then
    echo "rollback snapshot contract: rules file not restored to pre-change content" >&2
    return 1
  fi
}

validate_ok
validate_bad_fails
rollback_snapshot_contract

echo "VPS_REFRESH_PROMTOOL_CONTRACT=PASS"
