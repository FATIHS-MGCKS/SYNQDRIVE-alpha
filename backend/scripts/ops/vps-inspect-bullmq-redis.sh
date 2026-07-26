#!/usr/bin/env bash
#
# vps-inspect-bullmq-redis.sh — BullMQ queue depth + failed job summary.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/redis-backup-lib.sh
source "${SCRIPT_DIR}/lib/redis-backup-lib.sh"

redis_backup_defaults
redis_backup_load_env_file
redis_backup_load_backend_credentials
redis_backup_defaults

redis_backup_validate_connectivity

echo "==> Redis DBSIZE: $(redis_backup_cli DBSIZE)"
echo "==> Persistence:"
redis_backup_cli INFO persistence | grep -E '^(aof_enabled|rdb_last_save_time|aof_last_rewrite_time)' || true
echo ""
redis_backup_bullmq_inspect
