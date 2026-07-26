# Master Admin — PostgreSQL Backup (2C.2)

**Date:** 2026-07-26  
**Status:** Implemented

## Summary

Production PostgreSQL backup pipeline for Hostinger VPS:

- `vps-backup-database.sh` — `pg_dump -Fc`, GPG encryption, SHA-256 + `pg_restore --list` integrity, immutable generations, local rotation (min 2 valid), offsite via rclone/S3
- `vps-restore-test-database.sh` — quarterly restore drill to `synqdrive_restore_test`
- `vps-install-postgresql-backup-cron.sh` — daily 02:00 UTC cron
- `vps-deploy-release.sh` — pre-deploy backup via same pipeline (`PG_BACKUP_LABEL=pre-deploy`)

## Paths

- Config: `/opt/synqdrive/shared/postgresql-backup.env`
- Archives: `/opt/synqdrive/shared/backups/postgresql/daily/`
- State: `.../state/last-success.json`, `last-restore-test.json`

## Canonical doc

`docs/remediation/postgresql-backup.md`

## Closes (2C.1 gaps)

DR-003, DR-006; partial DR-001, DR-004, DR-005
