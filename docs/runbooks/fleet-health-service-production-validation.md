# Fleet Health Service — Production Validation Runbook (Read-Only)

| Feld | Wert |
|------|------|
| **Owner** | `fleet-health-service` (Platform + Rental Health + Service Center) |
| **Ziel** | Post-Deploy-Validierung des deployten Stands **ohne** Datenänderung |
| **Gültig ab** | Backend ≥ V4.9.734 (Fleet Health Service E2E + Observability P59–P63) |
| **Status** | **Dokumentation only** — dieses Runbook führt selbst keine produktiven Aktionen aus |
| **Incident-Runbook** | [`fleet-health-service-readiness.md`](./fleet-health-service-readiness.md) |
| **Metriken / SLOs** | [`../architecture/fleet-health-prometheus-metrics.md`](../architecture/fleet-health-prometheus-metrics.md), [`../architecture/fleet-health-service-readiness-alerts-slo.md`](../architecture/fleet-health-service-readiness-alerts-slo.md) |
| **Grafana** | UID `synqdrive-fleet-health-service` — [`../architecture/fleet-health-grafana-prometheus-ops.md`](../architecture/fleet-health-grafana-prometheus-ops.md) |
| **E2E (Staging / Mock)** | `frontend/e2e/fleet-health-service-flow.spec.ts` (isolierte Fixtures, **nicht** gegen Produktion) |

---

## 1. Strikte Regeln (verbindlich)

| Regel | Erlaubt | Verboten |
|-------|---------|----------|
| **Datenbank** | `SELECT`, `COUNT`, `pg_dump` nur wenn separat freigegeben | `INSERT` / `UPDATE` / `DELETE`, `prisma migrate`, Repair-Skripte mit `--apply` |
| **Queues** | `LLEN`, `LRANGE` (Stichprobe), Metrik-Counter lesen | `DEL`, Retry, Re-Queue, manuelles Job-Enqueue, Worker-Trigger |
| **Runtime** | `pm2 describe`, `pm2 list`, Log-Tail | `pm2 restart`, `pm2 reload`, Deploy, Env-Änderung |
| **API** | `GET`, `HEAD`, `OPTIONS` | `POST` / `PATCH` / `DELETE` (inkl. Task/Case/Observation-Mutationen) |
| **Bericht** | Anonymisierte Counts, Shares, Hashes, Status-Codes | Secrets, Tokens, Kennzeichen, Kundennamen, Org-Namen, Roh-UUIDs in Tickets |
| **UI** | Navigation, Lesen, Drawer öffnen/schließen | Aufgabe anlegen, Service Case erstellen, Refresh mit Schreibwirkung testen |

**Abbruch:** Sobald ein Schritt Schreibzugriff erfordert → stoppen, Incident-Runbook oder separaten Change-Request nutzen.

**Timing:** Innerhalb von **30–60 Minuten** nach abgeschlossenem Deploy (PM2 online, Health 200). Bei laufendem Incident zuerst Stabilität, dann Validierung.

---

## 2. Validierungsprotokoll (anonymisiert)

Kopiere diese Vorlage pro Deploy. Ersetze Platzhalter; **keine** PII.

```markdown
## Fleet Health Service — Production Validation

| Feld | Wert |
|------|------|
| Datum (UTC) | YYYY-MM-DD HH:MM |
| Operator | <Initialen / Ops-Alias> |
| Erwarteter Commit (Deploy-Ticket) | `<short-sha>` |
| Deployter Commit (VPS) | `<short-sha>` |
| Commit-Match | ja / nein |
| Gesamtergebnis | PASS / PASS mit Hinweisen / FAIL |

### Ergebnis-Matrix (nur Aggregates)

| Bereich | Status | Notiz (max. 1 Zeile, anonym) |
|---------|--------|------------------------------|
| API health | | |
| PM2 uptime/restarts | | |
| Battery-V2-Fehler | | |
| Queue-Zustände | | |
| Modul-Coverage | | |
| Health Availability | | |
| Vendor-Fehler | | |
| Task-/Case-Counts | | |
| Pagination | | |
| Permissions | | |
| Runtime Blocker | | |
| Metrics | | |
| Grafana | | |
| Logs | | |
| UI Smoke | | |

### Abweichungen
- (z. B. „vendor_api_errors +3/15m“, „PM2 restarts >50/24h“)

### Eskalation
- ja / nein → Ticket / Alert-Name
```

