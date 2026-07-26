# Master Admin Remediation — Phase 2C.3: ClickHouse Backup

**Date:** 2026-07-26  
**Status:** Implemented (ops scripts — **no container/mount/volume changes**)  
**Related:** `docs/remediation/disaster-recovery-architecture.md` (2C.1), `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`

---

## Executive summary

ClickHouse analytics data on the production VPS is now backed up via a **logical `BACKUP DATABASE` pipeline** that:

| Requirement | Implementation |
|-------------|----------------|
| Full logical backup | `BACKUP DATABASE … TO Disk('backups', …)` via `docker exec` |
| **No topology change** | Existing `synqdrive-clickhouse` container + existing `/backups` bind mount only |
| Integrity verification | `unzip -t` + SHA-256 sidecar + `system.backup_log` (best-effort) |
| Offsite copy | GPG-encrypted shared archive → `rclone` / S3 |
| Daily execution | Cron `03:30 UTC` (after PostgreSQL 02:00) |
| Rotation | 14d local shared archive; **min 2 valid generations** |
| Restore test | `vps-restore-test-clickhouse.sh` → `synqdrive_restore_test` |
| No overwrite | Unique timestamp filenames; refuse if mount/archive exists |

**Prerequisite for future topology changes:** Run at least one successful backup + restore test **before** any ClickHouse container rebuild, mount change, or volume migration.

---

## 1. Design constraints (non-negotiable)

Phase 2C.3 explicitly **does not**:

- Rebuild or recreate the ClickHouse container
- Add or change Docker bind mounts
- Resize, move, or replace Docker volumes (`clickhouse_data`)

Phase 2C.3 **does**:

- Use the already-configured `Disk('backups')` → `/backups` mount (`backup_disk.xml`)
- Copy verified artifacts to **shared host storage** outside the release tree
- Encrypt and replicate offsite from shared archives

This matches the remediation principle: **secure logical backup first, topology change later.**

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ synqdrive-clickhouse (UNCHANGED — docker exec only)                       │
│   BACKUP DATABASE synqdrive TO Disk('backups', 'synqdrive-daily-….zip') │
│   existing mount: …/backend/storage/clickhouse/backups → /backups         │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ cp (after verify)
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ /opt/synqdrive/shared/backups/clickhouse/daily/  (immutable generations) │
│   synqdrive-daily-20260726T033001Z.zip.gpg                               │
│   + .sha256 + .meta.json                                                 │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ rclone / S3
                                ▼
                         Offsite object storage
```

### Why two locations?

| Location | Role |
|----------|------|
| Container `/backups` mount | ClickHouse-native `BACKUP`/`RESTORE` target (existing) |
| `/opt/synqdrive/shared/backups/clickhouse/` | Durable archive surviving release switches; offsite source |

---

## 3. Scripts

| Script | Purpose |
|--------|---------|
| `vps-backup-clickhouse.sh` | Main logical backup pipeline |
| `vps-restore-test-clickhouse.sh` | Restore drill to `synqdrive_restore_test` |
| `vps-install-clickhouse-backup-cron.sh` | Daily cron installer |
| `lib/clickhouse-backup-lib.sh` | Shared library |
| `clickhouse-backup.env.example` | VPS configuration template |
| `clickhouse-backup.selftest.sh` | CI-safe overwrite-guard test |

**Dev/local (unchanged):** `backend/scripts/clickhouse-backup-local.sh` — Docker Compose dev only.

---

## 4. VPS setup

### 4.1 Prerequisites

```bash
apt-get install -y gpg unzip rclone   # awscli if S3 offsite
docker ps --filter name=synqdrive-clickhouse   # must be running
```

### 4.2 Configuration

```bash
cp /opt/synqdrive/current/backend/scripts/ops/clickhouse-backup.env.example \
   /opt/synqdrive/shared/clickhouse-backup.env
chmod 600 /opt/synqdrive/shared/clickhouse-backup.env
```

Credentials are read from `backend.env` (`CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`) unless overridden.

Set GPG + offsite (can share PostgreSQL backup key):

```env
CH_BACKUP_GPG_RECIPIENT=backup@synqdrive.eu
CH_BACKUP_OFFSITE_MODE=rclone
CH_BACKUP_RCLONE_REMOTE=hetzner:synqdrive-backups/clickhouse
```

### 4.3 Install cron

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-install-clickhouse-backup-cron.sh
```

Default: **03:30 UTC** daily (`CH_BACKUP_CRON_SCHEDULE`).

