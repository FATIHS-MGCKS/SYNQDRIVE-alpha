# Master Admin Remediation — Phase 2C.2: PostgreSQL Backup

**Date:** 2026-07-26  
**Status:** Implemented (ops scripts + VPS cron installer)  
**Related:** `docs/remediation/disaster-recovery-architecture.md` (2C.1)

---

## Executive summary

SynqDrive now ships a **production-grade PostgreSQL backup pipeline** for the Hostinger VPS:

| Requirement | Implementation |
|-------------|----------------|
| Consistent backup | `pg_dump -Fc` (MVCC snapshot, custom format) |
| Integrity verification | `pg_restore --list` + SHA-256 sidecar + post-promote re-verify |
| Daily execution | `vps-install-postgresql-backup-cron.sh` → `/etc/cron.d/synqdrive-postgresql-backup` (02:00 UTC) |
| Rotation | Local retention 30d default; **never below 2 valid generations** |
| Encryption | GPG asymmetric (`PG_BACKUP_GPG_RECIPIENT`) or symmetric passphrase file |
| Offsite copy | `rclone` or `aws s3 cp` after local verify |
| Restore test | `vps-restore-test-database.sh` → `synqdrive_restore_test` |
| No overwrite | Timestamped immutable filenames; `promote` aborts if target exists |

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ vps-backup-database.sh (daily cron + pre-deploy via deploy)      │
├─────────────────────────────────────────────────────────────────┤
│ 1. Load postgresql-backup.env                                    │
│ 2. Disk guard (abort ≥90%, warn ≥85%)                              │
│ 3. pg_dump -Fc → staging/ (unique temp name)                     │
│ 4. gpg encrypt → .dump.gpg (optional unencrypted dev)            │
│ 5. pg_restore --list integrity check                             │
│ 6. SHA-256 sidecar + .meta.json                                  │
│ 7. Atomic mv → daily/ (refuse if exists)                         │
│ 8. Re-verify promoted artifact                                   │
│ 9. manifest.jsonl + state/last-success.json                      │
│ 10. Offsite copy (rclone/s3)                                     │
│ 11. Rotate expired locals (keep ≥ MIN_GENERATIONS valid)           │
└─────────────────────────────────────────────────────────────────┘
```

### Directory layout (VPS)

```
/opt/synqdrive/shared/
├── postgresql-backup.env          # chmod 600 — encryption + offsite config
└── backups/postgresql/
    ├── daily/                     # immutable generations
    │   ├── synqdrive-daily-20260726T020001Z.dump.gpg
    │   ├── synqdrive-daily-20260726T020001Z.dump.gpg.sha256
    │   ├── synqdrive-daily-20260726T020001Z.dump.gpg.meta.json
    │   └── synqdrive-pre-deploy-20260726T153045Z.dump.gpg
    ├── staging/                   # transient (chmod 700)
    ├── state/
    │   ├── last-success.json
    │   └── last-restore-test.json
    └── manifest.jsonl             # append-only success log
```

Legacy pre-2C.2 dumps remain in `/opt/synqdrive/shared/backups/db-pre-deploy-*.sql.gz` until manually pruned.

---

## 2. Scripts

| Script | Purpose |
|--------|---------|
| `backend/scripts/ops/vps-backup-database.sh` | Main backup pipeline |
| `backend/scripts/ops/vps-restore-test-database.sh` | Restore drill to test DB |
| `backend/scripts/ops/vps-install-postgresql-backup-cron.sh` | Install daily cron (root) |
| `backend/scripts/ops/lib/postgresql-backup-lib.sh` | Shared library (sourced) |
| `backend/scripts/ops/postgresql-backup.env.example` | Configuration template |
| `backend/scripts/ops/postgresql-backup.selftest.sh` | CI-safe self-test (no DB) |

`vps-deploy-release.sh` calls `vps-backup-database.sh` with `PG_BACKUP_LABEL=pre-deploy` and `PG_BACKUP_SKIP_ROTATION=true` when available.

---

## 3. Initial VPS setup

### 3.1 Prerequisites

```bash
# On VPS (as root)
apt-get install -y postgresql-client gpg rclone   # rclone if using rclone offsite
# awscli if using S3 offsite
```

### 3.2 GPG encryption (production)

**Option A — asymmetric (recommended):**

```bash
# On secure workstation: create backup key
gpg --full-generate-key
gpg --export -a backup@synqdrive.eu > backup-pub.asc

