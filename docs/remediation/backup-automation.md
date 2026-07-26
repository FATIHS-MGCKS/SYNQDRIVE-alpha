# Master Admin Remediation — Phase 2C.7: Backup Automation

**Date:** 2026-07-26  
**Status:** Implemented (unified scheduler + retry + monitoring)  
**Related:** 2C.2 PostgreSQL · 2C.3 ClickHouse · 2C.4 Redis · 2C.5 Offsite · 2C.6 Restore Validation

---

## Executive answer

| Requirement | Status |
|-------------|--------|
| Sämtliche Backups automatisiert | ✅ Ein Cron-Job (`synqdrive-backup-automation`) für alle Tiers |
| Scheduler / Cron | ✅ `vps-install-backup-automation-cron.sh` |
| Logs | ✅ `/var/log/synqdrive-backup/<job>.log` |
| Exit Codes | ✅ 0=OK, 1=Fail, 2=Config |
| Monitoring | ✅ Prometheus-Metriken + `vps-backup-automation-health.sh` |
| Retry | ✅ 3 Versuche, 120s Backoff (konfigurierbar) |
| Fehlerbehandlung | ✅ State JSON + Resend-E-Mail — kein Fehler unbemerkt |

**Regel:** Kein fehlgeschlagenes Backup darf unbemerkt bleiben — Retry → State → E-Mail → Health-Watchdog → Prometheus Alert.

---

## 1. Architektur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ /etc/cron.d/synqdrive-backup-automation (UTC)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 02:00  postgresql    → vps-run-backup-job → vps-backup-database.sh          │
│ 03:30  clickhouse    → vps-run-backup-job → vps-backup-clickhouse.sh        │
│ 04:00  redis         → vps-run-backup-job → vps-backup-redis.sh           │
│ 05:15  env-snapshot  → vps-run-backup-job → vps-backup-env-snapshot.sh      │
│ 05:15  offsite-sync  → vps-run-backup-job → vps-sync-offsite-backups.sh     │
│ 06:30  Sun offsite-verify → vps-run-backup-job → vps-verify-offsite-backups │
│ 06:45  backup-health → vps-backup-automation-health.sh (SLA watchdog)       │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ vps-run-backup-job.sh                                                        │
│  • Retry (default 3×, 120s backoff)                                          │
│  • Per-job log append                                                        │
│  • State: /opt/synqdrive/shared/backups/automation/state/<job>.json          │
│  • On final failure → Resend alert                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Prüfmatrix (Scheduler · Cron · Logs · Exit · Monitoring · Retry · Fehler)

| Aspekt | Implementierung | Pfad / Wert |
|--------|-----------------|-------------|
| **Scheduler** | Linux cron via `/etc/cron.d/synqdrive-backup-automation` | `vps-install-backup-automation-cron.sh` |
| **Cron** | 7 Einträge (6 Backup-Jobs + Health) | Siehe Schedule oben |
| **Logs** | Append pro Job | `/var/log/synqdrive-backup/postgresql.log` etc. |
| **Exit Codes** | 0 success, 1 fail, 2 config | `vps-run-backup-job.sh` |
| **Monitoring** | Prometheus textfile + Alerts | `metrics.prom` + `alerts.yml` → `synqdrive_backups` |
| **Retry** | 3× default, exponential via fixed backoff | `BACKUP_AUTOMATION_DEFAULT_RETRIES` |
| **Fehler** | E-Mail (Resend) + state + health escalation | `BACKUP_AUTOMATION_NOTIFY_EMAIL` |

### State-Datei (pro Job)

`/opt/synqdrive/shared/backups/automation/state/postgresql.json`:

```json
{
  "job": "postgresql",
  "last_attempt_at": "2026-07-26T02:00:45Z",
  "last_success_at": "2026-07-26T02:00:45Z",
  "last_failure_at": null,
  "last_exit_code": 0,
  "last_duration_ms": 8420,
  "consecutive_failures": 0,
  "host": "srv1374778.hstgr.cloud"
}
```

### Prometheus-Metriken

```
synqdrive_backup_job_last_success_timestamp{job="postgresql"}
synqdrive_backup_job_healthy{job="postgresql"}              # 1 = within SLA
synqdrive_backup_job_consecutive_failures{job="postgresql"}
```

Alerts (`backend/monitoring/prometheus/alerts.yml`):
- `BackupJobUnhealthy` (critical, 30m)
- `BackupJobConsecutiveFailures` (critical, ≥2)
- `BackupJobStale` (warning, >26h)

---

## 3. Backup-Jobs (vollständig)

| Job | Script | Schedule (UTC) | SLA |
|-----|--------|----------------|-----|
| `postgresql` | `vps-backup-database.sh` | 02:00 daily | 26h |
| `clickhouse` | `vps-backup-clickhouse.sh` | 03:30 daily | 26h |
| `redis` | `vps-backup-redis.sh` | 04:00 daily | 26h |
| `env-snapshot` | `vps-backup-env-snapshot.sh` | 05:15 daily | 26h |
| `offsite-sync` | `vps-sync-offsite-backups.sh` | 05:15 daily | 26h |
| `offsite-verify` | `vps-verify-offsite-backups.sh` | 06:30 Sun | 192h |
| `backup-health` | `vps-backup-automation-health.sh` | 06:45 daily | 26h |

