# Master Admin — Backup GPG Encryption Closure (MA-BKP-P0-002)

| Feld | Wert |
|------|------|
| **Finding-ID** | `MA-BKP-P0-002` |
| **Severity** | P0 |
| **Status** | **CLOSED** |
| **Datum (UTC)** | 2026-08-18 |
| **Scope** | Backup encryption for PostgreSQL, ClickHouse, Redis tier crons |

---

## 1. Ursprünglicher Fehler

Nightly backup crons (`synqdrive-clickhouse-backup`, `synqdrive-redis-backup`) exited non-zero seit 2026-07-27:

```
ERROR: encryption required — set CH_BACKUP_GPG_RECIPIENT or CH_BACKUP_GPG_PASSPHRASE_FILE
```

Keine verschlüsselten `.gpg`-Artefakte in `daily/`-Verzeichnissen. PostgreSQL-Tier-Cron fehlte vollständig.

---

## 2. Root Cause

| Ursache | Detail |
|---------|--------|
| **Fehlende GPG-Konfiguration** | Kein `backup-gpg.env`, kein Keyring unter `/opt/synqdrive/shared/gpg-backup` |
| **Kein Public Key** | Root-GPG-Keyring leer (0 public keys, 0 secret keys) |
| **Fehlende Tier-Env** | `redis-backup.env` nicht vorhanden; `clickhouse-backup.env` ohne Encryption-Settings |
| **Cron-Kontext** | Crons liefen ohne `GNUPGHOME` — selbst nach Key-Import wäre Keyring nicht adressiert |
| **Design korrekt** | Scripts fail-by-design ohne Encryption (kein unverschlüsseltes Backup in Production) |

Reproduktion: identischer Fehler im Cron-Kontext (`root`, `PATH` aus `/etc/cron.d/*`, keine GPG-Variablen).

---

## 3. Encryption Architecture

**Kanonisches Modell:** Public-key recipient encryption (asymmetric).

| Komponente | Production VPS | Recovery |
|------------|----------------|----------|
| Key material | Public key only | Private recovery key (offline) |
| Keyring | `/opt/synqdrive/shared/gpg-backup` (`GNUPGHOME`) | Separate secure environment |
| Config | `/opt/synqdrive/shared/backup-gpg.env` | — |
| Recipient label | `backup@synqdrive.eu` | Same |
| Fingerprint | `D50BCE8EB4A747F582B9D9C37439FE8C4034183A` | Same |
| Public key file | `backend/scripts/ops/keys/synqdrive-backup-recovery.pub.asc` | — |

Legacy symmetric `*_GPG_PASSPHRASE_FILE` bleibt für Dev-Migration unterstützt, wird in Production nicht verwendet.

Shared library: `backend/scripts/ops/lib/gpg-backup-lib.sh`

---

## 4. Recipient / Fingerprint Strategy

- Vollständiger 40-Zeichen-Fingerprint als kanonische Referenz (`SYNQDRIVE_BACKUP_GPG_FINGERPRINT`)
- Vor jedem Backup: `gpg_backup_verify_recipient_keyring()` — exakt **ein** Public Key
- Falscher/fehlender Fingerprint → non-zero exit
- Integrity ohne Private Key: `gpg --list-packets` + Subkey-ID-Match (kein Decrypt auf VPS)

---

## 5. Secret Safety

| Check | Ergebnis |
|-------|----------|
| Passphrase in CLI args | **PASS** — nicht verwendet |
| Private key on VPS | **PASS** — 0 secret keys (`gpg --list-secret-keys`) |
| Secrets in Repo | **PASS** — nur `.pub.asc` committed |
| Secrets in Cron | **PASS** — nur `GNUPGHOME` path |
| Secrets in Logs | **PASS** — keine Passphrases/Keys geloggt |
| `ps` exposure | **PASS** — public-key encrypt only |

**Operator-Hinweis:** Private Recovery Key muss offline gesichert werden (nicht auf Production-VPS). Bootstrap-Keypair wurde für Acceptance erzeugt; Private Key liegt **nicht** im Repository.

---

## 6. Permissions

| Path | Mode |
|------|------|
| `/opt/synqdrive/shared/gpg-backup` | `700` |
| `backup-gpg.env` | `600` |
| PostgreSQL `.dump.gpg` | `600` |
| ClickHouse/Redis `.gpg` | `644` (root-owned, non-world) |
| Cron logs | `640` |

---

## 7. PostgreSQL Result

| Check | Ergebnis |
|-------|----------|
| `pg_dump -Fc` | **PASS** |
| GPG encrypt | **PASS** |
| Artifact | `synqdrive-daily-20260818T191122Z.dump.gpg` (54 MB) |
| SHA-256 sidecar | **PASS** |
| Plaintext removed | **PASS** (staging clean) |
| Exit code | **0** |
| Cron installed | `0 2 * * *` UTC → `/etc/cron.d/synqdrive-postgresql-backup` |

