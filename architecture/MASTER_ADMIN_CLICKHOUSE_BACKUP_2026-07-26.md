# Master Admin — ClickHouse Backup (2C.3)

**Date:** 2026-07-26  
**Status:** Implemented — logical backup only, no topology changes

## Summary

Production ClickHouse backup via existing `synqdrive-clickhouse` container and `Disk('backups')` mount. Verified copies archived under `/opt/synqdrive/shared/backups/clickhouse/`, encrypted, offsite-capable.

**Gate:** Successful backup + restore test required before any container rebuild or mount/volume change.

## Scripts

- `vps-backup-clickhouse.sh`
- `vps-restore-test-clickhouse.sh`
- `vps-install-clickhouse-backup-cron.sh` (03:30 UTC)

## Canonical doc

`docs/remediation/clickhouse-backup.md`
