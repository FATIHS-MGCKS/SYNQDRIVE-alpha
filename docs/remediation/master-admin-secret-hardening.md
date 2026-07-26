# Master-Admin Remediation — Phase 2A.1: Secret Management Hardening

| Feld | Wert |
|------|------|
| **Remediation ID** | `master-admin-secret-hardening` |
| **Phase** | **2A.1** — Berechtigungen und Secret-Speicher (keine Key-Rotation) |
| **Host** | `srv1374778.hstgr.cloud` (`app.synqdrive.eu`) |
| **Durchgeführt (UTC)** | `2026-07-26T10:27:28Z` |
| **Audit-Bezug** | MA-DEP-P2-001, MA-BKP-P2-001, MA-BKP-P2-006 |
| **Funktionale Änderung** | **Nein** — keine API-Keys rotiert, keine App-Logik geändert |

---

## 1. Ziel

Alle produktiven Secrets nach Best Practices **absichern**: Dateiberechtigungen, Owner/Group, keine world-readable Artefakte mit Credentials — **ohne** Keys auszutauschen und **ohne** funktionale Änderungen am SynqDrive-Verhalten.

---

## 2. Vorher / Nachher

### 2.1 Kern-Env-Dateien

| Datei | Vorher | Nachher | Risiko (vorher) |
|-------|--------|---------|-----------------|
| `/opt/synqdrive/shared/backend.env` | `644` root:root | **`600`** root:root | **Hoch** — jeder lokale Unix-User konnte 267 Env-Variablen inkl. Stripe/DIMO/JWT/DB lesen |
| `/opt/synqdrive/shared/frontend.env` | `600` root:root | **`600`** root:root | OK — Mapbox-Token bereits geschützt |

### 2.2 Backups mit Secrets / sensiblen Daten

| Bereich | Vorher | Nachher | Risiko (vorher) |
|---------|--------|---------|-----------------|
| `shared/backups/*.sql.gz` (45 Dateien) | `644` | **`600`** | **Hoch** — PG-Dumps weltlesbar (IAM, Billing, Tokens in DB) |
| `shared/backups/backend.env.pre-retention-*` | `644` | **`600`** | **Hoch** — Klartext-Env |
| `shared/backups/*.tgz` (Code/CH) | `644` | **`600`** | Mittel — potenziell Konfiguration/Metadaten |
| `shared/backend.env.bak-*` (19 Dateien) | `600` | **`600`** | OK — bereits korrekt |
| World-readable Backups gesamt | **46** | **0** | — |

### 2.3 Monitoring-Secrets

| Pfad | Vorher | Nachher | Anmerkung |
|------|--------|---------|-----------|
| `prometheus/secrets/` (Verzeichnis) | `755` / nach Fix `700` | **`750`** root:nogroup | Container-User `nobody` braucht Traverse |
| `prometheus/secrets/metrics_bearer_token` | `644` | **`640`** root:nogroup | Nicht world-readable; Prometheus-Scrape weiterhin möglich |

### 2.4 PM2 / Prozess-State

| Pfad | Vorher | Nachher |
|------|--------|---------|
| `/root/.pm2/dump.pm2` | `644` | **`600`** |
| `/root/.pm2/` | `755` | **`700`** |

PM2-Env für `synqdrive` enthält **keine** Secret-Werte im Dump (nur 2 nicht-sensitive Keys) — Härtung defense-in-depth.

### 2.5 Legacy / Staging-Artefakte

| Pfad | Vorher | Nachher |
|------|--------|---------|
| `public_backup_202606241346_dashboard_truth/` | `777` / Dateien `666` | **`750`** / Dateien **`640`** |
| `staging-verification/**` | Dateien `644` | **`640`**, Verzeichnisse **`750`** |

Keine Secrets in `env-keys.txt` (nur Key-Namen); `pm2.json` ohne Secret-Werte in Stichprobe.

### 2.6 Unverändert (bewusst / kein Permission-Fix ohne Funktionsänderung)

| Bereich | Status | Begründung |
|---------|--------|------------|
| **Redis** `requirepass` | leer | Passwort setzen = funktionale Änderung; Bind `127.0.0.1` aktiv |
| **PostgreSQL** | `listen` localhost only | Netzwerk-Isolation ausreichend für Phase 2A.1 |
| **Docker ClickHouse** `CLICKHOUSE_PASSWORD` | Container-Env | Standard-Compose-Pattern; kein Host-World-Read |
| **Docker Grafana** `GF_SECURITY_ADMIN_PASSWORD` | Container-Env | Gleiches Muster |
| **PM2 Runtime-Env** | via `backend.env` bei Start | Secrets nicht in `pm2_env` dupliziert |
| **Shell-History** | keine Dateien vorhanden | `/root/.bash_history` existiert nicht |
| **PM2-Logs** (10k tail) | 0 Secret-Pattern | Kein Eingriff nötig |
| **API-Key-Rotation** | — | Explizit ausgeschlossen |

---

## 3. Integrations-Check (Key-Präsenz — keine Werte)

Alle geprüften Integrationen haben konfigurierte Keys in `backend.env` / `frontend.env` (Namen only):

