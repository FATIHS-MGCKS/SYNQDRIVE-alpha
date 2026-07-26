# Master Admin — Offsite Backups (2C.5)

**Date:** 2026-07-26

## Summary

Production-relevant backups must not exist only on the VPS. Phase 2C.5 adds a **central offsite orchestrator** that syncs encrypted tier artifacts to remote object storage with versioning, retention, integrity checks, and failure notifications.

## Tiers synced

| Tier | Local path | Remote subpath | Offsite retention |
|------|------------|----------------|-------------------|
| PostgreSQL | `backups/postgresql/daily/` | `postgresql/` | 90d, min 2 |
| ClickHouse | `backups/clickhouse/daily/` | `clickhouse/` | 30d, min 2 |
| Redis | `backups/redis/daily/` | `redis/` | 30d, min 2 |
| Environment | `backups/env/daily/` | `env/` | 90d, min 2 |

Only `*.gpg` artifacts with valid SHA-256 sidecars are uploaded when `OFFSITE_REQUIRE_ENCRYPTION=true`.

## Implementation

- `lib/offsite-backup-lib.sh` — shared sync, retention, GPG gate, Resend alerts, manifest
- `vps-sync-offsite-backups.sh` — nightly orchestrator (default 05:15 UTC)
- `vps-backup-env-snapshot.sh` — encrypted `backend.env` + `frontend.env` tarball
- `vps-verify-offsite-backups.sh` — local checksum + remote size audit
- `vps-install-offsite-backup-cron.sh` — cron installer

## Schedule (UTC)

1. 02:00 — PostgreSQL (2C.2)
2. 03:30 — ClickHouse (2C.3)
3. 04:00 — Redis (2C.4)
4. 05:15 — env snapshot + offsite sync (2C.5)
5. Sun 06:30 — weekly offsite verify

## Central vs per-tier offsite

When `OFFSITE_CENTRAL_SYNC=true` (default), tier backup scripts set `*_SKIP_OFFSITE=true` and defer upload to the orchestrator.

## Gaps (documented)

- Uploads/documents not yet offsite (2C.6+)
- Legacy unencrypted `db-pre-deploy-*.sql.gz` on VPS
- PM2/Nginx/TLS config — git + certbot, not backup tier

## Canonical doc

`docs/remediation/offsite-backups.md`
