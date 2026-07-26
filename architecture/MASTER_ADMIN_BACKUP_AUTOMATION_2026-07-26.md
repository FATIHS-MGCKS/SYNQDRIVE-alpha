# Master Admin — Backup Automation (2C.7)

**Date:** 2026-07-26

## Summary

Unified backup scheduler with retry, structured logging, exit codes, Prometheus metrics, health watchdog, and Resend alerts. No failed backup should go unnoticed.

## Implementation

- `vps-install-backup-automation-cron.sh` — single `/etc/cron.d/synqdrive-backup-automation`
- `vps-run-backup-job.sh` — retry wrapper (3×, 120s backoff)
- `vps-backup-automation-health.sh` — SLA watchdog + metrics
- `lib/backup-automation-lib.sh` — state, notify, prometheus textfile
- `vps-backup-database.sh`, `vps-backup-clickhouse.sh` — tier scripts for PG/CH

## Schedule (UTC)

02:00 PG → 03:30 CH → 04:00 Redis → 05:15 env+offsite → Sun 06:30 verify → 06:45 health

## Canonical doc

`docs/remediation/backup-automation.md`
