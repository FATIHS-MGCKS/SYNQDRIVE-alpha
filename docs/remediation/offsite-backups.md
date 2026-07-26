# Master Admin Remediation — Phase 2C.5: Offsite Backups

**Date:** 2026-07-26  
**Status:** Implemented (central offsite orchestrator)  
**Related:** 2C.2 PostgreSQL · 2C.3 ClickHouse · 2C.4 Redis · `docs/remediation/disaster-recovery-architecture.md`

---

## Executive answer

| Requirement | Status |
|-------------|--------|
| Kein produktionsrelevantes Backup nur auf VPS | ✅ Enforced via `OFFSITE_REQUIRED=true` + daily sync |
| Verschlüsselte Offsite-Kopie | ✅ Nur `*.gpg` (oder verschlüsselte Archive) werden synchronisiert |
| Versionierung | ✅ Immutable timestamped filenames + `manifest.jsonl` |
| Aufbewahrung | ✅ Per-tier remote retention + `min_generations` |
| Integritätsprüfung | ✅ SHA-256 lokal + Größenvergleich remote + wöchentlicher Audit |
| Fehler-Benachrichtigung | ✅ Resend E-Mail + `last-failure.json` |

---

## 1. Backup-Inventar (vollständig)

| Tier | Kritikalität | Lokaler Pfad | Verschlüsselt | Offsite-Pfad | Retention (offsite) | Min Gen |
|------|--------------|--------------|---------------|--------------|---------------------|---------|
| **PostgreSQL** | T0 | `/opt/synqdrive/shared/backups/postgresql/daily/` | ✅ `.gpg` | `postgresql/` | 90d | 2 |
| **Environment** | T0 | `/opt/synqdrive/shared/backups/env/daily/` | ✅ `.tar.gpg` | `env/` | 90d | 2 |
| **ClickHouse** | T2 | `/opt/synqdrive/shared/backups/clickhouse/daily/` | ✅ `.zip.gpg` | `clickhouse/` | 30d | 2 |
| **Redis** | T2 | `/opt/synqdrive/shared/backups/redis/daily/` | ✅ `.rdb.gpg` | `redis/` | 30d | 2 |
| **Legacy pre-deploy SQL** | T1 | `/opt/synqdrive/shared/backups/db-pre-deploy-*.sql.gz` | ❌ | ⚠️ Nicht im Scope | — | Migrieren zu 2C.2 |
| **Uploads / Dokumente** | T0/T1 | `shared/uploads`, `shared/storage/documents` | ❌ | ❌ **Gap** | — | Phase 2C.6+ |
| **PM2 / Nginx / TLS** | T1 | VPS-local | — | ❌ **Gap** | — | Config in git / certbot |

**Produktionsregel:** Tier T0/T2 mit aktivem Backup-Script **muss** nach lokalem Backup innerhalb 24h offsite erscheinen (`vps-verify-offsite-backups.sh`).

---

