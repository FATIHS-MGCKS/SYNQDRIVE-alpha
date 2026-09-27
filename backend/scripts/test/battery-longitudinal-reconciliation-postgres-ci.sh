#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTEGRATION=1
exec npx jest longitudinal-reconciliation.integration --runInBand "$@"
