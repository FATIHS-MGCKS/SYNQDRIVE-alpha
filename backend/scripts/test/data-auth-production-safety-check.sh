#!/usr/bin/env bash
# Data authorization production safety — dev bypass, enforcement, unregistered paths.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Production config validator (NODE_ENV=production)"
NODE_ENV=production npx jest --testPathPattern='authorization-decision.config-validator' --runInBand

echo "==> Enforcement coverage registry integrity"
npm run test:data-auth:coverage

echo "==> Unregistered productive paths gate"
npx jest --testPathPattern='enforcement-coverage-ci' --runInBand

if [[ "${DATA_AUTH_PRODUCTION_SAFETY_SIMULATE:-0}" == "1" ]]; then
  echo "==> Simulated production env flags"
  NODE_ENV=production \
    DATA_AUTH_DECISION_DEV_BYPASS=false \
    DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=true \
    npx jest --testPathPattern='authorization-decision-startup' --runInBand
fi

echo "==> Data authorization production safety checks passed"
