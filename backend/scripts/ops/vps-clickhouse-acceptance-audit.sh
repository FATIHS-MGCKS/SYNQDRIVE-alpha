#!/usr/bin/env bash
#
# vps-clickhouse-acceptance-audit.sh — Phase 2D.8 full acceptance bundle.
#
# Runs all ClickHouse audit scripts + health check and prints GO/NO-GO summary.
#
# Usage:
#   bash vps-clickhouse-acceptance-audit.sh [--markdown]
#
# Exit codes:
#   0 — acceptance passed (no P0 failures)
#   1 — P0 failure — NOT production ready
#   2 — prerequisite / connectivity error
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKDOWN=0
[[ "${1:-}" == "--markdown" ]] && MARKDOWN=1

REPORT_DIR="${CLICKHOUSE_ACCEPTANCE_REPORT_DIR:-/opt/synqdrive/shared/reports}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_FILE="${REPORT_DIR}/clickhouse-acceptance-${TS}.log"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$REPORT_FILE"; }

mkdir -p "$REPORT_DIR"

P0_FAIL=0
P1_WARN=0
RESULTS=()

run_audit() {
  local name="$1"
  local script="$2"
  log "── Running: ${name} ──"
  if bash "$script" >>"$REPORT_FILE" 2>&1; then
    RESULTS+=("PASS|${name}")
    log "RESULT ${name}: PASS"
  else
    local ec=$?
    if [[ "$ec" -eq 2 ]]; then
      RESULTS+=("ERROR|${name}")
      log "RESULT ${name}: ERROR (connectivity)"
      P0_FAIL=$((P0_FAIL + 1))
    elif [[ "$ec" -eq 1 ]]; then
      RESULTS+=("FAIL|${name}")
      log "RESULT ${name}: FAIL (P0)"
      P0_FAIL=$((P0_FAIL + 1))
    elif [[ "$ec" -eq 3 ]]; then
      # Sub-audit reported P1-only findings; they belong in the report but must
      # not block the release.
      RESULTS+=("WARN|${name}")
      log "RESULT ${name}: WARN (P1 only)"
      P1_WARN=$((P1_WARN + 1))
    else
      RESULTS+=("FAIL|${name}")
      log "RESULT ${name}: FAIL (exit ${ec})"
      P0_FAIL=$((P0_FAIL + 1))
    fi
  fi
}

log "ClickHouse acceptance audit started"
log "report=${REPORT_FILE}"

# Ordered: connectivity → topology → integrity → tenant → perf → pipeline → health
run_audit "storage-topology" "${SCRIPT_DIR}/vps-clickhouse-storage-topology-audit.sh"
run_audit "data-integrity" "${SCRIPT_DIR}/vps-clickhouse-data-integrity-audit.sh"
run_audit "tenant-isolation" "${SCRIPT_DIR}/vps-clickhouse-tenant-isolation-audit.sh"
run_audit "performance" "${SCRIPT_DIR}/vps-clickhouse-performance-audit.sh"
run_audit "pipeline" "${SCRIPT_DIR}/vps-clickhouse-pipeline-audit.sh"
run_audit "health-check" "${SCRIPT_DIR}/vps-clickhouse-health-check.sh"

# API readiness (optional — does not fail acceptance if unreachable from script context)
HEALTH_URL="${CLICKHOUSE_HEALTH_URL:-http://127.0.0.1:3001/api/v1/health/readiness}"
if command -v curl >/dev/null 2>&1; then
  log "── API readiness ──"
  if resp="$(curl -sf "$HEALTH_URL" 2>/dev/null)"; then
    ch_status="$(echo "$resp" | grep -o '"clickhouse"[^}]*' | head -1 || true)"
    log "readiness: ${ch_status:-ok}"
    if echo "$resp" | grep -q '"clickhouse".*"status":"error"'; then
      RESULTS+=("WARN|api-readiness-clickhouse-error")
      P1_WARN=$((P1_WARN + 1))
      log "WARN: API reports clickhouse error"
    else
      RESULTS+=("PASS|api-readiness")
    fi
  else
    RESULTS+=("WARN|api-readiness-unreachable")
    P1_WARN=$((P1_WARN + 1))
    log "WARN: readiness unreachable"
  fi
fi

log ""
log "═══════════════════════════════════════════════════════════════"
if [[ "$P0_FAIL" -eq 0 ]]; then
  log "ACCEPTANCE VERDICT: CONDITIONAL GO (no P0 audit failures)"
  log "Note: review P1 warnings (${P1_WARN}) in clickhouse-production-readiness.md"
  VERDICT=0
else
  log "ACCEPTANCE VERDICT: NO-GO (${P0_FAIL} P0 failure(s))"
  VERDICT=1
fi
log "Report: ${REPORT_FILE}"
log "═══════════════════════════════════════════════════════════════"

if [[ "$MARKDOWN" -eq 1 ]]; then
  echo ""
  echo "| Audit | Result |"
  echo "|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status name <<< "$r"
    echo "| ${name} | ${status} |"
  done
  echo ""
  echo "**Verdict:** $([[ "$VERDICT" -eq 0 ]] && echo 'CONDITIONAL GO' || echo 'NO-GO')"
fi

exit "$VERDICT"
