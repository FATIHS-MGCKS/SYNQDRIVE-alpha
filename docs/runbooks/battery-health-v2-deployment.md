# Runbook: Battery Health V2 — schrittweises Deployment

**Verbindliches Betriebs-Runbook** für das kontrollierte, phasenweise Aktivieren von Battery Health V2 in Produktion.

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend ≥ V4.9.571 (Battery V2 Pipeline, Retention, Grafana Ops) |
| **Status** | **Dokumentation only** — keine produktive Aktion durch dieses Runbook selbst |
| **Normative Flag-Spezifikation** | [`docs/architecture/battery-health-v2-rollout-flags.md`](../architecture/battery-health-v2-rollout-flags.md) |
| **Monitoring** | [`docs/architecture/battery-v2-grafana-prometheus-ops.md`](../architecture/battery-v2-grafana-prometheus-ops.md) |
| **Retention** | [`docs/architecture/battery-v2-retention.md`](../architecture/battery-v2-retention.md) |
| **Deploy-Skript (VPS)** | [`backend/scripts/ops/vps-deploy-release.sh`](../../backend/scripts/ops/vps-deploy-release.sh) |
| **Env-Vorlage** | [`backend/.env.example`](../../backend/.env.example) |

> **Grundsatz:** Code zuerst deployen, **alle user-wirksamen Flags aus**. Jede Phase erfordert schriftliche Freigabe, Metrik-Gates und dokumentierten Rollback. Shadow/Diagnostic-Daten dürfen geschrieben werden; Publication, HV-SOH, Readiness und Legacy-Effekte bleiben bis zur expliziten Freigabe **aus**.

---

## Phasenübersicht

| Phase | Inhalt | Haupt-Env-Hebel |
|-------|--------|-----------------|
| **0** | Backup, Migration, Deploy (Flags aus) | Alle `BATTERY_V2_*` Feature-Flags `false` |
| **1** | Observation Dedup + Job-Pipeline | `WORKERS_ENABLED=true`, Reconciliation (Default `true`) |
| **2** | Capability Refresh | Reconciliation + `HV_CAPABILITY_REFRESH` Jobs |
| **3** | LV REST Shadow | `BATTERY_V2_REST_SHADOW_ENABLED=true` (Canary Org/Vehicle) |
| **4** | Start Proxy (diagnostisch) | `BATTERY_V2_START_PROXY_ENABLED=true` (ICE Canary) |
| **5** | HV Recharge Sessions | `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=true` (BEV Canary) |
| **6** | HV Capacity Shadow | `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED=true` |
| **7** | Monitoring-Baseline | Grafana/Prometheus (kein Feature-Flag) |
| **8** | API/UI (Shadow-Modus) | Canonical API + Frontend VMs (kein Publication-Label) |
| **9** | Publication (später) | `BATTERY_V2_PUBLICATION_ENABLED`, `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED` |
| **10** | Readiness (nach Freigabe) | `BATTERY_V2_READINESS_ENABLED=true` |
| **—** | Retention | **Nur** `BATTERY_V2_RETENTION_DRY_RUN=true` bis explizite Freigabe |

**Verboten ohne Incident:** `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED=true`, `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED=true`, Publication/Readiness vor abgeschlossener Shadow-Validierung.

---

## 1. Backup und Restore-Verifikation

### 1.1 Wann

- **Pflicht** vor jedem Produktions-Deploy mit Battery-V2-Prisma-Migrationen
- **Pflicht** vor Aktivierung jeder Phase ab Phase 3 (schreibende Shadow-Pipelines)
- **Empfohlen** vor erstem Retention-Dry-Run auf Staging mit Produktionskopie

### 1.2 Automatisches Pre-Deploy-Backup (VPS)

`vps-deploy-release.sh` erstellt vor jedem Release:

```bash
sudo -u postgres pg_dump synqdrive | gzip > /opt/synqdrive/shared/backups/db-pre-deploy-<TS>.sql.gz
```

Zusätzlich prüft das Skript:

- Root-Filesystem &lt; 90 % belegt (sonst **Abbruch**)
- Warnung ab 85 %

### 1.3 Manuelles Backup (Staging / zusätzliche Sicherheit)

```bash
# Custom format (empfohlen für pg_restore)
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/synqdrive-battery-v2-$(date -u +%Y%m%d%H%M%S)-pre.dump"

# Plain SQL (Alternativ)
pg_dump "$DATABASE_URL" | gzip > "/var/backups/synqdrive-battery-v2-$(date -u +%Y%m%d%H%M%S)-pre.sql.gz"
```

**Metadaten protokollieren:** Zeitstempel (UTC), Git-Commit (`main`), geplante Phase, Operator, Ticket-ID.

### 1.4 Restore-Verifikation (Pflicht vor Prod-Go-Live)

Restore **niemals** auf Produktion testen — nur auf isolierter Staging-/Restore-Instanz:

```bash
# 1) Leere Test-DB anlegen
createdb synqdrive_restore_test

# 2) Restore (custom format)
pg_restore -d synqdrive_restore_test /var/backups/synqdrive-battery-v2-<TS>-pre.dump

# 3) Stichproben — Battery-V2-Tabellen vorhanden und lesbar
psql synqdrive_restore_test -c "
  SELECT COUNT(*) FROM battery_measurements;
  SELECT COUNT(*) FROM battery_v2_job_dead_letters;
  SELECT COUNT(*) FROM vehicle_battery_capabilities;
  SELECT COUNT(*) FROM hv_charge_sessions;
"

# 4) Migration-Stand
cd backend && DATABASE_URL=postgresql://.../synqdrive_restore_test npx prisma migrate status
```

