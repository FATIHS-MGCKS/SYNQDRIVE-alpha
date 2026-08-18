# Master Admin — Offsite Backup Closure (`MA-BKP-P1-001`)

| Feld | Wert |
|------|------|
| **Finding** | `MA-BKP-P1-001` |
| **Status** | **PARTIALLY CLOSED** — recovery key escrow pending + offsite credentials pending |
| **Datum (UTC)** | 2026-08-18 |
| **Branch** | `cursor/master-admin-offsite-backup-6608` |
| **Related** | `MA-BKP-P0-002` (GPG encryption — **CLOSED**) |

---

## Executive summary

Offsite backup **pipeline, guards, monitoring hooks, and runbooks** are implemented and validated in integration selftests. Production VPS has **encrypted local backups** (PostgreSQL, ClickHouse, Redis) and **zero GPG secret keys**, but **no offsite storage is configured** and **recovery key escrow is not operator-confirmed**.

**Closure blocked until:**

1. Operator stores encrypted recovery key escrow bundle outside production
2. Dedicated offsite S3-compatible storage provisioned with least-privilege credentials
3. Production E2E: upload + remote verify + offsite restore drill

---

## 1. Recovery key precheck (2026-08-18)

| Location | Secret keys | Result |
|----------|-------------|--------|
| Production `GNUPGHOME=/opt/synqdrive/shared/gpg-backup` | **0** | ✅ Public key only |
| Public fingerprint | `D50BCE8EB4A747F582B9D9C37439FE8C4034183A` | ✅ Matches canonical |
| Repository | Public key only (`keys/synqdrive-backup-recovery.pub.asc`) | ✅ |
| Cloud Agent ephemeral keyring `/tmp/synqdrive-backup-keygen` | **1** (bootstrap) | ⚠️ Must escrow then purge |
| Logs / CI artifacts / Markdown | None found | ✅ |
| Operator escrow bundle | **Not confirmed** | ❌ BLOCKER |

**Escrow procedure:** `docs/ops/backup-recovery-key-escrow-procedure.md`  
**Export script:** `backend/scripts/ops/vps-export-backup-recovery-escrow.sh` (requires `BACKUP_RECOVERY_ESCROW_PASSPHRASE` — not in agent secrets)

---

## 2. Offsite architecture

```
Production VPS (local encrypted *.gpg + .sha256)
        │
        ▼
vps-sync-offsite-backups.sh
  → plaintext guard (*.gpg only)
  → local checksum verify
  → upload (rclone/S3)
  → remote size verify
  → manifest.jsonl + tier state
  → prometheus textfile + resilience-status.json
        │
        ▼
Independent S3-compatible storage
  production/postgresql/
  production/clickhouse/
  production/redis/
  production/env/
```

| Component | Implementation |
|-----------|----------------|
| Orchestrator | `vps-sync-offsite-backups.sh` |
| Library | `lib/offsite-backup-lib.sh` v2c5.2 |
| Setup | `vps-setup-offsite-backup.sh` |
| Verify | `vps-verify-offsite-backups.sh` |
| Restore drill | `vps-offsite-restore-drill.sh` |
| Resilience JSON | `vps-write-resilience-status.sh` → `SYNQDRIVE_RESILIENCE_STATUS_JSON` |
| Cron | `vps-install-offsite-backup-cron.sh` (05:15 sync, Sun 06:30 verify) |

---

## 3. Storage provider status

| Provider | Status |
|----------|--------|
| Hostinger Object Storage | Not in billing catalog (VPS + DOMAIN only) |
| Hetzner / R2 / B2 (documented) | **Not provisioned** — no credentials in secrets |
| Production `offsite-backup.env` | **Missing** |
| Production `rclone` | **Not installed** |
| Production offsite cron | **Not installed** |

**Canonical target class:** S3-compatible object storage, EU region, dedicated backup IAM user, private bucket, versioning/lifecycle recommended.

---

## 4. Credential model

- Dedicated backup credentials only (write/list/read; delete only for retention if required)
- Stored in `/opt/synqdrive/shared/offsite-backup.env` (chmod 600) and `/opt/synqdrive/shared/secrets/rclone.conf`
- Never in git, logs, frontend, or Markdown
- App runtime credentials (`STORAGE_DRIVER=local`) do **not** grant backup storage access

---

## 5. Encryption boundary

| Stage | Status |
|-------|--------|
| Local tier backups | ✅ `.gpg` on production (2026-08-18 acceptance) |
| Plaintext upload guard | ✅ Implemented — blocks `.dump`, `.sql`, `.rdb`, `.zip`, etc. |
| Remote storage | ❌ Not configured |
| Recovery private key on production | ✅ **0 secret keys verified** |

---

## 6. Tier production results (local only)