---

## 4. VPS-Einrichtung

```bash
# 1. Env-Dateien
cp backend/scripts/ops/backup-automation.env.example /opt/synqdrive/shared/backup-automation.env
cp backend/scripts/ops/postgresql-backup.env.example /opt/synqdrive/shared/postgresql-backup.env
cp backend/scripts/ops/clickhouse-backup.env.example /opt/synqdrive/shared/clickhouse-backup.env
# + redis-backup.env, offsite-backup.env (bestehend)

# 2. GPG + NOTIFY
# BACKUP_AUTOMATION_NOTIFY_EMAIL=ops@synqdrive.eu
# PG_BACKUP_GPG_PASSPHRASE_FILE=/root/.synqdrive-backup-passphrase

# 3. Unified Cron installieren
bash backend/scripts/ops/vps-install-backup-automation-cron.sh

# 4. Manueller Testlauf
bash backend/scripts/ops/vps-run-backup-job.sh --job postgresql --script backend/scripts/ops/vps-backup-database.sh
bash backend/scripts/ops/vps-backup-automation-health.sh

# 5. Legacy Cron entfernen (nach Verifikation)
# rm /etc/cron.d/synqdrive-redis-backup /etc/cron.d/synqdrive-offsite-backup
```

### Prometheus textfile (optional)

Wenn `node_exporter` mit textfile collector läuft:

```bash
# Symlink oder copy metrics.prom
ln -sf /opt/synqdrive/shared/backups/automation/metrics.prom \
  /var/lib/prometheus/node-exporter/synqdrive-backup.prom
```

---

## 5. Fehlerbehandlung (kein unbemerkter Ausfall)

| Stufe | Aktion |
|-------|--------|
| 1 | Script exit ≠ 0 → Retry (bis 3×) |
| 2 | Nach finalem Fail → `state/<job>.json` mit `consecutive_failures++` |
| 3 | Resend E-Mail an `BACKUP_AUTOMATION_NOTIFY_EMAIL` |
| 4 | Tier-spezifische Alerts (offsite: `last-failure.json` zusätzlich) |
| 5 | Täglich 06:45 UTC → `vps-backup-automation-health.sh` prüft SLA |
| 6 | Health fail → weitere E-Mail + Prometheus `healthy=0` |
| 7 | Prometheus Alertmanager → `BackupJobUnhealthy` / `ConsecutiveFailures` |

---

## 6. Logs

| Log | Inhalt |
|-----|--------|
| `/var/log/synqdrive-backup/postgresql.log` | pg_dump pipeline |
| `/var/log/synqdrive-backup/redis.log` | RDB snapshot |
| `/var/log/synqdrive-backup/offsite-sync.log` | rclone/S3 sync |
| `/var/log/synqdrive-offsite-backup.log` | Legacy (wenn alter Cron aktiv) |

Logs rotieren via `setup-log-limits.sh` (pm2-logrotate / journald).

---

## 7. Migration von Legacy-Cron

| Alt | Neu |
|-----|-----|
| `/etc/cron.d/synqdrive-redis-backup` | `synqdrive-backup-automation` Job `redis` |
| `/etc/cron.d/synqdrive-offsite-backup` | Jobs `env-snapshot`, `offsite-sync`, `offsite-verify` |

Legacy-Installer bleiben kompatibel, verweisen auf 2C.7.

---

## 8. Tests

```bash
bash backend/scripts/ops/backup-automation.selftest.sh   # retry, state, metrics
bash backend/scripts/ops/vps-run-backup-job.sh --job redis --script ... --dry-run  # via redis script
```

---

## 9. Bekannte Lücken

| Lücke | Auswirkung |
|-------|------------|
| Uploads/Documents ohne Backup-Script | Nicht im Scheduler — Phase 2C.8+ |
| Prometheus textfile nicht auto-deployed | Manuell symlinken oder custom scrape |
| CH `Disk('backups')` Mount auf VPS | `clickhouse-backup.env` Pfad prüfen |

---

## 10. Abnahme-Checkliste

- [ ] `vps-install-backup-automation-cron.sh` auf VPS
- [ ] Manueller Lauf aller Jobs exit 0
- [ ] `state/*.json` mit `last_success_at` < 26h
- [ ] Test-Fail → E-Mail erhalten
- [ ] `metrics.prom` generiert
- [ ] Legacy-Cron deaktiviert
- [ ] Restore-Validation Quartals-Cron separat (2C.6)

---

## Verwandte Dokumentation

- `docs/remediation/offsite-backups.md`
- `docs/remediation/redis-backup.md`
- `docs/remediation/restore-validation.md`
- `architecture/MASTER_ADMIN_BACKUP_AUTOMATION_2026-07-26.md`