---

## 3. Vorbereitung

### 3.1 Zugänge (ohne Secrets im Ticket)

- SSH read-only auf VPS (Deploy-Pfad `/opt/synqdrive/current`)
- Grafana (SynqDrive Ops + Fleet Health Service Dashboard)
- Prometheus UI oder bestehender Scrape-Pfad (intern)
- SynqDrive-Testaccounts für **drei Rollen-Archetypen** (Credentials nur im Passwort-Manager):
  - **A — Org Admin:** `fleet.read` + `tasks.read` + `vendor-management.read`
  - **B — Fleet Read:** `fleet.read`, kein `tasks.write`
  - **C — No Fleet:** Mitglied ohne `fleet.read` (Negativtest)

Org für Stichproben: **eine** Pilot-Org mit bekannter Flottengröße-Bucket (S / M / L). Im Protokoll nur `org_bucket=S|M|L` notieren, nicht die Org-ID.

### 3.2 Erwarteter Release-Stand

Vor Validierung Deploy-Ticket lesen: Ziel-Commit, Migrations-Status, Grafana-Dashboard-Import (P60).

```bash
# Lokal / CI — erwarteter Stand
git rev-parse --short HEAD

# VPS — deployter Stand (read-only)
ssh <ops-host> 'git -C /opt/synqdrive/current rev-parse HEAD && readlink -f /opt/synqdrive/current'
```

**PASS:** Short-SHA des Deploy-Tickets = VPS-HEAD (oder dokumentierte Hotfix-Abweichung mit Ticket).

---

## 4. Prüfbereiche

### 4.1 Deployed Commit

| Check | Befehl / Quelle | PASS |
|-------|-----------------|------|
| Release-Symlink | `readlink -f /opt/synqdrive/current` | Zeigt auf `/opt/synqdrive/releases/<id>_v*` aus Deploy |
| Git HEAD | `git -C /opt/synqdrive/current rev-parse HEAD` | = erwarteter Commit |
| Frontend-Build | `test -f /opt/synqdrive/current/frontend/dist/index.html` | Datei vorhanden |
| Backend-Build | `test -f /opt/synqdrive/current/backend/dist/src/main.js` | Datei vorhanden |

**Notiz:** Nur Commit-Hash und Release-ID im Protokoll — keine Branch-Namen mit internen Ticket-IDs.

---

### 4.2 API Health

Öffentlich, ohne Auth:

```bash
curl -sS -o /tmp/fhs-health.json -w '%{http_code}' \
  https://app.synqdrive.eu/api/v1/health

curl -sS -o /tmp/fhs-readiness.json -w '%{http_code}' \
  https://app.synqdrive.eu/api/v1/health/readiness
```

| Check | PASS |
|-------|------|
| Liveness | HTTP **200**, Body `status: ok`, `uptime` > 0 |
| Readiness | HTTP **200**, Postgres + Redis Checks **nicht** `down` |
| Latenz | Antwort < 2s (manuell oder `time curl`) |

Im Protokoll: HTTP-Codes + readiness-Subsystem-Status (ok/degraded/down), keine Connection-Strings.

---

### 4.3 PM2 Uptime / Restarts

**Nur lesen:**

```bash
pm2 describe synqdrive | grep -E 'status|restarts|uptime|unstable'
pm2 list
```

| Check | PASS (Richtwert) | Hinweis |
|-------|------------------|---------|
| Status | `online` | |
| Uptime nach Deploy | ≥ 5 Min ohne erneuten Restart | Direkt nach Deploy kurz warten |
| Restarts (24h) | < 10 | > 50 → FAIL, Stabilitäts-Incident |
| `unstable restarts` | 0 | |

**VERBOTEN:** `pm2 restart`, `pm2 reload`, `pm2 delete`.

---

### 4.4 Battery-V2-Fehler