| Tier | Local encrypted artifact | Offsite | Remote verify |
|------|-------------------------|---------|---------------|
| PostgreSQL | `synqdrive-daily-20260818T191122Z.dump.gpg` (54 MB) | ❌ | ❌ |
| ClickHouse | `synqdrive-daily-20260818T191213Z.zip.gpg` (3.2 MB) | ❌ | ❌ |
| Redis | 2× `.rdb.gpg` generations | ❌ | ❌ |

---

## 7. Integration test evidence (agent runtime)

| Test | Result |
|------|--------|
| `offsite-backup.selftest.sh` | ✅ PASS |
| `offsite-backup.integration-selftest.sh` | ✅ PASS (rclone local backend: upload, verify, failure, prom + resilience JSON) |
| Plaintext guard | ✅ PASS |
| `production/` path prefix | ✅ PASS |
| Auth/remote failure | ✅ verify exits non-zero; local artifact preserved |

---

## 8. Failure safety (integration)

| Scenario | Expected | Verified |
|----------|----------|----------|
| Plaintext artifact | FAIL (die) | ✅ |
| Remote missing after upload | FAIL | ✅ |
| Local backup after failure | Preserved | ✅ |
| Offsite unreachable | FAIL (verify) | ✅ |

---

## 9. Restore drill

| Drill | Status |
|-------|--------|
| Local decrypt + `pg_restore --list` (MA-BKP-P0-002) | ✅ 3781 TOC entries |
| Offsite download → decrypt (isolated) | ❌ Pending offsite storage |
| Key independence (no prod private key) | ✅ Production 0 secret keys |

---

## 10. Monitoring

| Metric / state | Path |
|----------------|------|
| `synqdrive_offsite_last_success_timestamp` | `synqdrive_backup.prom` |
| `synqdrive_offsite_remote_verify_ok` | same |
| `synqdrive_offsite_failure` | same |
| `resilience-status.json` | `/opt/synqdrive/shared/resilience-status.json` |
| `last-success.json` / `last-failure.json` | `backups/offsite/state/` |

Master Admin consumes via `GET /admin/ops/resilience-status` (`SYNQDRIVE_RESILIENCE_STATUS_JSON`).

---

## 11. Retention

Per `docs/remediation/offsite-backups.md`:

| Tier | Offsite retention | Min generations |
|------|-------------------|-----------------|
| PostgreSQL | 90d | 2 |
| ClickHouse | 30d | 2 |
| Redis | 30d | 2 |
| Environment | 90d | 2 |

---

## 12. Operator actions required (before CLOSED)

### A. Recovery key escrow

1. Set `BACKUP_RECOVERY_ESCROW_PASSPHRASE` in password manager + Cursor Runtime Secret
2. Run `vps-export-backup-recovery-escrow.sh` on secure workstation (not production)
3. Store `backup-recovery-private-key-escrow.gpg` in password manager vault
4. Confirm fingerprint `D50BCE8EB4A747F582B9D9C37439FE8C4034183A`
5. Purge ephemeral agent keyring when done

### B. Offsite storage

1. Provision S3-compatible bucket (Hetzner/R2/B2 recommended)
2. Create dedicated backup credentials (least privilege)
3. Add Cursor secrets: `OFFSITE_S3_ENDPOINT`, `OFFSITE_S3_ACCESS_KEY_ID`, `OFFSITE_S3_SECRET_ACCESS_KEY`, `OFFSITE_S3_BUCKET`
4. On VPS: deploy release, run `vps-setup-offsite-backup.sh`, configure `offsite-backup.env`
5. Run `vps-sync-offsite-backups.sh` + `vps-verify-offsite-backups.sh` (exit 0)
6. Run `vps-offsite-restore-drill.sh --tier postgresql` from isolated recovery host

---

## 13. Remaining risks

| Risk | Severity |
|------|----------|
| All production backups VPS-only until offsite configured | **Critical** |
| Recovery private key only on ephemeral agent VM | **High** until escrow confirmed |
| Legacy unencrypted `db-pre-deploy-*.sql.gz` on VPS | Medium (out of 2C.5 scope) |

---

## 14. Closure decision

| Criterion | Met |
|-----------|-----|
| Offsite independent of VPS | ❌ |
| Encrypted-only remote | ❌ (no remote) |
| PG/CH/Redis offsite | ❌ |
| Remote integrity | ❌ |
| Offsite restore drill | ❌ |
| Recovery key escrow confirmed | ❌ |
| No private key on production | ✅ |
| Automation on production | ❌ |
| Fail-closed semantics | ✅ (code + integration test) |

**`MA-BKP-P1-001` = PARTIALLY CLOSED** — not removed from Blocking Before Production (A3).

---

## References

- `docs/remediation/offsite-backups.md`
- `docs/ops/disaster-recovery-offsite-restore.md`
- `docs/ops/backup-recovery-key-escrow-procedure.md`
- `docs/final/master-admin-backup-gpg-encryption-closure.md`
- `architecture/MASTER_ADMIN_OFFSITE_BACKUPS_2026-07-26.md`