# On VPS: import public key only
gpg --import backup-pub.asc
```

**Option B — symmetric passphrase file:**

```bash
install -m 600 /dev/null /root/.synqdrive-backup-passphrase
# store strong passphrase in file (never commit)
```

### 3.3 Configuration

```bash
cp /opt/synqdrive/current/backend/scripts/ops/postgresql-backup.env.example \
   /opt/synqdrive/shared/postgresql-backup.env
chmod 600 /opt/synqdrive/shared/postgresql-backup.env
# Edit: PG_BACKUP_GPG_RECIPIENT or PG_BACKUP_GPG_PASSPHRASE_FILE
# Edit: PG_BACKUP_OFFSITE_MODE, PG_BACKUP_RCLONE_REMOTE or PG_BACKUP_S3_URI
```

### 3.4 Install cron

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-install-postgresql-backup-cron.sh
```

Default schedule: **02:00 UTC daily** (`PG_BACKUP_CRON_SCHEDULE` override).

### 3.5 First manual run + restore test

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-backup-database.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-restore-test-database.sh --drop-after
```

---

## 4. Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PG_BACKUP_DB_NAME` | `synqdrive` | Database name |
| `PG_BACKUP_PG_USER` | `postgres` | OS user for pg_dump |
| `PG_BACKUP_ROOT` | `/opt/synqdrive/shared/backups/postgresql` | Backup root |
| `PG_BACKUP_LABEL` | `daily` | Filename label (`daily`, `pre-deploy`, `manual`) |
| `PG_BACKUP_MIN_GENERATIONS` | `2` | **Never rotate below this many valid archives** |
| `PG_BACKUP_LOCAL_RETENTION_DAYS` | `30` | Delete local archives older than N days (if safe) |
| `PG_BACKUP_OFFSITE_RETENTION_DAYS` | `90` | Documented target; enforce via bucket lifecycle |
| `PG_BACKUP_GPG_RECIPIENT` | — | GPG key id/email for encryption |
| `PG_BACKUP_GPG_PASSPHRASE_FILE` | — | Symmetric encryption passphrase file |
| `PG_BACKUP_ALLOW_UNENCRYPTED` | `false` | Dev only |
| `PG_BACKUP_OFFSITE_MODE` | `none` | `none`, `rclone`, `s3` |
| `PG_BACKUP_RCLONE_REMOTE` | — | e.g. `hetzner:synqdrive-backups/postgresql` |
| `PG_BACKUP_S3_URI` | — | e.g. `s3://bucket/synqdrive/postgresql` |
| `PG_BACKUP_SKIP_ROTATION` | `false` | Set `true` for pre-deploy backups |
| `PG_BACKUP_SKIP_OFFSITE` | `false` | Skip offsite step |
| `PG_BACKUP_RESTORE_TEST_DB` | `synqdrive_restore_test` | Restore drill target |

---

## 5. Safety guarantees

### 5.1 Never overwrite without valid generation

1. **Immutable filenames** — every backup includes UTC timestamp: `synqdrive-{label}-{timestamp}.dump.gpg`
2. **Promote refuses existing path** — `mv` only if archive does not exist
3. **Rotation guard** — deletion proceeds only while `valid_count > PG_BACKUP_MIN_GENERATIONS` after each delete
4. **Valid = verified** — rotation considers only archives passing checksum + `pg_restore --list` (decrypt if needed)
5. **Failed runs leave no archive** — staging cleaned on exit; failed dumps never promoted

### 5.2 Consistency

`pg_dump --format=custom` runs inside a single transaction with MVCC snapshot (PostgreSQL default). This is the standard consistent hot-backup method for logical dumps without `pg_start_backup`.

For point-in-time recovery (PITR), use Hostinger/native WAL archiving separately — not covered by this logical backup.

---