**Exit-Kriterium Backup:** Restore erfolgreich, kritische Battery-Tabellen lesbar, `_prisma_migrations` konsistent.

### 1.5 Point-in-Time-Recovery

Bei schwerwiegendem Datenfehler: Hostinger/Postgres-PITR gemäß VPS-Backup-Policy — **nach** Rücksprache mit DBA/Platform.

---

## 2. Prisma-Migration

### 2.1 Relevante Migrationen (Battery V2)

| Migration | Inhalt |
|-----------|--------|
| `20260716143000_battery_v2_enums` | Enums für Measurement/Session/Quality |
| `20260716150000_battery_v2_measurement_sessions` | `battery_measurement_sessions` |
| `20260716153000_battery_v2_measurements` | `battery_measurements` |
| `20260716160000_battery_v2_remaining_models` | Evidence, Assessments, HV-Modelle |
| `20260716163000_vls_hv_charge_limit` | VLS HV Charge-Limit |
| `20260716170000_hv_snapshot_observation_dedup` | HV-Snapshot-Dedup-Spalten |
| `20260716170000_battery_v2_job_dead_letters` | `battery_v2_job_dead_letters` |
| `20260716180000_battery_capability_lifecycle` | `vehicle_battery_capabilities` |
| `20260717120000_battery_v2_retention_aggregates` | `battery_retention_aggregates` |
| `20260717160000_vehicle_battery_reference_capacity_api` | Referenzkapazität API-Felder |

Weitere additive Migrationen auf `main` vor Deploy prüfen (`git log backend/prisma/migrations`).

### 2.2 Prüfung vor Deploy

```bash
cd backend
npx prisma migrate status
# Erwartung auf Ziel-DB: keine ausstehenden Migrationen nach Deploy
```

### 2.3 Deploy-Ablauf (VPS)

Im Release-Skript automatisch:

```bash
npm ci
npx prisma generate
npm run prisma:migrate:deploy
sudo -u postgres psql -d synqdrive -v ON_ERROR_STOP=1 \
  -f scripts/ops/pg-fix-app-table-ownership.sql
```

### 2.4 Rollback Migration

Prisma-Migrationen sind **nicht** automatisch rückrollbar. Rollback = **Feature-Flags aus** + ggf. Code-Revert (siehe §15). **Kein** `migrate reset` auf Produktion.

---

## 3. Deployment mit allen neuen Flags deaktiviert

### 3.1 Ziel Phase 0

- Neuer Code und Schema auf Produktion
- **Keine** user-wirksamen Battery-V2-Effekte
- Observation-Classify-Jobs können enqueued werden (Snapshot-Hook), aber Shadow/Publication/Readiness-Pfade bleiben no-op

### 3.2 Pflicht-`backend.env`-Block (Phase 0)

```bash
# ── Battery Health V2 — Phase 0 (alle Feature-Flags AUS) ──
BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED=false
BATTERY_V2_START_PROXY_ENABLED=false
BATTERY_V2_REST_SHADOW_ENABLED=false
BATTERY_V2_PUBLICATION_ENABLED=false
BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED=false
BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=false
BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED=false
BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED=false
BATTERY_V2_HV_SOH_PUBLICATION_ENABLED=false
BATTERY_V2_READINESS_ENABLED=false

# Reconciliation: Default true — für reine Code-Only-Phase optional false setzen
# BATTERY_V2_RECONCILIATION_ENABLED=false

# Retention: immer aus + dry-run bis explizite Freigabe (§17)
BATTERY_V2_RETENTION_ENABLED=false
BATTERY_V2_RETENTION_DRY_RUN=true

# Worker/Queue (bereits produktiv für DIMO — muss true sein für Battery-Jobs)
WORKERS_ENABLED=true
```

> **Hinweis:** Mehrere HV-/Readiness-Flags fehlen noch in `backend/.env.example` — im Runbook und in `/opt/synqdrive/shared/backend.env` vollständig pflegen.

### 3.3 Deploy-Prozedur

```bash
# Lokal: main pushen
git push origin main

# Cloud Agent / Ops (kein Tailscale-Pfad A):
bash .cursor/scripts/cloud-agent-deploy.sh
```

Nach Deploy:

```bash
curl -sf https://app.synqdrive.eu/api/v1/health
pm2 list   # synqdrive online
```

### 3.4 Phase-0-Exit-Kriterien

| Check | Erwartung |
|-------|-----------|
| Health-Endpoint | HTTP 200 |
| `prisma migrate status` | Keine pending migrations |
| Rental Health / SOH UI | Unverändertes Legacy-Verhalten |
| `BATTERY_V2_PUBLICATION_ENABLED` | `false` |
| `BATTERY_V2_READINESS_ENABLED` | `false` |

**Wartezeit nach Deploy:** mindestens 30 Minuten stabiler Health + normale DIMO-Snapshot-Polls.

---

## 4. Observation Dedup aktivieren

### 4.1 Was aktiviert wird

Observation Dedup ist **kein separates Env-Flag** — es lebt im DIMO-Snapshot-Pfad:

1. `DimoSnapshotProcessor` ruft `BatteryV2SnapshotObservationProducer.classifyAndEnqueue()` nach jedem erfolgreichen Snapshot auf
2. Policies `evaluateHvSnapshotObservation` / `evaluateBatteryProviderObservation` entscheiden NEW vs DUPLICATE vs STALE
3. Nur bei `shouldPersist` wird `BATTERY_OBSERVATION_CLASSIFY` in Queue `battery.v2` enqueued
4. Handler persistiert Provider-Snapshots mit Idempotency-Keys (Migration `hv_snapshot_observation_dedup`)

### 4.2 Voraussetzungen

- Phase 0 abgeschlossen
- `WORKERS_ENABLED=true`, Redis erreichbar
- `BATTERY_V2_RECONCILIATION_ENABLED=true` (Default) — stale Observations nachziehen

### 4.3 Aktivierungsschritte

1. **Freigabe** Platform Owner + Vehicle Intelligence Lead (Ticket)
2. Sicherstellen, dass `battery.v2`-Processor registriert ist (`BatteryV2Processor`, Concurrency 2)
3. **Kein** zusätzliches Flag setzen — Pipeline ist mit Deploy aktiv
4. 24 h beobachten (Grafana Panel „Polls vs new provider observations“, „Duplicate rate“)

### 4.4 Metrik-Gates (24 h)

| Metrik | Schwelle |
|--------|----------|
| `synqdrive_battery_provider_observation_total{outcome="NEW_OBSERVATION"}` | > 0 bei aktiven DIMO-Fahrzeugen |
| Duplicate-Rate `DUPLICATE_OBSERVATION` / (NEW+DUPLICATE) | > 50 % bei stabilen Fahrzeugen (erwartet) |
| Alert `BatteryProviderDuplicatePersistenceHigh` | **Nicht** dauerhaft firing (&gt; 50 % **und** Persistenz-Anomalie) |
| `synqdrive_dimo_snapshot_poll_total` success | Weiterhin &gt; 90 % |

### 4.5 Rollback

Siehe §15 Phase 1 — Reconciliation aus oder Code-Revert; **keine** Daten löschen.

---

## 5. Battery Jobs aktivieren

### 5.1 Queue-Architektur

| Queue | Worker | Zweck |
|-------|--------|-------|
| `dimo.snapshot` | `DimoSnapshotProcessor` | Snapshot + Observation-Enqueue |
| `battery.v2` | `BatteryV2Processor` | Alle Battery-V2-Job-Typen |

**Job-Typen** (`battery-v2-job.types.ts`):

- `BATTERY_OBSERVATION_CLASSIFY`
- `BATTERY_REST_TARGET_EVALUATE`
- `BATTERY_START_PROXY_EXTRACT`
- `BATTERY_ASSESSMENT_RECOMPUTE`
- `BATTERY_PUBLICATION_UPDATE`
- `HV_CAPABILITY_REFRESH`
- `HV_RECHARGE_SESSION_RECONCILE`
- `HV_CAPACITY_SHADOW_RECOMPUTE`

### 5.2 Aktivierung

1. `WORKERS_ENABLED=true` (Bootstrap — `RuntimeStatusRegistry`)
2. Redis/BullMQ healthy (`synqdrive_queue_failed_jobs` niedrig)
3. `canEnqueueQueue()` darf nicht dauerhaft skippen (Log: `workers/redis disabled at bootstrap`)

```bash
# VPS: Worker-Status
pm2 describe synqdrive | grep -i env
redis-cli ping   # PONG
curl -s https://app.synqdrive.eu/api/v1/metrics | grep synqdrive_battery_jobs_total | head
```

### 5.3 Reconciliation-Scheduler

`BatteryV2ReconciliationScheduler` — Intervall Default 5 min (`BATTERY_V2_RECONCILIATION_INTERVAL_MS`):

- Stale Observations → erneutes Classify
- Fehlende REST/Start/HV-Follow-ups (abhängig von Flags)
- Dead-Letter-Backlog-Gauge aktualisieren

**Phase 1–2:** Reconciliation **an** lassen (`BATTERY_V2_RECONCILIATION_ENABLED=true`).

### 5.4 Exit-Kriterien

| Check | Erwartung |
|-------|-----------|
| `synqdrive_battery_jobs_total{result="completed"}` | Steigend |
| `synqdrive_battery_jobs_total{result="failed"}` | &lt; 0,1 % der completed (24 h) |
| `synqdrive_battery_v2_dead_letter_backlog` | 0 |
| Alert `BatteryJobsFailingDespiteSnapshotSuccess` | Nicht firing |

---

## 6. Capability Refresh

### 6.1 Zweck

`HV_CAPABILITY_REFRESH` aktualisiert `vehicle_battery_capabilities` (Signal-Verfügbarkeit, DEGRADED/UNAVAILABLE-Lifecycle) — Voraussetzung für HV-Recharge- und Capacity-Shadow-Pfade.

### 6.2 Konfiguration

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `BATTERY_CAPABILITY_REFRESH_INTERVAL_MS` | 6 h | Periodischer Refresh-Bucket |
| `BATTERY_CAPABILITY_SIGNAL_LOSS_RECHECK_MS` | 2 h | Re-Check bei Signalverlust |
| `BATTERY_CAPABILITY_LOSS_THRESHOLD` | 3 | Verluste bis UNAVAILABLE |
| `BATTERY_CAPABILITY_DEGRADED_GRACE_MS` | 24 h | Grace DEGRADED |