### 4.4 First backup + restore test (mandatory before topology change)

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-backup-clickhouse.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-restore-test-clickhouse.sh --drop-after
```

Confirm:

- `state/last-success.json` updated
- `state/last-restore-test.json` shows `table_count > 0`
- Offsite object present (if configured)

---

## 5. Safety guarantees

### 5.1 Never overwrite without valid generation

1. Backup filename includes UTC timestamp — unique per run
2. Aborts if target already exists on container mount **or** shared archive
3. Shared rotation deletes only **verified** archives older than retention while keeping ≥ `CH_BACKUP_MIN_GENERATIONS` (default 2)
4. Failed runs do not promote to `daily/` — container mount file may remain for manual inspection

### 5.2 Integrity checks

| Step | Check |
|------|--------|
| Post-BACKUP | File exists on mount, non-empty |
| Pre-archive | `unzip -t` on logical backup zip |
| Post-archive | SHA-256 sidecar match |
| Optional | `system.backup_log.status` = `BACKUP_CREATED` / `CREATED` |
| Restore test | `RESTORE DATABASE synqdrive_restore_test` + `system.tables` count |

### 5.3 ClickHouse role reminder

PostgreSQL remains **System of Record**. ClickHouse loss is **degraded analytics**, not operational halt — but backups are still required before infra changes.

---

## 6. Restore (production)

```bash
ARTIFACT=/opt/synqdrive/shared/backups/clickhouse/daily/synqdrive-daily-....zip.gpg
MOUNT=$(docker inspect synqdrive-clickhouse --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}')
RESTORE_NAME="manual-restore-$(date -u +%Y%m%dT%H%M%SZ).zip"

gpg --decrypt --output "/tmp/${RESTORE_NAME}" "${ARTIFACT}"
cp "/tmp/${RESTORE_NAME}" "${MOUNT}/${RESTORE_NAME}"

docker exec synqdrive-clickhouse clickhouse-client \
  --user synqdrive --password "$CLICKHOUSE_PASSWORD" \
  --query "RESTORE DATABASE synqdrive FROM Disk('backups', '${RESTORE_NAME}')"
```

**Warning:** Production `RESTORE` may conflict with existing tables — plan maintenance window. Prefer restore test DB drill first.

---

## 7. Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `CH_BACKUP_CONTAINER` | `synqdrive-clickhouse` | Docker container name |
| `CH_BACKUP_ROOT` | `/opt/synqdrive/shared/backups/clickhouse` | Shared archive root |
| `CH_BACKUP_MIN_GENERATIONS` | `2` | Minimum valid archives after rotation |
| `CH_BACKUP_LOCAL_RETENTION_DAYS` | `14` | Shared archive retention |
| `CH_BACKUP_CONTAINER_MOUNT_RETENTION_DAYS` | `7` | Cleanup old zips on `/backups` mount |
| `CH_BACKUP_OFFSITE_MODE` | `none` | `rclone` or `s3` |
| `CH_BACKUP_GPG_RECIPIENT` | — | Production encryption |
| `CH_BACKUP_RESTORE_TEST_DB` | `synqdrive_restore_test` | Drill target |

---

## 8. Future topology change gate

**Do not** run `vps-clickhouse-log-hardening.sh` force-recreate, mount changes, or volume migration until:

| Gate | Evidence |
|------|----------|
| G1 | ≥ 1 successful `vps-backup-clickhouse.sh` |
| G2 | `vps-restore-test-clickhouse.sh` passed |
| G3 | Offsite copy verified (if production) |
| G4 | `last-success.json` < 24h before change window |

After topology change, re-run backup + restore test to validate new layout.

---

## 9. Gap closure vs 2C.1

| 2C.1 gap | 2C.3 status |
|----------|-------------|
| No prod ClickHouse backup schedule | ✅ Cron + script |
| No offsite CH backup | ✅ rclone/S3 hook |
| Local script dev-only | ✅ VPS pipeline added |
| Topology risk before backup | ✅ Documented gate |

---

## 10. References

- `backend/scripts/clickhouse-backup-local.sh` (dev)
- `backend/docker/clickhouse/config.d/backup_disk.xml`
- `backend/docs/clickhouse-local-selfhosted.md`
- `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`
- `docs/remediation/disaster-recovery-architecture.md`

**Changes:** Updated (`ChangesView.tsx`, V4.9.892).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_CLICKHOUSE_BACKUP_2026-07-26.md`).
