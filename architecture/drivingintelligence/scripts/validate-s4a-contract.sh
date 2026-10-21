#!/usr/bin/env bash
# S4A machine contract: positive validation (v2 contract) + negative red-team suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
node "$ROOT/architecture/drivingintelligence/scripts/validate-s4a-contract.mjs" "$@"
node "$ROOT/architecture/drivingintelligence/scripts/validate-s4a-contract-negative.mjs"