Trigger: `BatteryCapabilityRefreshService` via Reconciliation, Post-Capability-Events, DIMO-Fahrzeug-Hook.

### 6.3 Aktivierungsschritte

1. Phase 1–2 stabil (Jobs laufen, keine DLQ-Akkumulation)
2. **Canary:** 1 Org mit BEV + ICE, je 2 Fahrzeuge
3. 48 h Metriken: `synqdrive_battery_capability_signals_total` by `signal`/`status`
4. Grafana Panel „Capability availability“ prüfen

### 6.4 Exit-Kriterien

- Capability-Rows für Canary-Fahrzeuge vorhanden (`vehicle_battery_capabilities`)
- Kein anhaltender `UNAVAILABLE`-Anteil &gt; 50 % ohne dokumentierten Provider-Grund
- `HV_CAPABILITY_REFRESH` completed rate &gt; 95 %

### 6.5 Rollback

Reconciliation pausieren (`BATTERY_V2_RECONCILIATION_ENABLED=false`) stoppt neue Refresh-Enqueues; bestehende Capability-Rows bleiben.

---

## 7. LV REST Shadow

### 7.1 Flag

```bash
BATTERY_V2_REST_SHADOW_ENABLED=true
```

**Scope:** Zuerst **eine Organisation** (Org-Override wenn implementiert), sonst global nur mit Canary-Fahrzeugliste.

### 7.2 Verhalten bei ON

- `LvRestWindowService` eröffnet REST_60M / REST_6H-Fenster
- `BATTERY_REST_TARGET_EVALUATE` Jobs nach Verzögerung (`BATTERY_REST_60M_MS`, `BATTERY_REST_6H_MS`)
- Measurements/Evidence mit `quality=SHADOW` — **keine** Publication, **keine** Readiness

### 7.3 Aktivierungsschritte

1. Freigabe Domain Owner (LV/12V)
2. Flag auf Canary-Scope setzen → `pm2 restart synqdrive --update-env`
3. 7–14 d beobachten: REST capture, MISSED, `CONTAMINATED_BY_WAKE`

### 7.4 Metrik-Gates

| Metrik / Alert | Schwelle |
|----------------|----------|
| `synqdrive_battery_rest_measurements_total` | > 0 für ruhende ICE-Fahrzeuge |
| Alert `BatteryRestWakeContaminationHigh` | Nicht dauerhaft (&gt; 35 % CONTAMINATED) |
| Alert `BatteryRestCaptureMissingDespiteWindows` | Nicht firing |
| Rental blocked (battery) | **Keine** neuen Blocker aus Shadow |

### 7.5 Rollback

`BATTERY_V2_REST_SHADOW_ENABLED=false` → Restart. Shadow-Daten **behalten**.

---

## 8. Start Proxy

### 8.1 Flag

```bash
BATTERY_V2_START_PROXY_ENABLED=true
```

Optional: `BATTERY_V2_START_PROXY_DELAY_MS=90000` (Default 90 s nach Trip-Start)

### 8.2 Verhalten bei ON

- **Immer diagnostisch** — `START_DIP_PROXY` Measurements, max. 10 % Assessment-Gewicht wenn Assessment später aktiv
- **Nie** CRANK_MIN / Legacy-Crank-Score (`BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED` bleibt `false`)
- BEV ohne LV-Profil: Pfad wird per Capability/Profil übersprungen

Jobs: `BATTERY_START_PROXY_EXTRACT` nach Trip-Bestätigung.

### 8.3 Aktivierungsschritte

1. Nur **ICE/PHEV**-Canary (kein BEV-only ohne LV)
2. Flag Canary-scope → Restart
3. Metriken: `synqdrive_battery_start_proxy_*`, Coverage-Ratio im Dashboard

### 8.4 Exit-Kriterien

- Start-Proxy-Coverage &gt; 0 für Canary-Trips mit gültigem LV-Signal
- `INSUFFICIENT_COVERAGE` dokumentiert, nicht massenhaft
- Keine Alerts/Readiness aus Start-Proxy

### 8.5 Rollback

`BATTERY_V2_START_PROXY_ENABLED=false` → Restart.

---

## 9. HV Recharge Sessions

### 9.1 Flags

```bash
BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=true
# Optional nur wenn Segments fehlen:
BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED=false   # Default OFF — erst nach Segment-Validierung erwägen
```

### 9.2 Verhalten bei ON

- `HV_RECHARGE_SESSION_RECONCILE` — DIMO `segments(mechanism: recharge)` rolling 31d
- Sessions in `hv_charge_sessions` — SoT für M2-Capacity
- Nach Capability-Refresh: `enqueueAfterCapabilityRefresh`

### 9.3 Aktivierungsschritte

1. BEV-Canary mit gültigem `dimoTokenId`
2. Phase 6 (Capability) stabil
3. Flag Canary → Restart
4. 31 d Fenster: ≥ 3 Sessions/Fahrzeug erwartet (bei regulärem Laden)

### 9.4 Metrik-Gates

| Metrik / Alert | Schwelle |
|----------------|----------|
| `synqdrive_battery_hv_recharge_sessions_total` | Steigend |
| Alert `BatteryHvRechargeReconciliationFailing` | Nicht firing |
| Reconcile errors vs success | Error rate &lt; 5 % |

### 9.5 Rollback

`BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=false` → Restart. Bestehende Sessions read-only behalten.

---

## 10. HV Capacity Shadow

### 10.1 Flag

```bash
BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED=true
```

