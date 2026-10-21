#!/usr/bin/env bash
# Local/CI wrapper — delegates to ephemeral isolated-database migration validation.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
exec bash scripts/test/physical-state-migration-ephemeral.sh