| Integration | Env-Keys (backend.env) | frontend.env |
|-------------|------------------------|--------------|
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, … | — |
| **DIMO** | `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY`, `DIMO_API_KEY`, `DIMO_WEBHOOK_SECRET`, … | — |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_*`, … | — |
| **ElevenLabs** | `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET` | — |
| **Resend** | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | — |
| **Mapbox** | — | `VITE_MAPBOX_ACCESS_TOKEN` |
| **JWT** | `JWT_SECRET`, `JWT_EXPIRES_IN` | — |
| **Clerk** | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | — |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (leer) | — |
| **PostgreSQL** | `DATABASE_URL` | — |

**Keine Keys rotiert oder geändert** — nur Dateizugriff eingeschränkt.

---

## 4. Durchgeführte Änderungen

### 4.1 Production VPS (live)

```bash
# Kern-Env
chmod 600 /opt/synqdrive/shared/backend.env /opt/synqdrive/shared/frontend.env
chown root:root /opt/synqdrive/shared/backend.env /opt/synqdrive/shared/frontend.env

# Env-Backups + PG-Dumps
find /opt/synqdrive/shared -maxdepth 2 -type f \( -name 'backend.env*' -o -name 'frontend.env*' \) ! -perm 600 -exec chmod 600 {} \;
find /opt/synqdrive/shared/backups -type f -perm -004 -exec chmod 600 {} \;

# Prometheus metrics bearer (group-readable für nobody-Container)
chown root:nogroup /opt/synqdrive/shared/prometheus/secrets
chmod 750 /opt/synqdrive/shared/prometheus/secrets
chown root:nogroup /opt/synqdrive/shared/prometheus/secrets/metrics_bearer_token
chmod 640 /opt/synqdrive/shared/prometheus/secrets/metrics_bearer_token

# PM2 state
chmod 700 /root/.pm2
chmod 600 /root/.pm2/dump.pm2

# Legacy public backup + staging verification artifacts
chmod 750 …/public_backup_202606241346_dashboard_truth
find …/staging-verification -type f -perm -004 -exec chmod 640 {} \;
```

**Log:** `/opt/synqdrive/shared/backups/secret-hardening-20260726T102728Z.log`

### 4.2 Repository (Persistenz — verhindert Regression)

| Datei | Änderung |
|-------|----------|
| `backend/scripts/ops/vps-deploy-release.sh` | `chmod 600` für `backend.env`/`frontend.env` nach Symlink; `chmod 600` für neues `db-pre-deploy-*.sql.gz` |
| `backend/scripts/ops/vps-setup-prometheus.sh` | Metrics-Token `640` root:nogroup; Secrets-Dir `750` |
| `backend/scripts/ops/vps-refresh-monitoring.sh` | wie oben |

---

## 5. Risiko-Bewertung

| Risiko | Vorher | Nachher |
|--------|--------|---------|
| Lokaler User liest `backend.env` | **Kritisch** (644) | **Mitigiert** (600 root-only) |
| Lokaler User liest PG-Dumps | **Hoch** (644) | **Mitigiert** (600) |
| Metrics-Bearer world-readable | **Mittel** (644) | **Mitigiert** (640, Gruppe nogroup) |
| Prometheus-Scrape bricht | — | **Getestet** — Container liest Token nach 750/640-Fix |
| App-Start nach Env-chmod | — | **OK** — PM2 läuft als root, Health 200 |
| Offsite/Verschlüsselung Backups | **Offen** | Unverändert — Phase 2A.2+ (kein Klartext-Offsite in diesem Schritt) |

---

## 6. Verifikation

| # | Prüfung | Ergebnis |
|---|---------|----------|
| 1 | `stat backend.env` → `600 root:root` | ✅ |
| 2 | World-readable Dateien in `shared/backups/` | ✅ **0** |
| 3 | `curl http://127.0.0.1:3001/api/v1/health` | ✅ `{"status":"ok"}` |
| 4 | `curl https://app.synqdrive.eu/api/v1/health` | ✅ (nach Härtung) |
| 5 | `pm2 list` → synqdrive online | ✅ |
| 6 | Prometheus `/-/healthy` | ✅ |
| 7 | Prometheus container liest metrics token | ✅ (`640` + dir `750`) |
| 8 | PM2 error/out log Secret-Pattern (tail 10k) | ✅ 0 Treffer |
| 9 | Shell-History mit Tokens | ✅ keine History-Datei |
| 10 | API-Keys unverändert (kein Rotation) | ✅ |

### Verifikationsbefehle (VPS)

```bash
stat -c '%a %U:%G' /opt/synqdrive/shared/backend.env
find /opt/synqdrive/shared/backups -type f -perm -004 | wc -l   # expect 0
curl -sf http://127.0.0.1:3001/api/v1/health
docker exec synqdrive-prometheus cat /etc/prometheus/secrets/metrics_bearer_token >/dev/null && echo OK
```

---

## 7. Offene Punkte (nicht Phase 2A.1)

| Item | Empfehlung | Phase |
|------|------------|-------|
| Redis `requirepass` | Passwort setzen + App-Env anpassen | 2A.2+ (funktional) |
| Env-Backups verschlüsseln (GPG/Vault) | Offsite-tauglich | DR-Phase |
| `umask` / Deploy-User non-root | Langfristig | Hardening-Roadmap |
| Grafana/CH Docker-Env Secrets | Secret-Files statt `-e` | Optional |

---

## 8. Status

| Item | Status |
|------|--------|
| VPS Berechtigungen korrigiert | ✅ |
| Deploy-Skripte angepasst (Regression-Schutz) | ✅ |
| Funktionale Änderung | ❌ (keine) |
| API-Key-Rotation | ❌ (bewusst ausgeschlossen) |
| Changes / Architektur | Ops-Dokumentation only |

**Phase 2A.1 Status:** ✅ **Abgeschlossen**
