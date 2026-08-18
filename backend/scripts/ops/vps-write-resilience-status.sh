#!/usr/bin/env bash
#
# vps-write-resilience-status.sh — Aggregate backup/offsite state for Master Admin APIs.
#
# Writes /opt/synqdrive/shared/resilience-status.json (SYNQDRIVE_RESILIENCE_STATUS_JSON).
# Invoked after successful offsite sync and optionally from tier backup crons.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/offsite-backup-lib.sh
source "${SCRIPT_DIR}/lib/offsite-backup-lib.sh"

offsite_defaults
offsite_load_env
offsite_defaults
offsite_ensure_dirs
offsite_write_resilience_json
echo "Wrote ${OFFSITE_RESILIENCE_JSON}"