Fleet Health hängt an Battery-Publikationen für das Batterie-Modul. Read-only Log- und Metrik-Check:

```bash
# Fehlerzähler (letzte 200 Zeilen, nur Count notieren)
grep -c 'Battery V2 enqueue failed' ~/.pm2/logs/synqdrive-error.log 2>/dev/null || echo 0
grep -c 'Custom Id cannot contain' ~/.pm2/logs/synqdrive-error.log 2>/dev/null || echo 0
```

**Prometheus / Grafana (bevorzugt):**

- `synqdrive_fleet_health_battery_publication_coverage_ratio`
- `synqdrive_battery_publications_total` (Trend, nicht Einzel-Fahrzeug)
- Alert `FleetHealthBatteryPublicationCoverageLow` / `Absent` — **nicht firing**

| Check | PASS |
|-------|------|
| Log-Fehler | Kein **anhaltender** Anstieg seit Deploy (0 neue Fehler in 15m nach Deploy) |
| Coverage | ≥ 0.70 wenn `battery_applicable_rows ≥ 5`, sonst „n/a — small fleet“ |
| Battery-Queue failed | `battery.v2` failed count stabil (siehe §4.5) |

Bei FAIL: Battery-V2-Deployment-Runbook konsultieren — **keine** Queue-Retries in diesem Runbook.

---

### 4.5 Queue-Zustände

**Nur lesen** (Redis DB 0, BullMQ-Präfixe). Beispiel — Counts notieren, keine Job-Payloads:

```bash
# Beispiel: failed-Job-Zähler pro relevanter Queue (Anpassung an VPS-Redis-CLI)
redis-cli -n 0 KEYS 'bull:dimo.snapshot.poll:*:failed' | wc -l
redis-cli -n 0 KEYS 'bull:battery.v2:*:failed' | wc -l
redis-cli -n 0 KEYS 'bull:task.automation:*:failed' | wc -l
redis-cli -n 0 KEYS 'bull:dimo.tire.recalculation:*:failed' | wc -l
redis-cli -n 0 KEYS 'bull:dimo.brake.recalculation:*:failed' | wc -l
```

**Prometheus:**

- `synqdrive_queue_failed_jobs` by `queue`
- `synqdrive_queue_lag_seconds` p95
- `synqdrive_fleet_health_refresh_partial_failure_total`
- `synqdrive_task_automation_outbox_failed_total` / `_backlog`

| Queue | PASS (Richtwert) |
|-------|------------------|
| Health-relevante Queues | `failed` nicht sprunghaft gestiegen seit Deploy |
| `task.automation` | backlog < 10 |
| Gesamt | Kein Alert `FleetHealthQueueFailedJobsElevated` firing |

**VERBOTEN:** Jobs retryen, Queues leeren, Worker manuell starten.

---

### 4.6 Modul-Coverage

**API (Org Admin, GET only):**

```http
GET /api/v1/organizations/<ORG_ID>/rental-health/fleet?limit=25
Authorization: Bearer <SESSION_TOKEN>
```

Auswertung (aggregiert über erste Seite + `summary`):

- Anteil Zeilen mit `overall_state` in `good` / `warning` / `critical` / `unknown`
- Pro Modul: wie viele Zeilen haben `modules.<key>.state !== 'good'` (nur Counts)

**Prometheus:**

```promql
sum by (module, state) (synqdrive_fleet_health_module_status_total)
sum(synqdrive_fleet_health_stale_module_total)
```

| Check | PASS |
|-------|------|
| Module evaluieren | Mindestens 3 Module mit `state` ≠ leer auf Stichproben-Org |
| Unknown-Anteil | < 25% der Modul-Zellen wenn Flotte ≥ 10 Fahrzeuge |
| Stale | Kein anhaltender Anstieg `stale_module_total` seit Deploy |

---

### 4.7 Health Availability

**API:** Gleiche Fleet-Page — `summary.pageHealth` und `summary.availability`:

- `rentalBlocked` (Count)
- `byOverallState` Verteilung
- `totalSelected` vs. `data.length`

**Prometheus:**