## 2. Architektur

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Nightly schedule (UTC)                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ 02:00  PostgreSQL backup (2C.2) → local daily/*.gpg                        │
│ 03:30  ClickHouse backup (2C.3) → local daily/*.zip.gpg                    │
│ 04:00  Redis backup (2C.4) → local daily/*.rdb.gpg                         │
│ 05:15  env snapshot + OFFSITE SYNC (2C.5) ← this phase                    │
│ 06:30  Sun  weekly offsite verify                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ vps-sync-offsite-backups.sh                                              │
│  1. Scan tier directories                                                │
│  2. Verify local SHA-256 sidecar                                          │
│  3. Skip if already offsite (size match) — versioning via unique names    │
│  4. rclone copyto / aws s3 cp (immutable)                               │
│  5. Verify remote size                                                    │
│  6. Append manifest.jsonl                                                  │
│  7. Remote retention (min generations guard)                             │
│  8. On failure → Resend alert + last-failure.json                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Hetzner / R2 / S3 (EU)
```

### Central vs per-tier offsite

| Mode | Config |
|------|--------|
| **Central (empfohlen)** | `OFFSITE_CENTRAL_SYNC=true` in `offsite-backup.env`; tier scripts defer offsite |
| Legacy per-tier | `*_SKIP_OFFSITE=false` + tier-specific rclone settings |

---

## 3. Scripts

| Script | Purpose |
|--------|---------|
| `vps-sync-offsite-backups.sh` | Main offsite sync |
| `vps-backup-env-snapshot.sh` | Encrypted `backend.env` + `frontend.env` tarball |
| `vps-verify-offsite-backups.sh` | Local + remote integrity audit |
| `vps-install-offsite-backup-cron.sh` | Cron installer |
| `lib/offsite-backup-lib.sh` | Shared library |
| `offsite-backup.env.example` | Configuration template |

---

## 4. VPS setup

### 4.1 Prerequisites

```bash
apt-get install -y rclone gpg python3   # or awscli for S3 mode
rclone config   # create hetzner:synqdrive-backups remote
```

Enable **bucket versioning** (S3/R2) or rely on immutable unique filenames + lifecycle rules.

### 4.2 Configuration

```bash
cp /opt/synqdrive/current/backend/scripts/ops/offsite-backup.env.example \
   /opt/synqdrive/shared/offsite-backup.env
chmod 600 /opt/synqdrive/shared/offsite-backup.env
```

Required settings:

```env
OFFSITE_REQUIRED=true
OFFSITE_MODE=rclone
OFFSITE_RCLONE_REMOTE=hetzner:synqdrive-backups
OFFSITE_GPG_RECIPIENT=backup@synqdrive.eu
OFFSITE_NOTIFY_EMAIL=ops@your-domain.eu
OFFSITE_CENTRAL_SYNC=true
```

Tier backups should use the same GPG key. Set in tier env files or shared passphrase file.

### 4.3 Install cron

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-install-offsite-backup-cron.sh
```

### 4.4 Verify

```bash
bash .../vps-sync-offsite-backups.sh --dry-run
bash .../vps-backup-env-snapshot.sh
bash .../vps-sync-offsite-backups.sh
bash .../vps-verify-offsite-backups.sh
```

---

## 5. Versionierung

| Mechanism | Detail |
|-----------|--------|
| **Filename versioning** | `synqdrive-daily-20260726T020001Z.dump.gpg` — never overwritten |
| **Sidecars** | `.sha256` + `.meta.json` per artifact |
| **Manifest** | `/opt/synqdrive/shared/backups/offsite/manifest.jsonl` (append-only) |
| **Remote** | `rclone copyto --immutable` / S3 versioning recommended |
| **State** | `state/last-success.json`, `state/last-failure.json` |

---

## 6. Aufbewahrungsrichtlinien

| Tier | Local (tier scripts) | Offsite (orchestrator) | Min generations |
|------|---------------------|------------------------|-----------------|
| PostgreSQL | 30d | 90d | 2 |
| Environment | — | 90d | 2 |
| ClickHouse | 14d | 30d | 2 |
| Redis | 7d | 30d | 2 |

Override via `OFFSITE_TIER_*` variables in `offsite-backup.env`.

**S3:** Configure lifecycle rules matching table above; orchestrator logs reminder.

**Safety:** Remote delete aborts if remaining artifacts `< min_generations`.

---

## 7. Integritätsprüfung

| Stage | Check |
|-------|--------|
| Pre-upload | Local `.sha256` sidecar valid |
| Encryption gate | `OFFSITE_REQUIRE_ENCRYPTION=true` → only `*.gpg` uploaded |
| Post-upload | Remote file size == local size |
| Weekly | `vps-verify-offsite-backups.sh` (cron Sunday) |
| Restore drills | Tier-specific (`vps-restore-test-database.sh`, etc.) |

---

## 8. Benachrichtigungen bei Fehlern

| Channel | Trigger |
|---------|---------|
| **Resend email** | Any `offsite_die` / sync failure → `OFFSITE_NOTIFY_EMAIL` |
| **State file** | `/opt/synqdrive/shared/backups/offsite/state/last-failure.json` |
| **Log** | `/var/log/synqdrive-offsite-backup.log` |
| **Success email** | Optional `OFFSITE_NOTIFY_ON_SUCCESS=true` |

Requires `RESEND_API_KEY` + `EMAIL_DEFAULT_FROM` in `backend.env`.

**Recommended:** Prometheus alert on `last-failure.json` age or log grep (2C.6).

---

## 9. Production compliance checklist

| # | Check | Command / evidence |
|---|-------|---------------------|
| 1 | Offsite config present | `test -f /opt/synqdrive/shared/offsite-backup.env` |
| 2 | `OFFSITE_REQUIRED=true` | grep in env file |
| 3 | Cron installed | `/etc/cron.d/synqdrive-offsite-backup` |
| 4 | Last sync < 26h | `state/last-success.json` |
| 5 | PG artifact offsite | `vps-verify-offsite-backups.sh` |
| 6 | Env snapshot offsite | same |
| 7 | Weekly verify passes | Sunday cron log |
| 8 | Alert email received | intentional dry-run failure test |

---

## 10. Remaining gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| Uploads / private documents offsite | P0 | Not in 2C.5 — object storage sync |
| Legacy `db-pre-deploy-*.sql.gz` | P1 | Unencrypted; migrate or gpg-wrap |
| Prometheus alert wiring | P2 | State file → textfile collector |
| Cross-region offsite | P2 | Single bucket today |

---

## 11. References

- `docs/remediation/postgresql-backup.md` (PR #976)
- `docs/remediation/clickhouse-backup.md` (PR #977)
- `docs/remediation/redis-backup.md` (PR #978)
- `backend/scripts/ops/offsite-backup.env.example`

**Changes:** Updated (`ChangesView.tsx`, V4.9.894).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_OFFSITE_BACKUPS_2026-07-26.md`).
