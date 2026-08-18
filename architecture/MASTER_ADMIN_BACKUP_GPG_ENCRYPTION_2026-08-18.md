# Master Admin — Backup GPG Encryption (MA-BKP-P0-002)

**Date:** 2026-08-18  
**Status:** Implemented — public-key recipient model for all tier backups

## Summary

Production backup crons failed because no GPG recipient was configured (`encryption required`). Fix introduces a shared `gpg-backup-lib.sh` with full-fingerprint validation, public-key-only encryption on VPS, and packet-level integrity verification without requiring a private key on the production host.

## Encryption model

| Layer | Production VPS | Recovery environment |
|-------|----------------|----------------------|
| Key material | **Public key only** in `/opt/synqdrive/shared/gpg-backup` | Private recovery key (offline) |
| Config | `/opt/synqdrive/shared/backup-gpg.env` | — |
| Recipient | `SYNQDRIVE_BACKUP_GPG_FINGERPRINT` (40-char) | Same fingerprint |
| Cron | `GNUPGHOME=/opt/synqdrive/shared/gpg-backup` | — |

Legacy symmetric `*_GPG_PASSPHRASE_FILE` remains supported for dev migration only.

## Scripts

- `lib/gpg-backup-lib.sh` — shared encrypt/verify/decrypt
- `vps-setup-backup-gpg.sh` — import public key from `keys/synqdrive-backup-recovery.pub.asc`
- `vps-backup-postgresql.sh` + `lib/postgresql-backup-lib.sh` — Tier 0 PG dumps
- Updated: `clickhouse-backup-lib.sh`, `redis-backup-lib.sh`, cron installers

## Monitoring handoff

Tier scripts write `state/last-success.json` per backup root. PostgreSQL updates `synqdrive_backup.prom` textfile via `vps-backup-status-textfile.sh`.
