# Master Admin Remediation — Phase 2C.6: Restore Validation

**Date:** 2026-07-26  
**Status:** Implemented (isolated drill framework + CI selftest)  
**Related:** 2C.2 PostgreSQL · 2C.3 ClickHouse · 2C.4 Redis · 2C.5 Offsite · `docs/remediation/offsite-backups.md`

---

## Executive answer

| Requirement | Status |
|-------------|--------|
| Vollständige Restore-Tests in isolierter Umgebung | ✅ Script-Framework + Docker-Drill (`restore-validation.local.sh`) |
| Produktionsdaten unverändert | ✅ Erzwungen via `RESTORE_VALIDATION_MODE=isolated` + `ALLOW_PRODUCTION=false` |
| PostgreSQL | ✅ `vps-restore-test-postgresql.sh` → `synqdrive_restore_*` nur auf Drill-Postgres |
| ClickHouse | ✅ `vps-restore-test-clickhouse.sh` → isolierte CH-Instanz/Port |
| Redis | ✅ `vps-restore-test-redis.sh` → `redis-check-rdb` only (live Redis unberührt) |
| Uploads | ✅ Drill wenn Backup-Tier vorhanden; sonst `blocked` (Backup-Tier noch nicht auf Prod) |
| Dokumente | ✅ Drill + optional PG-Metadaten-Cross-Check; sonst `blocked` |
| Konfiguration | ✅ `vps-restore-test-env.sh` → decrypt + tar verify, kein Overwrite von `backend.env` |
| Dauer / Erfolg / Fehler / Integrität dokumentiert | ✅ JSON-Report pro Lauf |

---

## 1. Sicherheitsprinzipien (nicht verhandelbar)

1. **`RESTORE_VALIDATION_MODE=isolated`** — Pflicht
2. **`RESTORE_VALIDATION_ALLOW_PRODUCTION=false`** — Pflicht
3. **PostgreSQL** — nur Datenbanken `synqdrive_restore_*` auf Drill-Host (Port ≠ Prod oder separater Container)
4. **ClickHouse** — nur isolierte Instanz (`RESTORE_VALIDATION_CH_PORT`, z. B. `59000`)
5. **Redis** — nur Integritätsdrill (`redis-check-rdb`), **kein** `vps-restore-redis.sh` in Validation
6. **Uploads / Dokumente** — extract nach `/tmp` oder Staging; **nie** nach `/opt/synqdrive/shared/uploads` oder `storage/documents`
7. **Konfiguration** — decrypt nach Staging; **nie** `backend.env` / `frontend.env` überschreiben

Verstöße werden von `lib/restore-validation-lib.sh` mit Exit abgebrochen.

---

## 2. Testarchitektur