**Abhängigkeit:** `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=true` (oder ausreichende Live Energy+SOC — Sessions bevorzugt).

### 10.2 Verhalten bei ON

- `HV_CAPACITY_SHADOW_RECOMPUTE` — M2 Energy/SOC-Methode
- Interne Schätzung `estimatedCapacityKwh` — **quality=SHADOW**, **kein** user-facing SOH
- Metriken: `synqdrive_hv_capacity_m2_session_cv`, `synqdrive_hv_capacity_method_conflict_total`

### 10.3 Aktivierungsschritte

1. Mindestens 14 d Recharge-Sessions auf Canary
2. Verifizierte Referenzkapazität (`vehicle_battery_reference_capacity`) wo erforderlich
3. Flag Canary → Restart
4. M2 Session CV &lt; 2 % über ≥ 3 Sessions prüfen

### 10.4 Exit-Kriterien

| Check | Schwelle |
|-------|----------|
| M2 Session CV (p95) | &lt; 2 % |
| M2/M3 method conflict rate | &lt; 25 % (Alert `BatteryHvMethodDeviationUnusual`) |
| `publishedSohPct` / HV SOH UI | **Unverändert** (SOH-Publication aus) |

### 10.5 Rollback

`BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED=false` → Restart.

---

## 11. Monitoring

### 11.1 Dashboard & Alerts deployen