```promql
sum by (level) (synqdrive_fleet_health_availability_total)
synqdrive:fleet_health:ready_share
synqdrive:fleet_health:unavailable_share
```

| Check | PASS |
|-------|------|
| Ready share | ≥ 80% wenn `fleet_row_total ≥ 10` |
| Unavailable share | < 20% wenn `fleet_row_total ≥ 10` |
| Alerts | `FleetHealthUnavailableShareHigh` **nicht** firing |

---

### 4.8 Vendor-Fehler

**API (Org Admin):**

```http
GET /api/v1/organizations/<ORG_ID>/vendors
GET /api/v1/organizations/<ORG_ID>/vendors/stats
```

| Check | PASS |
|-------|------|
| HTTP | Beide **200** |
| Body | Liste ist Array (auch wenn leer); stats liefert numerische Felder |
| Fehler-Counter | `increase(synqdrive_fleet_health_vendor_api_errors_total[15m])` < 3 |

**UI (read-only):** Fleet → Zustand & Service → Arbeiten → Partner — Liste lädt ohne Fehlerbanner.

Bei API-200 aber leerer KPI „Wartet Partner“ bei bekanntem Vendor-Backlog: als **Hinweis** dokumentieren (degraded read), nicht automatisch FAIL.

---

### 4.9 Task- / Case-Counts

**API (Org Admin, GET only):**

```http
GET /api/v1/organizations/<ORG_ID>/tasks/summary
GET /api/v1/organizations/<ORG_ID>/tasks?status=OPEN
GET /api/v1/organizations/<ORG_ID>/service-cases
GET /api/v1/organizations/<ORG_ID>/service-cases?status=OPEN
```

| Feld im Protokoll | Beispiel (anonym) |
|-------------------|-------------------|
| `tasks.open` | 12 |
| `tasks.overdue` | 2 |
| `tasks.waiting_vendor` | 1 |
| `service_cases.open` | 4 |
| `service_cases.blocking_rental` | 1 |

**Prometheus:**

- `synqdrive_fleet_health_service_case_total` by `status`
- `synqdrive_fleet_health_blocking_service_case_total`
- `increase(synqdrive_fleet_health_task_api_errors_total[15m])` < 3
- `increase(synqdrive_fleet_health_case_api_errors_total[15m])` < 3

| Check | PASS |
|-------|------|
| APIs | HTTP 200, JSON parsebar |
| UI-Konsistenz | KPI „Offene Aufgaben“ in Zustand & Service plausibel vs. `tasks/summary` (± Rundung) |
| Alerts | Task/Case API error alerts nicht firing |

---

### 4.10 Pagination

Fleet Rental Health paginiert über `rental-health/fleet`:

```http
GET .../rental-health/fleet?limit=25
GET .../rental-health/fleet?limit=25&cursor=<nextCursor aus Antwort 1>
```

| Check | PASS |
|-------|------|
| `meta.limit` | ≤ 50, default 25 |
| `meta.nextCursor` | Vorhanden wenn mehr Fahrzeuge als `limit` |
| Dedupe | Keine doppelte `vehicle_id` über aufeinanderfolgende Seiten |
| `summary.availability.totalSelected` | Stabil über Seiten (org-weit) |
| Latenz p95 | < 8s (`FleetHealthRentalRequestLatencyP99High` nicht firing) |

Optional: `search=` und `stationId=` nur lesen, wenn Pilot-Org Stationen hat.

---

### 4.11 Permissions mit Testrollen

Alle Requests **GET only**. Org B darf **nicht** Org A sehen.

| Archetyp | Endpoint | Erwartung |
|----------|----------|-----------|
| A — Org Admin | `GET .../rental-health/fleet` | **200** |
| A — Org Admin | `GET .../tasks/summary` | **200** |
| A — Org Admin | `GET .../service-cases` | **200** |
| A — Org Admin | `GET .../vendors/stats` | **200** (wenn `vendor-management.read`) |
| B — Fleet Read | `GET .../rental-health/fleet` | **200** |
| B — Fleet Read | `POST .../tasks` (Negativtest) | **403** — nur Status notieren, kein Body speichern |
| C — No Fleet | `GET .../rental-health/fleet` | **403** |
| Cross-tenant | A ruft fremde `<ORG_ID>` auf | **403** oder **404** |