## 6. Restore procedures

### 6.1 Restore test (non-production)

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-restore-test-database.sh
# Or specific artifact:
bash .../vps-restore-test-database.sh --artifact /opt/synqdrive/shared/backups/postgresql/daily/synqdrive-daily-....dump.gpg
```

### 6.2 Production restore (emergency)

```bash
ARTIFACT=/opt/synqdrive/shared/backups/postgresql/daily/synqdrive-daily-YYYYMMDDTHHMMSSZ.dump.gpg
RESTORE_DB=synqdrive

# 1. Stop app
pm2 stop synqdrive

# 2. Decrypt
gpg --decrypt --output /tmp/restore.dump "${ARTIFACT}"

# 3. Recreate database (destructive)
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${RESTORE_DB}';"
sudo -u postgres dropdb "${RESTORE_DB}"
sudo -u postgres createdb "${RESTORE_DB}"

# 4. Restore
sudo -u postgres pg_restore --no-owner --no-acl -d "${RESTORE_DB}" /tmp/restore.dump
rm -f /tmp/restore.dump

# 5. Ownership fix + restart
sudo -u postgres psql -d "${RESTORE_DB}" -f /opt/synqdrive/current/backend/scripts/ops/pg-fix-app-table-ownership.sql
pm2 start synqdrive
curl -sf http://127.0.0.1:3001/api/v1/health
```

### 6.3 Legacy gzip SQL dumps

Pre-2C.2 deploy dumps remain restorable:

```bash
gunzip -c /opt/synqdrive/shared/backups/db-pre-deploy-XXXX.sql.gz | sudo -u postgres psql synqdrive
```

---

## 7. Offsite retention

Local rotation is automated. For offsite:

| Method | Retention approach |
|--------|-------------------|
| **rclone** | Bucket lifecycle rules or `rclone delete --min-age 90d` (manual/quarterly) |
| **S3** | S3 Lifecycle policy → expire after 90 days |
| **Safety** | Keep at least 2 recent objects on offsite matching local `MIN_GENERATIONS` |

Offsite upload uses `--immutable` (rclone) / versioned keys (S3) — copies are never overwritten in place.

---

## 8. Monitoring

| Signal | Path |
|--------|------|
| Last success | `/opt/synqdrive/shared/backups/postgresql/state/last-success.json` |
| Last restore test | `.../state/last-restore-test.json` |
| Cron log | `/var/log/synqdrive-postgresql-backup.log` |
| Manifest | `.../manifest.jsonl` |

**Recommended (2C.3):** Prometheus textfile collector or alert if `last-success.json` age > 26h.

---

## 9. Operational checklist

| Step | Frequency | Owner |
|------|-----------|-------|
| Verify cron installed | Once after deploy | Ops |
| Manual backup after config change | Ad hoc | Ops |
| Restore test | Quarterly | Ops + Eng |
| Review disk usage on backup volume | Weekly | Ops |
| Rotate GPG backup key | Annual | Ops |
| Verify offsite object count ≥ 2 | Monthly | Ops |

---

## 10. Gap closure vs 2C.1

| 2C.1 gap | 2C.2 status |
|----------|-------------|
| DR-003 No scheduled DB backup | ✅ Cron installer |
| DR-001 No offsite PG | ✅ rclone/S3 hook (requires ops config) |
| DR-004 No retention policy | ✅ Local rotation with min generations |
| DR-005 No restore drill | ✅ `vps-restore-test-database.sh` |
| DR-006 Missing `vps-backup-database.sh` | ✅ Implemented |
| DR-012 No backup alerting | ⚠️ State files only (alerting = 2C.3) |

---

## 11. References

- `docs/remediation/disaster-recovery-architecture.md`
- `backend/scripts/ops/postgresql-backup.env.example`
- `docs/deployment/ai-agent-domain-grounding-deployment-runbook-2026-07.md` (legacy restore)
- `docs/runbooks/iam-production-rollout.md` (referenced `vps-backup-database.sh`)

**Changes:** Updated (`ChangesView.tsx`, V4.9.891).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_POSTGRESQL_BACKUP_2026-07-26.md`).