Nach Merge auf `main` (einmalig bzw. nach Monitoring-Änderungen):

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-grafana.sh
# Prometheus rules: vps-setup-prometheus.sh (Standard-VPS-Setup)
```

- **Grafana UID:** `synqdrive-battery-v2` (11 Panels)
- **Alert-Gruppe:** `synqdrive_battery_v2` (7 Regeln in `backend/monitoring/prometheus/alerts.yml`)

### 11.2 Pflicht-Panels pro Phase

| Phase | Panels |
|-------|--------|
| 1–2 | Polls vs Observations, Duplicate rate, Queue success/fail/DLQ |
| 3 | + REST capture / MISSED / contamination |
| 4 | + Start proxy coverage |
| 5–6 | + Capability, Recharge segments/sessions, M2 CV, M2/M3 agreement |
| 8+ | + Assessment maturity, DB growth |

### 11.3 Metriken-Endpunkt

```bash
curl -s https://app.synqdrive.eu/api/v1/metrics | grep -E '^synqdrive_battery_|^synqdrive_hv_capacity_'
```

### 11.4 On-Call

Alert `BatteryV2DeadLetterJobsPresent` → sofort §16 DLQ-Prozedur.  
Alert `BatteryJobsFailingDespiteSnapshotSuccess` → Queue/Handler-Logs, **kein** blindes Flag-ON.

---

## 12. API/UI

### 12.1 API (bestehende Endpoints)

Battery V2 nutzt **keine** separaten Deploy-Flags für API-Exposure — Canonical-Pfade:

- `GET .../battery-health-summary`
- `GET .../battery-health-detail`
- `GET .../rental-health` (Readiness nur wenn `BATTERY_V2_READINESS_ENABLED`)

Frontend: `battery-health-query` (Polling/Invalidierung), View-Models `battery-lv-view-model` / `battery-hv-view-model`.

### 12.2 UI-Verhalten nach Phase

| Phase | UI-Erwartung |
|-------|----------------|
| 0–6 | Legacy-Darstellung + optionale Shadow-Badges/Diagnostik — **kein** publizierter LV/HV-SOH-% aus V2 |
| 7–8 | Detail-Tab zeigt Freshness, Shadow-Qualität, technische Collapsibles |
| 9+ | Publication-Felder sichtbar **nur** wenn Backend `publicationEnabled` / HV SOH Gate freigegeben |

### 12.3 Validierung

- Canary-Fahrzeug im Health-Tab: Hard-Refresh, Network-Tab — API-Responses prüfen
- `sohStatus=UNAVAILABLE` solange `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED=false`
- Kein LV-SOH-Label (Architektur V4.9.563)

---

## 13. Spätere Publication

### 13.1 LV Publication

```bash
BATTERY_V2_PUBLICATION_ENABLED=true
```

**Nur nach:**

- 6 VALID REST-Messungen / 14 d auf Canary-ICE
- `batteryV2AssessmentEnabled`-Pfad intern validiert (Assessment-Jobs stabil)
- Schriftliche Produktfreigabe + Runbook-Ticket

**Effekt:** `publishedEstimatedHealth`, Maturity FSM — **org-scope** empfohlen.

### 13.2 HV SOH Publication

```bash
BATTERY_V2_HV_SOH_PUBLICATION_ENABLED=true
```

**Nur nach:**

- Belastbare Quelle: Provider SOH fresh **oder** Capacity+verifizierte Referenz
- `hvCapacityShadow` 14 d stabil
- **Nicht** für Tesla o.ä. ohne belastbare Quelle auto-aktivieren

### 13.3 Verboten

- `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED=true` (Legacy-Pairwise — nur Incident)
- Publication vor abgeschlossener Shadow-Phase
- Gleichzeitig Legacy- und V2-Publication-Effekte ohne Review

### 13.4 Nach Publication

- `BATTERY_PUBLICATION_UPDATE` Jobs überwachen
- Panel „Assessment maturity“ — `STABLE` nur mit VALID Evidence
- Stichprobe Workshop/Kunde: keine regressiven SOH-Sprünge

---

## 14. Readiness erst nach Freigabe

### 14.1 Flag

```bash
BATTERY_V2_READINESS_ENABLED=true
```

**Default:** `false` — **niemals** mit Deploy automatisch aktivieren.

### 14.2 Abhängigkeiten

- Mind. ein publizierbarer Pfad: `BATTERY_V2_PUBLICATION_ENABLED` **oder** `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED`
- Empfohlen: `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED=false` (bleibt)
- Evidence-Strength-Policy + Readiness-Policy (V4.9.565) — Shadow/Proxy blockiert **nie**

### 14.3 Freigabe-Checkliste

| # | Kriterium |
|---|-----------|
| 1 | Publication min. 14 d stabil auf Canary |
| 2 | Keine ungeklärten `HARD_BLOCK`-Fehlärmungen |
| 3 | Rental-Health-Stichprobe: erwartete `blocking_reasons` |
| 4 | Product + Ops + Domain Owner Sign-off |
| 5 | Rollback §15 Phase 10 dokumentiert |

### 14.4 Aktivierung

Org-scope Canary → Restart → 48 h `rental-health` Stichproben.

---

## 15. Rollback je Phase

| Phase | Rollback (R1 Soft) | Daten |
|-------|-------------------|-------|
| **0 Deploy** | Vorheriges Release (`/opt/synqdrive/releases/`) + `pm2 restart` | DB unverändert |
| **1 Observation** | `BATTERY_V2_RECONCILIATION_ENABLED=false` | Snapshots behalten |
| **2 Jobs** | `WORKERS_ENABLED=false` **nur Incident** (stoppt alle Queues!) | Jobs in Redis TTL |
| **3 REST Shadow** | `BATTERY_V2_REST_SHADOW_ENABLED=false` | Shadow Evidence behalten |
| **4 Start Proxy** | `BATTERY_V2_START_PROXY_ENABLED=false` | Diagnostic Measurements behalten |
| **5 HV Sessions** | `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED=false` | Sessions behalten |
| **6 HV Cap Shadow** | `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED=false` | Shadow behalten |
| **9 Publication** | `BATTERY_V2_PUBLICATION_ENABLED=false`, `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED=false` | Published frozen, `stale` Banner |
| **10 Readiness** | `BATTERY_V2_READINESS_ENABLED=false` | Keine DB-Writes |
| **R4 Legacy** | `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED=true` **nur Incident-Ticket** | Read-Pfade |
| **R5 Hard** | Git-Revert + Deploy | **Kein** DB-Löschen |

**Immer:** `pm2 restart synqdrive --update-env` nach Env-Änderung.

**Verboten:** Massenlöschung `battery_evidence` / `battery_measurements` ohne Backup.

---

## 16. Queue- und Dead-Letter-Behandlung

### 16.1 Queues

| Queue | Monitoring |
|-------|------------|
| `battery.v2` | `synqdrive_battery_jobs_total`, `synqdrive_queue_failed_jobs{queue="battery.v2"}` |
| `dimo.snapshot` | Snapshot success vs Battery job failures |

### 16.2 Dead-Letter-Modell

- Tabelle: `battery_v2_job_dead_letters` (unique `jobType` + `idempotencyKey`)
- Nach erschöpften Retries: `BatteryV2JobDeadLetterService.recordDeadLetter`
- Weitere Enqueues mit gleichem Key werden **skipped**
- Metriken: `synqdrive_battery_jobs_dead_letter_total`, `synqdrive_battery_v2_dead_letter_backlog`

### 16.3 Operator-Prozedur bei DLQ &gt; 0

1. Alert `BatteryV2DeadLetterJobsPresent` quittieren
2. Backlog prüfen:
   ```sql
   SELECT job_type, error_code, COUNT(*), MAX(failed_at)
   FROM battery_v2_job_dead_letters
   GROUP BY 1, 2 ORDER BY 4 DESC;
   ```
3. **Ursache klassifizieren:** `PROVIDER_TIMEOUT`, Validation, DIMO auth, Schema drift
4. **Fix** deployen oder Provider/Incident beheben
5. Reconciliation erneut laufen lassen — **oder** nach Review einzelne DLQ-Rows löschen (nur mit Ticket):
   ```sql
   -- NUR nach Root-Cause-Fix und expliziter Freigabe
   DELETE FROM battery_v2_job_dead_letters WHERE id = '<uuid>';
   ```
6. Re-Enqueue via Reconciliation oder manueller Producer (Engineering)

### 16.4 BullMQ Failed Jobs

`synqdrive_queue_failed_jobs > 10` — generischer Queue-Alert. BullMQ Dashboard / `redis-cli` — failed jobs inspizieren, **nicht** blind `obliterate`.

### 16.5 Retention von DLQ-Rows

`RETENTION_BATTERY_V2_DEAD_LETTERS_DAYS=90` — erst relevant wenn Retention **freigegeben** (§17).

---

## 17. Retention ausschließlich Dry Run vor Freigabe

### 17.1 Sichere Defaults (Pflicht)

```bash
BATTERY_V2_RETENTION_ENABLED=false
BATTERY_V2_RETENTION_DRY_RUN=true
```

**Bis zur expliziten Produktfreigabe:** `BATTERY_V2_RETENTION_DRY_RUN` **niemals** `false` in Produktion.

### 17.2 Scheduler

- `BatteryV2RetentionScheduler` — Cron `0 4 * * *` UTC
- Läuft **nicht** beim Deployment
- Bei `ENABLED=false`: sofortiger Return

### 17.3 Manueller Dry-Run (Staging)

```bash
cd /opt/synqdrive/current/backend
BATTERY_V2_RETENTION_ENABLED=true \
BATTERY_V2_RETENTION_DRY_RUN=true \
  npx ts-node -r tsconfig-paths/register -e "
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./src/app.module');
    (async () => {
      const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error','warn'] });
      const svc = app.get(require('./src/modules/vehicle-intelligence/battery-health/retention/battery-v2-retention.service').BatteryV2RetentionService);
      console.log(JSON.stringify(await svc.runRetentionCycle(), null, 2));
      await app.close();
    })();
  "
