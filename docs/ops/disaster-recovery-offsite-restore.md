# Disaster Recovery — Offsite Backup Restore Runbook

**Finding:** `MA-BKP-P1-001`  
**Related:** `docs/remediation/offsite-backups.md`, `docs/ops/backup-recovery-key-escrow-procedure.md`

---

## Prerequisites (operator-controlled, never on production VPS)

| Item | Location |
|------|----------|
| Offsite backup credentials | Password manager / secure secret store (dedicated backup IAM user) |
| GPG recovery private key | Escrow bundle from `vps-export-backup-recovery-escrow.sh` + passphrase in password manager |
| Fingerprint reference | `D50BCE8EB4A747F582B9D9C37439FE8C4034183A` (`backup@synqdrive.eu`) |

Production holds **public encryption key only** at `GNUPGHOME=/opt/synqdrive/shared/gpg-backup`.

---

## 1. Access offsite storage

1. Retrieve dedicated backup credentials from secure store.
2. On an **isolated recovery workstation** (not production), configure read access:
   - rclone: `/opt/synqdrive/shared/secrets/rclone.conf` pattern, or local `rclone.conf` with read-only keys
   - S3: `aws s3 ls` with read-only credentials
3. Verify TLS and no public/anonymous bucket access.

Remote layout (default):

```
production/postgresql/*.gpg
production/clickhouse/*.gpg
production/redis/*.gpg
production/env/*.gpg
```

Each artifact has `.sha256` sidecar (and optional `.meta.json`).

---

## 2. Select backup generation

1. List remote tier directory (newest first by timestamp in filename).
2. Prefer latest generation with matching local manifest entry in offsite `manifest.jsonl` if available from separate export.
3. Record artifact basename and tier.

---

## 3. Download and verify checksum

```bash
export OFFSITE_ENV_FILE=/path/to/offsite-backup.env
bash backend/scripts/ops/vps-offsite-restore-drill.sh --tier postgresql --artifact synqdrive-daily-YYYYMMDDTHHMMSSZ.dump.gpg
```

Or manually:

1. Download `artifact.gpg` and `artifact.gpg.sha256`
2. `sha256sum -c artifact.gpg.sha256`
3. Confirm file is GPG-encrypted (not plaintext dump/sql/rdb)

---

## 4. Provide recovery private key (isolated only)

1. Decrypt escrow bundle with operator passphrase (password manager).
2. Import into temporary `GNUPGHOME` on recovery host:

```bash
export GNUPGHOME=/tmp/synqdrive-recovery-keyring
mkdir -p "$GNUPGHOME" && chmod 700 "$GNUPGHOME"
gpg --decrypt backup-recovery-private-key-escrow.gpg | gpg --import
```

**Never** import private key on production VPS.

---

## 5. Decrypt artifact

```bash
gpg --batch --decrypt --output /tmp/restore/plain.dump /tmp/restore/artifact.gpg
```

---

## 6. Restore (isolated environment)

| Tier | Validation command | Production restore |
|------|-------------------|-------------------|
| PostgreSQL | `pg_restore --list plain.dump` | Separate DB instance only |
| ClickHouse | `unzip -t plain.zip` | Drill container only |
| Redis | `redis-check-rdb plain.rdb` | Drill instance only |

Use existing tier restore scripts (`vps-restore-test-database.sh`, etc.) against **non-production** targets.

---

## 7. Verify integrity

- PostgreSQL: TOC entries present, expected schemas/tables
- ClickHouse: archive structure valid
- Redis: `redis-check-rdb` exit 0
- Compare approximate size/date with manifest

---

## 8. Remove recovery key material

```bash
rm -rf /tmp/synqdrive-recovery-keyring
shred -u /tmp/restore/* 2>/dev/null || rm -f /tmp/restore/*
```

Verify production still has **0 secret keys** after any production-side checks.

---

## Disaster scenario: total VPS loss

Authorized operator with:

1. Offsite encrypted backups (all tiers)
2. Escrow recovery key + passphrase
3. This runbook
4. Fresh VPS + `backend.env` / `frontend.env` from separate env backup tier

Can rebuild platform without any secret material from the lost VPS.

**Open until verified:** quarterly offsite restore drill logged; escrow acceptance signed by operator.

---

## Automation reference

| Step | Script | Schedule (UTC) |
|------|--------|----------------|
| Local backup | tier `vps-backup-*.sh` | 02:00–04:00 |
| Offsite sync | `vps-sync-offsite-backups.sh` | 05:15 |
| Remote verify | `vps-verify-offsite-backups.sh` | Sun 06:30 |
| Resilience JSON | `vps-write-resilience-status.sh` | after sync |

Failure semantics: any upload/verify failure → job exit non-zero, `last-failure.json`, local encrypted backups retained.