Rental Health Routes nutzen `PermissionsGuard` + `@RequirePermission('fleet', 'read')` — Tasks/Service Cases nutzen `OrgScopingGuard` + `RolesGuard` (separat prüfen).

**PASS:** Matrix wie oben; keine Permission-Regression gegenüber letztem grünen Validation-Lauf.

---

### 4.12 Runtime Blocker

Unterscheide **Rental Health Blockade** (`rental_blocked`) von **operativem Fahrzeugstatus** (`Vehicle.status` / `operationalState`).

**API:**

```http
GET .../rental-health/fleet?limit=50
GET .../fleet-map
```

| Check | PASS |
|-------|------|
| `rental_blocked` | Count in Fleet-Health-`summary` = manuell gezählte Zeilen mit `rental_blocked: true` (Stichprobe) |
| `blocking_reasons` | Array vorhanden wenn `rental_blocked` (kein leerer Grund bei blockierten Zeilen) |
| Fleet-map | `operationalState` gesetzt; keine Massen-`UNKNOWN` nach Deploy |
| Blockierende Cases | `blocking_service_case_total` plausibel vs. UI-KPI „Technisch blockiert“ |

**VERBOTEN:** Buchung anlegen, Status PATCH, Handover, um Blockade zu „testen“.

---

### 4.13 Metrics

Metriken werden intern von Prometheus gescraped — **kein** Bearer-Token in Tickets.

| Check | Quelle | PASS |
|-------|--------|------|
| Scrape | `up{job="synqdrive-backend"}` == 1 | Target up |
| Fleet-Health-Serie | `synqdrive_fleet_health_*` vorhanden | Mindestens 5 distinct Metric-Namen |
| SLO-Recording | `synqdrive:fleet_health:ready_share` | Wert zwischen 0 und 1 |
| Latenz-Histogramme | `synqdrive_fleet_health_rental_health_request_duration_seconds` | `result=success` dominiert |

Direktzugriff (nur wenn Ops-Runbook Prometheus erlaubt):

```bash
# Auf VPS — nur wenn für Ops freigegeben; Credentials nicht loggen
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/v1/metrics
```

Erwartung: **401** ohne Auth ist akzeptabel, wenn Prometheus-Scrape intern funktioniert.

---

### 4.14 Grafana

Dashboard: **SynqDrive Fleet Health Service** (`synqdrive-fleet-health-service`).

| Panel (Auszug) | PASS |
|----------------|------|
| Health Availability | Kurve sichtbar, nicht durchgehend leer |
| Modul-Coverage | Balken/Lines für `module` × `state` |
| API-Fehler Task/Case/Vendor | Kein anhaltender Spike seit Deploy |
| Battery publication coverage | Gauge plausibel (oder „n/a“ bei kleiner Flotte) |
| Queues | Failed jobs Panel ohne Stufen-Sprung |

**Zeitfenster:** Last 1h + Last 24h vergleichen. Screenshot nur intern, keine Kennzeichen in Annotations.

---

### 4.15 Logs

Read-only Tail / Grep — **keine** Logzeilen mit PII in Tickets.

```bash
# Fehler-Rate (Counts)
grep -c 'fleet_health\|RentalHealth\|ServiceCasesService\|TasksService' ~/.pm2/logs/synqdrive-error.log | tail -1

# Battery (siehe §4.4)
grep -c 'Battery V2 enqueue failed' ~/.pm2/logs/synqdrive-error.log

# Vendor degrade
grep -c 'vendor.*fail\|VendorsService' ~/.pm2/logs/synqdrive-error.log
```

| Check | PASS |
|-------|------|
| Neue ERROR-Spikes | Kein neuer dominanter Stacktrace seit Deploy |
| Rental Health | Keine wiederholten `safe-fallback` / `_error` pro Minute |
| 5xx-Korrelation | Keine HTTP-500-Flut auf `/rental-health` in Access-Logs |

---

