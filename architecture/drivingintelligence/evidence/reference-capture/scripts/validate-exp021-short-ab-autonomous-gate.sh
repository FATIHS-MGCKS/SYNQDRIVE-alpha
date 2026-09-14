#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../../backend" && pwd)"

cd "$ROOT"
npm test -- --testPathPattern="reference-capture-exp-021-autonomous-lifecycle.driver|reference-capture-exp021-candidate-short-ab-90-60|reference-capture-exp-021-autonomous-orchestrator.lib" --no-coverage

echo "EXP-021 short A/B autonomous regression gate: PASS"