```

Erwartung: `dryRun: true`, `rowsDeleted: 0`, `rowsAggregated` ≥ 0 nur wenn Aggregate-Phase läuft.

### 17.4 Freigabe für echtes Prune

Erfordert **separates** Ticket nach ≥ 2 erfolgreichen Dry-Runs auf Staging:

1. `BATTERY_V2_RETENTION_ENABLED=true`
2. `BATTERY_V2_RETENTION_DRY_RUN=false` — **nur** nach DBA + Domain Owner Sign-off
3. Metriken `synqdrive_battery_retention_rows_deleted_total` überwachen

**Niemals** `RETENTION_BATTERY_PUBLICATIONS_DAYS` / `RETENTION_BATTERY_QUALIFIED_EVIDENCE_DAYS` ohne Review ändern (Default `0` = disabled).

---

## 18. Smoke Tests

### 18.1 Automatisiert (CI / Pre-Deploy)

```bash
cd backend
npm run test:battery:v2:verify
# oder granular:
npm test -- battery-v2
npm test -- battery-data-diagnostic
npm test -- battery-data-repair
npm test -- battery-v2-retention
npm test -- battery-v2-prometheus
# Optional mit DB:
BATTERY_V2_RETENTION_INTEGRATION=1 npm test -- battery-v2-retention.integration
```

Siehe auch: `docs/testing/battery-health-v2-backend-coverage.md`

### 18.1b Battery-Daten-Repair (nur nach Diagnostic + Freigabe)

```bash
cd backend
# 1) Diagnostic
npx ts-node -r tsconfig-paths/register scripts/ops/audit-battery-data.ts \
  --organization-id=<canary-org> --include-findings --format=console

# 2) Dry-run Repair
npx ts-node -r tsconfig-paths/register scripts/ops/repair-battery-data.ts \
  --organization-id=<canary-org> --output=./tmp/battery-repair-dry.json

# 3) Apply (nur nach Ticket-Freigabe)
npx ts-node -r tsconfig-paths/register scripts/ops/repair-battery-data.ts \
  --organization-id=<canary-org> --apply --batch-size=20
```

### 18.1c Option B — Historical Snapshot REST Backfill (60d)

Kontrollierter Backfill: `battery_health_snapshots.restingVoltage` → `battery_measurements` (`REST_60M`) mit Wake-/Kontaminations-Gates, anschließend Assessment-Replay und optional Publication-Replay **nur im Script-Prozess**.

```bash
cd backend
# 1) Dry-run
npx ts-node -r tsconfig-paths/register scripts/ops/backfill-battery-snapshot-rest-measurements.ts \
  --organization-id=<canary-org> --days=60 --output=./tmp/battery-snapshot-rest-backfill-dry.json

# 2) Apply + Assessment replay
BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_REMOTE=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/backfill-battery-snapshot-rest-measurements.ts \
  --organization-id=<canary-org> --days=60 --apply \
  --operator=ops@example --reason=option-b-backfill

# 3) Publication replay (scoped — setzt BATTERY_V2_PUBLICATION_ENABLED nur im Prozess)
BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_REMOTE=1 \
BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/backfill-battery-snapshot-rest-measurements.ts \
  --organization-id=<canary-org> --vehicle-id=<canary-vehicle> --days=60 --apply \
  --enable-publication-replay --operator=ops@example --reason=option-b-publication-replay