### 4.16 UI Smoke Tests (manuell, read-only)

**Produktion:** Nur Navigation und Lesen. **Keine** Schreib-Buttons klicken (Aufgabe erstellen, Service Case anlegen, Beobachtung speichern).

| # | Schritt | PASS |
|---|---------|------|
| 1 | Login als Archetyp A → Fleet → Tab **Zustand & Service** | Tab sichtbar, keine leere Fehlerfläche |
| 2 | Untertab **Übersicht** | KPI-Leiste + priorisierte Liste laden |
| 3 | KPI **Technisch prüfen** klicken | URL enthält `fhsVf=review`, Fahrzeugliste gefiltert |
| 4 | Untertab **Arbeiten** → Aufgaben / Fälligkeiten / Partner | Drei Panels wechselbar |
| 5 | Fahrzeugzeile expandieren | Findings / Cases / Tasks sichtbar oder leerer Zustand mit Copy |
| 6 | Servicefall-Drawer öffnen (falls Case vorhanden) | Drawer lädt, **Schließen** ohne Speichern |
| 7 | **Aktualisieren** (read-only Refetch) | Daten neu geladen, kein Dauer-Fehlerbanner |
| 8 | Deep-Link `?fhs=tasks` | Arbeiten → Aufgaben, kein Crash |
| 9 | Mobile Viewport (375px) | Drawer nutzbar, kein horizontales Overflow |
| 10 | Archetyp C | Fleet Health Tab nicht nutzbar oder 403 auf API |

**Staging / CI (empfohlen vor Prod-Sign-off):**

```bash
cd frontend && npx playwright test -c e2e/playwright.config.ts \
  fleet-health-service-flow.spec.ts \
  --project=desktop-1280 --project=mobile-375
```

Dieser Flow nutzt **isolierte Mocks** — ersetzt nicht die manuelle Prod-Smoke-Liste, ergänzt sie.

---

## 5. Gesamt-Gates (Go / No-Go)

| Gate | Kriterium |
|------|-----------|
| **G0 — Deploy** | Commit-Match + Health/Readiness 200 |
| **G1 — Stabilität** | PM2 online, Restarts im Rahmen, keine kritischen Alerts firing |
| **G2 — Datenpfad** | Rental-health fleet page 200, Availability/Module-Metriken plausibel |
| **G3 — Service Layer** | Tasks/Case/Vendor GET 200, API-Error-Counter ruhig |
| **G4 — UX** | UI Smoke §4.16 ohne Crash / Dauer-Fehler |
| **G5 — Observability** | Grafana Fleet-Health-Dashboard + Logs ohne neue ERROR-Dominanz |

**Go:** G0–G4 PASS; G5 PASS oder dokumentierte Hinweise mit Owner-Datum.  
**No-Go:** G0 oder G1 FAIL; anhaltende critical Alerts; Commit-Mismatch ohne Ticket.

Bei No-Go: Incident nach [`fleet-health-service-readiness.md`](./fleet-health-service-readiness.md) — **nicht** in diesem Runbook remedieren.

---

## 6. Verwandte Dokumente

| Dokument | Zweck |
|----------|-------|
| [`fleet-health-service-readiness.md`](./fleet-health-service-readiness.md) | Alert-Response (darf Mitigation inkl. Restart) |
| [`../audits/fleet-health-service-production-reality.md`](../audits/fleet-health-service-production-reality.md) | Historische Prod-Realität / Baseline |
| [`../testing/fleet-health-service-domain-integration.md`](../testing/fleet-health-service-domain-integration.md) | Integrations-Tests (Pre-Deploy) |
| [`../testing/fleet-health-service-scale-benchmarks.md`](../testing/fleet-health-service-scale-benchmarks.md) | Skalierung / Pagination-Benchmarks |
| [`../implementation/fleet-health-service-callsite-baseline.md`](../implementation/fleet-health-service-callsite-baseline.md) | Callsite-Inventur |

---

## 7. Changelog

| Version | Datum | Änderung |
|---------|-------|----------|
| 1.0 | 2026-07-21 | Initiales read-only Production-Validation-Runbook (Phase 9 P64) |