---

## 8. ClickHouse Result

| Check | Ergebnis |
|-------|----------|
| Container | Gestartet für Acceptance (`synqdrive-clickhouse` war gestoppt) |
| Logical backup | **PASS** |
| GPG encrypt | **PASS** |
| Artifact | `synqdrive-daily-20260818T191213Z.zip.gpg` (3.2 MB) |
| SHA-256 sidecar | **PASS** |
| Exit code | **0** |

---

## 9. Redis Result

| Check | Ergebnis |
|-------|----------|
| RDB snapshot | **PASS** |
| GPG encrypt | **PASS** |
| Artifacts | 2 valid generations after acceptance runs |
| `redis-check-rdb` via packet verify | **PASS** |
| Exit code | **0** |
| Cron reinstalled | `GNUPGHOME` in `/etc/cron.d/synqdrive-redis-backup` |

---

## 10. Cron / Automation Result

| Tier | Schedule (UTC) | GNUPGHOME | Manual run | Cron-context sim |
|------|----------------|-----------|------------|------------------|
| PostgreSQL | `0 2 * * *` | ✅ | exit 0 | N/A (installed during acceptance) |
| ClickHouse | `30 3 * * *` | ✅ | exit 0 | — |
| Redis | `0 4 * * *` | ✅ | exit 0 | exit 0 (second run) |

Setup script: `vps-setup-backup-gpg.sh` (idempotent public-key import).

---

## 11. Failure Tests

| Scenario | Ergebnis |
|----------|----------|
| Missing recipient | **FAIL** (selftest + historical cron logs) |
| Wrong fingerprint (`REDIS_BACKUP_GPG_RECIPIENT_FINGERPRINT`) | **FAIL** dry-run |
| GPG unavailable | **FAIL** (selftest) |
| Unwritable output | **FAIL** (selftest) |
| Failed run destroys prior backup | **PASS** — 2 Redis generations retained |

---

## 12. Decrypt / Restore Validation

Isolierte Umgebung (Cloud Agent, Private Key **nicht** auf VPS):

1. Kopie `synqdrive-daily-20260818T191122Z.dump.gpg` von Production
2. `gpg --decrypt` mit Recovery Private Key
3. `pg_restore --list` → 3781 TOC entries, Format CUSTOM
4. Decrypted SHA-256: `683ccd899ae53799dd15c71fc8f511ba60865606698bbfa5084ecf5c4925a100`

**PASS** — Entschlüsselbarkeit und Dump-Integrität nachgewiesen. Production-DB nicht überschrieben.

---

## 13. Checksums

| Artifact | SHA-256 (from sidecar) |
|----------|------------------------|
| PG `.dump.gpg` | verified via `sha256sum -c` in artifact directory |
| CH `.zip.gpg` | `3463566696039edfd77aa5ee0e945bef63dd65941dac82e721a859a453dad59f` |
| Redis `.rdb.gpg` | sidecar present per generation |

---

## 14. Monitoring Handoff

| Signal | Location |
|--------|----------|
| PG last success timestamp | `/opt/synqdrive/shared/node-exporter-textfile/synqdrive_backup.prom` |
| Per-tier last success | `*/state/last-success.json` under each backup root |
| Failure | Script non-zero exit → cron mail/log |

Alertmanager-Integration (A4) nicht Teil dieses Tasks.

---

## 15. Production Evidence

| Feld | Wert |
|------|------|
| **Pre-fix SHA** | `8ff7bcc3` |
| **Fix SHA** | `2fe44071` |
| **Production release** | `20260818190536_v4994` |
| **Rollback target** | `20260818182759_v4994` / `8ff7bcc3` |
| **Deploy health** | `https://app.synqdrive.eu/api/v1/health` → 200 |

---

## 16. Verbleibende Risiken

| Risiko | Severity | Owner |
|--------|----------|-------|
| Private recovery key offline storage | P1 ops | Operator — export from bootstrap, store in HSM/password vault |
| Offsite sync not configured (`MA-BKP-P1-001` / A3) | P1 | Separate task |
| ClickHouse container was stopped 4 days — backup cron would fail until container up | P2 ops | Monitor container health |
| Legacy unencrypted `db-pre-deploy-*.sql.gz` | P2 | Migrate to encrypted tier over time |

---

## Closure

**MA-BKP-P0-002 = CLOSED**

- GPG encryption works non-interactively
- All three tier backups produce encrypted artifacts with checksums
- Decrypt/restore validated in isolated environment
- No secret leakage on production host

**Changes / Architektur:** `architecture/MASTER_ADMIN_BACKUP_GPG_ENCRYPTION_2026-08-18.md`