```

**Guards:** `BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_REMOTE=1`, für Produktion zusätzlich `BATTERY_SNAPSHOT_REST_BACKFILL_ALLOW_PROD=1`. Globale PM2-Flags (`BATTERY_V2_PUBLICATION_ENABLED`) **nicht** dauerhaft aktivieren.

### 18.2 Produktions-Smoke nach jeder Phase

| # | Test | Erwartung |
|---|------|-----------|
| S0 | Battery data diagnostic (pre/post) | `npx ts-node -r tsconfig-paths/register scripts/ops/audit-battery-data.ts --organization-id=<canary> --format=console` — Baseline dokumentieren |
| S1 | `GET /api/v1/health` | 200 |
| S2 | DIMO-Snapshot für Canary-Fahrzeug | `vehicle_latest_states` aktualisiert |
| S3 | Metrics: `synqdrive_battery_provider_observation_total` | NEW oder DUPLICATE Events |
| S4 | `battery.v2` completed jobs | > 0 innerhalb 1 h (Phase ≥ 1) |
| S5 | Canary Health-Tab laden | Kein 5xx, keine leeren Critical-Fehler |
| S6 | `rental-health` Canary | Kein unerwarteter `battery`-Blocker (Phase &lt; 10) |
| S7 | Publication API | `publicationEnabled: false` in Phase &lt; 9 |
| S8 | Grafana Battery V2 Dashboard | Panels grün / no data nur bei inaktiver Phase |

### 18.3 Manuelle Fahrzeug-Smoke (Domain)

Referenz: [`docs/audits/battery-runtime-topology.md`](../audits/battery-runtime-topology.md) §12 — Fall B/C/D:

- **REST:** Fahrzeug 60 min+ ruhend → REST-Fenster / Measurement (Phase 3)
- **Start:** ICE-Trip → Start-Proxy-Job (Phase 4)
- **HV:** BEV-Ladesession → Recharge Session Row (Phase 5)

Dokumentieren: `vehicleId`, Zeitfenster, erwartetes Artefakt, Ist-Ergebnis.

---

## 19. Abbruchkriterien

**Sofortiger Stopp** der aktuellen Phase (keine weiteren Flags ON) bei:

| ID | Kriterium | Aktion |
|----|-----------|--------|
| A1 | `synqdrive_battery_v2_dead_letter_backlog` &gt; 10 oder stündlich steigend | §16 DLQ, Phase einfrieren |
| A2 | Battery job failure rate &gt; 1 % über 4 h | Logs, ggf. Rollback Phase |
| A3 | Alert `BatteryJobsFailingDespiteSnapshotSuccess` &gt; 30 min firing | Queue/Incident |
| A4 | Unerwartete `rental_blocked` durch Battery auf Flotte (Phase &lt; 10) | Readiness/Publication sofort aus |
| A5 | Kunden-sichtbarer SOH-/Kapazitätssprung &gt; 10 % ohne Erklärung | Publication + UI Rollback (§15) |
| A6 | Migration fehlgeschlagen / Prisma drift | Deploy abort, Restore evaluieren |
| A7 | Root filesystem &gt; 90 % | Kein Deploy bis Speicher frei |
| A8 | Retention löscht Rows bei `DRY_RUN=true` | **P0** — Retention disable, Incident |
| A9 | `WORKERS_ENABLED` accidentally false | Restore worker, Reconciliation catch-up |

**Wiederaufnahme:** erst nach Root-Cause, Rollback oder Fix, neuem Smoke (§18) und dokumentierter Freigabe.

---

## 20. Verantwortlichkeiten und Ergebnisbericht

### 20.1 RACI

| Rolle | Verantwortung |
|-------|---------------|
| **Platform / Ops** | Backup, Deploy, Env, PM2, Grafana/Prometheus, Queue/DLQ |
| **DBA** | Backup/Restore-Verifikation, Migration-Review, Retention-Freigabe |
| **Vehicle Intelligence Lead** | Phasen-Freigabe, Metrik-Gates, Canary-Auswahl |
| **Engineering** | Code/Hotfix, DLQ-Analyse, Smoke-Automatisierung |
| **Product** | Publication/Readiness-Freigabe, Kundenkommunikation |
| **Support** | Canary-Fahrzeug-Stichproben, Incident-Eskalation |

### 20.2 Freigabe-Workflow

1. Ticket mit Phase, Env-Änderungen, Canary-Scope, Rollback-Plan
2. Ops führt Deploy/Env aus (nicht Cloud Agent ohne expliziten Auftrag)
3. 24–48 h Beobachtungsfenster
4. Ergebnisbericht (Template unten) an Stakeholder

### 20.3 Ergebnisbericht (Template)

```markdown
## Battery V2 Deployment — Phasenbericht

- **Datum / UTC:**
- **Phase:**
- **Git-Commit (main):**
- **Operator:**
- **Ticket:**

### Durchgeführt
- [ ] Backup erstellt (Pfad: ...)
- [ ] Restore-Test (Staging) — Datum: ...
- [ ] Migration status: OK / FAIL
- [ ] Env-Flags: (liste)
- [ ] pm2 restart

### Metriken (24h)
- Snapshot success rate:
- Battery jobs completed / failed:
- DLQ backlog:
- Duplicate observation rate:
- (phasenspezifisch)

### Smoke Tests
- S1–S8: PASS / FAIL
- Manuelle Fahrzeug-Smoke: ...

### Incidents / Abbruchkriterien
- Keine / (Beschreibung)

### Entscheidung
- [ ] Nächste Phase freigegeben
- [ ] Rollback durchgeführt (Stufe: R1–R5)
- [ ] Weiter beobachten bis: ...

### Unterschriften
- Ops:
- Vehicle Intelligence:
- Product (ab Phase 9):
```

### 20.4 Aufbewahrung

Berichte im Ticket-System + Verweis in Platform-Changelog (Synqdrive Code → Changes).

---

## Referenzen

| Dokument | Inhalt |
|----------|--------|
| [`battery-health-v2-rollout-flags.md`](../architecture/battery-health-v2-rollout-flags.md) | Flag-Katalog, Abhängigkeiten, R1–R5 |
| [`battery-v2-grafana-prometheus-ops.md`](../architecture/battery-v2-grafana-prometheus-ops.md) | Dashboards & Alerts |
| [`battery-v2-retention.md`](../architecture/battery-v2-retention.md) | Retention-Phasen & Dry-Run |
| [`battery-health-v2.md`](../architecture/battery-health-v2.md) | Architekturvertrag |
| [`task-data-repair.md`](./task-data-repair.md) | Runbook-Stil-Referenz |

---

*Dieses Runbook autorisiert keine automatische Ausführung. Jede produktive Aktion erfordert menschliche Freigabe und Ticket.*
