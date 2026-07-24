#!/usr/bin/env bash
# Baseline verification for Auswertungen (evaluations) modules — Prompt 3/54.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="$ROOT/docs/audits/evaluations"
mkdir -p "$REPORT_DIR"

log() { echo "[evaluations-verify] $*"; }

log "Frontend evaluations unit tests"
cd "$ROOT/frontend"
npm run test:evaluations

log "Backend evaluations finance suite (Prompt 14 — money, receivables, FX, KPI integration)"
cd "$ROOT/backend"
npm run test:evaluations:finance

log "Backend evaluations unit tests (runInBand to avoid OOM on cross-package import)"
cd "$ROOT/backend"
npm run test:evaluations

log "Done — see $REPORT_DIR/evaluations-finance-test-report-2026-07.md for finance suite report"
