# Master Admin — Restore Validation (2C.6)

**Date:** 2026-07-26

## Summary

Isolated restore validation framework ensures backups are recoverable **without mutating production data**.

## Implementation

- `vps-restore-validation.sh` — orchestrates all tier drills
- Per-tier `vps-restore-test-*.sh` scripts (PG, CH, Redis, env, uploads, documents)
- `lib/restore-validation-lib.sh` — safety gates, timing, JSON reports
- `restore-validation.local.sh` — full Docker E2E drill
- Quarterly cron via `vps-install-restore-validation-cron.sh`

## Safety

- `RESTORE_VALIDATION_MODE=isolated` + `ALLOW_PRODUCTION=false`
- PG: `synqdrive_restore_*` only on drill Postgres
- Redis: `redis-check-rdb` only — no live restore
- Env/uploads/documents: staging extract only

## Canonical doc

`docs/remediation/restore-validation.md`