```
┌──────────────────────────────────────────────────────────────────────────┐
│ vps-restore-validation.sh (Orchestrator)                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. postgresql   → CREATE synqdrive_restore_<run> → pg_restore → counts   │
│ 2. clickhouse   → RESTORE on isolated CH → table/row smoke               │
│ 3. redis        → decrypt → redis-check-rdb (no live restore)            │
│ 4. configuration→ gpg → tar -tf → required env keys                        │
│ 5. uploads      → gpg → tar extract → sample sha256                      │
│ 6. documents    → gpg → tar extract → optional objectKey cross-check     │
├──────────────────────────────────────────────────────────────────────────┤
│ Output: restore-validation/reports/restore-validation-<run>.json         │
│         restore-validation/reports/latest-report.json                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Ausführungsmodi

| Modus | Script | Umgebung |
|-------|--------|----------|
| **VPS Quartals-Drill** | `vps-restore-validation.sh` | Drill-Postgres/CH auf localhost-Nebenports |
| **Vollständiger E2E-Drill** | `restore-validation.local.sh` | Docker: PG `:55432`, CH `:59000`, Redis `:56379` |
| **CI / Agent Selftest** | `restore-validation.selftest.sh` | Fixtures ohne Docker (env/uploads/documents) |

---

## 3. Ergebnisse — isolierter Selftest (2026-07-26, Cloud Agent)

**Umgebung:** Kein Docker-Daemon verfügbar → PG/CH/Redis als `blocked`; Konfiguration/Uploads/Dokumente mit synthetischen GPG-Fixtures getestet.

| Tier | Dauer | Erfolg | Fehler | Datenintegrität |
|------|-------|--------|--------|-----------------|
| **PostgreSQL** | 0 ms | ❌ | `selftest: no isolated Postgres` | `blocked` |
| **ClickHouse** | 0 ms | ❌ | `selftest: no isolated ClickHouse` | `blocked` |
| **Redis** | 0 ms | ❌ | `selftest: no redis-check-rdb fixture` | `blocked` |
| **Konfiguration** | ~350 ms | ✅ | — | `passed` — `backend.env` + `frontend.env` im Archiv; Keys `DATABASE_URL`, `REDIS_HOST`, `CLERK_SECRET_KEY` vorhanden |
| **Uploads** | ~280 ms | ✅ | — | `passed` — Archiv entpackbar; Sample-SHA256 verifiziert |
| **Dokumente** | ~290 ms | ✅ | — | `passed` — Archiv entpackbar; Metadaten-Cross-Check `skipped` (kein PG-Drill) |

**Gesamt Selftest:** ~920 ms · `restore-validation selftest: OK`

> **Hinweis:** Vollständiger 6-Tier-Nachweis erfordert `bash backend/scripts/ops/restore-validation.local.sh` auf einem Host mit Docker (VPS-Staging oder Entwickler-Maschine).

---

## 4. Ergebnisse — erwarteter VPS-Drill (nach 2C.2–2C.5 Rollout)

Vorlage für den ersten Produktions-Drill auf dem VPS (isolierte Drill-Container, **keine** Prod-Ports):

| Tier | Erwartete Dauer | Integritätsprüfung |
|------|-----------------|-------------------|
| PostgreSQL | 2–15 min (DB-Größe) | `organizations` count > 0; `_prisma_migrations` count ≥ 1 |
| ClickHouse | 1–5 min | `system.tables` count > 0; `sum(total_rows)` ≥ 0 |
| Redis | 5–30 s | `redis-check-rdb` exit 0 |
| Konfiguration | 2–10 s | tar listing + required keys |
| Uploads | 30 s–5 min | file_count > 0; sample hash (wenn Backup-Tier aktiv) |
| Dokumente | 1–10 min | objectKey aus PG-Drill in Archiv (wenn Backup-Tier aktiv) |

**Aktueller VPS-Stand (vor Upload/Document-Backup-Tier):** Uploads und Dokumente liefern voraussichtlich `blocked` bis Phase 2C.7+.

---

## 5. Scripts

| Script | Zweck |
|--------|--------|
| `vps-restore-validation.sh` | Orchestrator — alle Tiers, JSON-Report |
| `vps-restore-test-postgresql.sh` | Isolierter PG-Restore (`--keep-db` für Dokumenten-Cross-Check) |
| `vps-restore-test-clickhouse.sh` | Isolierter CH-Restore |
| `vps-restore-test-redis.sh` | RDB-Integrität (bestehend, 2C.4) |
| `vps-restore-test-env.sh` | Env-Snapshot-Drill |
| `vps-restore-test-uploads.sh` | Uploads-Archiv-Drill |
| `vps-restore-test-documents.sh` | Dokumente-Archiv + optional PG-Cross-Check |
| `lib/restore-validation-lib.sh` | Shared lib (Timing, Safety, Report) |
| `restore-validation.local.sh` | Vollständiger Docker-E2E-Drill |
| `restore-validation.selftest.sh` | CI-Fixture-Test |
| `vps-install-restore-validation-cron.sh` | Quartals-Cron (1. Tag, 07:00 UTC) |
| `restore-validation.env.example` | Konfigurationsvorlage |

---

## 6. VPS-Einrichtung

```bash
# 1. Isolierte Drill-Postgres (Beispiel Docker)
docker run -d --name synqdrive-drill-pg \
  -e POSTGRES_USER=synqdrive -e POSTGRES_PASSWORD=<secret> \
  -p 55432:5432 postgres:16-alpine

# 2. Isolierte Drill-ClickHouse (Beispiel)
docker run -d --name synqdrive-drill-ch \
  -p 59000:9000 -v /opt/synqdrive/drill/ch-backups:/backups \
  ... clickhouse/clickhouse-server:25.8

# 3. Konfiguration
cp backend/scripts/ops/restore-validation.env.example \
   /opt/synqdrive/shared/restore-validation.env
# RESTORE_VALIDATION_PG_PORT=55432, CH_PORT=59000, GPG passphrase

# 4. Manueller Lauf
set -a; source /opt/synqdrive/shared/restore-validation.env; set +a
bash backend/scripts/ops/vps-restore-validation.sh

# 5. Report prüfen
cat /opt/synqdrive/shared/backups/restore-validation/reports/latest-report.json

# 6. Quartals-Cron
bash backend/scripts/ops/vps-install-restore-validation-cron.sh
```

### Vollständiger E2E auf Docker-Host

```bash
bash backend/scripts/ops/restore-validation.local.sh
```

Erzeugt synthetische Backups für alle 6 Tiers und führt `vps-restore-validation.sh` aus.

---

## 7. Report-Format (JSON)

```json
{
  "run_id": "20260726T114905Z",
  "mode": "isolated",
  "host": "srv1374778.hstgr.cloud",
  "generated_at": "2026-07-26T11:49:06Z",
  "overall_success": false,
  "tiers": [
    {
      "tier": "postgresql",
      "success": true,
      "duration_ms": 8420,
      "integrity": "passed",
      "errors": null,
      "details": "organizations=12; prisma_migrations=187; isolated_db=synqdrive_restore_20260726T114905Z",
      "mode": "isolated",
      "timestamp": "2026-07-26T11:49:14Z"
    }
  ]
}
```

| Feld `integrity` | Bedeutung |
|------------------|-----------|
| `passed` | Restore/Verify erfolgreich |
| `failed` | Artifact korrupt oder Restore fehlgeschlagen |
| `blocked` | Kein Backup-Tier / keine Drill-Infrastruktur |

---

## 8. Tier-spezifische Integritätsprüfungen

### PostgreSQL
- `pg_restore --list` (Syntax)
- Restore in `synqdrive_restore_<run_id>`
- `SELECT COUNT(*) FROM organizations`
- `SELECT COUNT(*) FROM _prisma_migrations`
- `DROP DATABASE` nach Test (außer `--keep-db` für Dokumenten-Cross-Check)

### ClickHouse
- Decrypt `.zip.gpg` → Backup-Disk
- `RESTORE DATABASE synqdrive FROM Disk(...)` auf isolierter Instanz
- `SELECT count() FROM system.tables WHERE database = 'synqdrive'`
- `DROP DATABASE` im cleanup

### Redis
- SHA-256 Sidecar
- GPG decrypt → temp RDB
- `redis-check-rdb` (kein `redis-server` load)

### Konfiguration
- GPG decrypt → tar
- Enthält `backend.env` + `frontend.env`
- Required keys present (Werte werden **nicht** geloggt)

### Uploads / Dokumente
- GPG decrypt → tar extract nach Staging
- `file_count > 0`
- Sample SHA-256
- Dokumente: optional `Document.objectKey` aus PG-Drill vs. Archiv-Pfad

---

## 9. Bekannte Lücken

| Lücke | Auswirkung auf Validation | Nächster Schritt |
|-------|---------------------------|------------------|
| Uploads-Backup-Tier fehlt auf Prod | `uploads` → `blocked` | 2C.7 Uploads backup |
| Documents-Backup-Tier fehlt auf Prod | `documents` → `blocked` | 2C.7 Documents backup |
| PG daily backup (2C.2) evtl. noch nicht merged | `postgresql` → `blocked` | 2C.2 deployen |
| CH daily backup (2C.3) evtl. noch nicht merged | `clickhouse` → `blocked` | 2C.3 deployen |
| Kein dedizierter Drill-Host auf VPS | Manuelles Docker-Setup nötig | Drill-Container dokumentieren |

---

## 10. Abnahme-Checkliste

- [ ] `restore-validation.selftest.sh` grün in CI
- [ ] `restore-validation.local.sh` grün auf Docker-Host (alle 6 Tiers)
- [ ] VPS-Drill mit echten Offsite/Lokal-Artifacts (Quartal)
- [ ] `latest-report.json` archiviert
- [ ] Uploads/Documents nicht `blocked` (nach Backup-Tier)
- [ ] Keine Prod-DB/Redis/Env-Datei während Drill verändert (Audit-Log)

---

## 11. Verwandte Dokumentation

- `docs/remediation/offsite-backups.md`
- `docs/remediation/redis-backup.md`
- `docs/runbooks/document-intake-v2-deployment.md` §1 (manuelles PG-Restore-Muster)
- `architecture/MASTER_ADMIN_RESTORE_VALIDATION_2026-07-26.md`
