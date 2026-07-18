# Stations V2 — Shadow Validation Runbook

Stand: 2026-07-18 (Prompt 75/78)  
Ziel: **Technische Shadow-Validierung** vor voller Aktivierung (Enforce, UI-Breite, Legacy-Abschaltung) — Vergleich Alt/Neu, Booking Rules ohne operative Blockwirkung, Geofence nur Shadow.

| Feld | Wert |
|------|------|
| **Deployment-Phasen** | [`stations-v2-deployment.md`](./stations-v2-deployment.md) |
| **Feature Flags** | [`stations-v2-rollout-flags.md`](../architecture/stations-v2-rollout-flags.md) |
| **Architekturvertrag** | [`stations-v2.md`](../architecture/stations-v2.md) |
| **Datenqualität** | [`stations-v2-data-remediation.md`](./stations-v2-data-remediation.md) (nach Merge Diagnose-CLI) |

---

## 1. Grundsätze

| Regel | Bedeutung |
|-------|-----------|
| **Shadow vor Enforce** | Booking Rules: `STATIONS_V2_BOOKING_RULES_ENFORCEMENT=shadow` oder `warning` — **keine** operative Blockwirkung auf Buchungen/Handover |
| **Geofence nur Shadow** | `STATIONS_V2_GEOFENCE_SHADOW_ENABLED=true` erlaubt **nur** Read-Model-Evidence (`HOME` / `AWAY` / `UNKNOWN`). **Kein** Auto-Write auf `currentStationId` (Invariante S3 / R9) |
| **Canary zuerst** | Validierung auf `STATIONS_V2_ORG_ALLOWLIST` — nie global ohne abgeschlossenes Gate-Review |
| **Manuelles Go/No-Go** | Metrik-Gates sind **Voraussetzung**, kein Auto-Trigger für `enforce` oder Schritt 10 im Deployment-Runbook |
| **Read-only Vergleich** | Alt/Neu-Vergleiche dürfen produktive Writes nicht auslösen; Diagnose-CLI nur mit `--dry-run` |

### 1.1 Empfohlene Flag-Kombination während Shadow

```bash
# Canary-Org(s)
STATIONS_V2_ORG_ALLOWLIST=<uuid-pilot-a>,<uuid-pilot-b>

# Read-Pfade + Scope (nach Deployment Schritt 2–4)
STATIONS_V2_SCHEMA_ENABLED=true
STATIONS_V2_SCOPE_ENABLED=true
STATIONS_V2_SUMMARY_READ_MODEL_ENABLED=true

# Booking Rules — Shadow (keine Blocks)
STATIONS_V2_BOOKING_RULES_ENABLED=true
STATIONS_V2_BOOKING_RULES_ENFORCEMENT=shadow

# Optional parallel beobachten (kein Current-Write)
STATIONS_V2_GEOFENCE_SHADOW_ENABLED=true
STATIONS_V2_CAPACITY_WARNINGS_ENABLED=true

# Explizit NICHT während Kern-Shadow (bis Gate grün):
# STATIONS_V2_BOOKING_RULES_ENFORCEMENT=enforce
# STATIONS_V2_UI_ENABLED=true (breite UI erst nach Gate)
# Automatische Geofence-Current-Writes — VERBOTEN
```

---

## 2. Messzeitraum und Mindeststichprobe

### 2.1 Beobachtungsfenster

| Phase | Dauer | Zweck |
|-------|-------|-------|
| **T0 — Baseline** | 1 Werktag | Alt/Neu-Snapshot bei identischen Flags; Scope-Matrix dokumentieren |
| **T1 — Kernfenster** | **14 Kalendertage** | KPI-/Listen-Drift, Booking-Rules-Shadow, API-Latenz |
| **T2 — Erweitert** | **+14 Tage** (gesamt 28) | Feiertage, Kapazitätsspitzen, Transfer-Vorschläge, manuelle Reviews |
| **Gate-Review** | Nach T1 (frühestens Tag 15) | Formales Go/No-Go; T2 verlängern bei Lücken |

**Verlängerungspflicht:** Wenn Mindeststichprobe (§2.2) nicht erreicht → Fenster verlängern, **kein** Enforce / kein Legacy-Kill-Switch.

### 2.2 Mindeststichprobe (Canary-Org gesamt)

| Domäne | Minimum | Bemerkung |
|--------|---------|-----------|
| **Stationen** | ≥ 3 ACTIVE (+ 1 ARCHIVED falls vorhanden) | Mind. 1 Primary, 1 mit `capacity` gesetzt |
| **Fahrzeuge** | ≥ 20 mit `homeStationId` | Mind. 5 mit `currentStationId` ≠ home |
| **Buchungen** | ≥ 30 create/update im Fenster | Mind. 5 One-Way, 5 mit abweichendem Pickup/Return |
| **Handover** | ≥ 10 mit `actualStationId` | Current-Position-Validierung |
| **Scoped User** | ≥ 2 Accounts | Mind. 1 `ASSIGNED_STATIONS`, 1 `ALL_STATIONS` |
| **Öffnungskalender** | ≥ 2 Stationen mit `openingHours` + `timezone` | Mind. 1 mit `holidayRules` |
| **Transfers** | ≥ 5 geplante/arrived (wenn Flag an) | Sonst dokumentiert „n/a — Flag aus“ |
| **API-Stichprobe** | ≥ 500 aggregierte Requests/Endpoint-Klasse | Aus Logs oder synthetischer Load-Test auf Staging |

### 2.3 Repräsentative Org-Profile (Pflicht-Checkliste)

Vor Gate-Review muss die Canary mindestens **eine** Org mit jedem Profil abdecken oder begründet ausnehmen:

| Profil | Kriterium |
|--------|-----------|
| **Klein** | ≤ 5 Stationen, ≤ 30 Fahrzeuge |
| **Mittel** | 6–20 Stationen oder scoped Operators |
| **Saison/Feiertag** | Mind. 1 Feiertag im Messzeitraum in `holidayRules` |
| **Kapazitätsgrenze** | Mind. 1 Station mit `capacityUsagePercent` > 70 % im Shadow |

---

## 3. Validierungsmatrix — Alt vs. Neu

Für jede Zeile: **Legacy-Endpoint/Response** (oder V1-Aggregation) gegen **V2 Read Model** vergleichen. Abweichungen in §4 einordnen.

### 3.1 Stations-KPIs (Alt vs. Neu)

| KPI / Metrik | Legacy-Quelle | V2-Quelle | Vergleichsmethode |
|--------------|---------------|-----------|-------------------|
| `vehicleCountHome` | `GET …/stats`, Listenfeld `vehicleCount` | `GET …/summaries` / `…/summary` | Pro `stationId` Diff |
| `vehicleCountPresent` | Fleet-Aggregation / `overview-stats` | V2 Summary Read Model | Pro Station |
| `totalVehiclesAtStation` | Legacy `totalVehicles` (falls vorhanden) | Explizite Union home ∪ current | Label + Zahl |
| `todayPickups` / `todayReturns` | `overview-stats` | V2 Summary in **`station.timezone`** | Kalendertag UTC vs. TZ prüfen |
| `capacityUsagePercent` | Manuell / Legacy | `vehicleCountHome / capacity` | ± Rundung |
| `bookedVehicles` | Status `RENTED` Zählung (Ist-Drift) | Aktive Buchungen mit Stationsbezug | **Manuelle Review** bei Drift |
| Org-Header-KPIs | `GET …/stats` | `StationsOrgStatsDto` scope-gefiltert | Scoped vs. Admin |

**Gate (KPI):** Siehe §4.1.

### 3.2 Stations-Listen (Alt vs. Neu)

| Liste | Legacy | V2 | Prüfpunkte |
|-------|--------|-----|------------|
| Stationsliste | `GET …/stations` | `GET …/stations` + optional `summaries` batch | Sortierung, Scope-Filter, ARCHIVED-Sichtbarkeit |
| Fleet pro Station | `GET …/:id/fleet` | V2 Fleet DTO mit home/current/expected | Kein stiller Feldausfall |
| Bookings pro Station | `GET …/:id/bookings` | Paginiert, gleiche `stationId`-Semantik | Pickup vs. Return Filter |
| Station-Picker (UI) | `selectableOnly` | + Rule-Evaluations (Shadow) | Keine fehlenden ACTIVE-Stationen für Admin |

**Gate (Listen):** Siehe §4.2.

### 3.3 Booking Rules — ohne operative Blockwirkung

Während `enforcement ∈ {shadow, warning}`:

| Prüfung | Erwartung |
|---------|-----------|
| `BookingsService.create/update` | **Erfolg** auch bei Outcome `BLOCKED` im Shadow-Log |
| `evaluate` / Preview-Endpoint | Liefert `ALLOWED` \| `WARNING` \| `MANUAL_CONFIRMATION_REQUIRED` \| `BLOCKED` |
| Persistenz | Shadow: **keine** Rule-Snapshots; Warning: Snapshots **ohne** HTTP 400 |
| UI | Warnungen sichtbar; Formular **nicht** hart gesperrt (bis `enforce`) |
| Audit | Optional `BOOKING_STATION_RULE_OVERRIDE` nur nach explizitem User-Confirm (Warning-Phase) |

**Verboten in Shadow:** `STATIONS_V2_BOOKING_RULES_ENFORCEMENT=enforce` vor abgeschlossenem Gate-Review (§9).

### 3.4 Opening Hours und Feiertage

| Prüfung | Methode |
|---------|---------|
| `isOpenAt(pickup, stationTz)` | Mind. 10 synthetische + 10 reale Buchungszeitpunkte |
| `HOLIDAY_CLOSED` | Buchung an dokumentiertem Feiertag → Outcome `WARNING` oder `BLOCKED` **nur im Log**, nicht operativ |
| `OUTSIDE_OPENING_HOURS` | Randfälle: 23:59, DST-Wechsel, `afterHoursReturnEnabled` |
| TZ | KPI „today“ und Rule-Eval nutzen **dieselbe** `station.timezone` |

**Manuelle Reviewfälle:** §8.1.

### 3.5 Capacity Projection

| Prüfung | Definition |
|---------|------------|
| `capacityUsagePercent` | `vehicleCountHome / configuredCapacity` (0 wenn capacity null) |
| Projektion | Geplante Buchungen + Home-Fleet vs. `capacity` (V2 Projection DTO) |
| Warning-Outcome | `CAPACITY_EXCEEDED` → `WARNING` / `MANUAL_CONFIRMATION_REQUIRED` in Shadow **ohne** Block |

**Gate:** Siehe §4.3.

### 3.6 Home Assignment Preview

| Prüfung | Erwartung |
|---------|-----------|
| Delta Preview API | `add` / `remove` / `move` ohne Commit |
| **Kein** SET-Detach | Preview listet explizit betroffene `vehicleId`s |
| Home vs. Current | Preview ändert **nur** `homeStationId` — nicht `currentStationId` |
| Kapazität | Preview zeigt post-commit `capacityUsagePercent` |

**Manuelle Reviewfälle:** §8.2.

### 3.7 Current- / Expected-Positionen

| Feld | Shadow-Validierung |
|------|-------------------|
| `currentStationId` | Nur via `ConfirmPhysicalPresence` / Handover — **nicht** via Geofence |
| `currentStationSource` + `confirmedAt` | Pflicht bei jedem Current-Write (R4) |
| `expectedStationId` | Set via Transfer/Booking; **nicht** gelöscht bei Home-Änderung (R5) |
| Drift Home≠Current | Explizit labeln; kein Auto-Sync |

**Geofence:** `GeofenceShadowDto` darf von DB-Current abweichen — **kein** Write.

### 3.8 Transfervorschläge

| Prüfung | Erwartung |
|---------|-----------|
| Suggest-Endpoint | Liefert ranked Vorschläge (Zielstation, Begründung) |
| Plan ohne Arrive | `expectedStationId` gesetzt; `currentStationId` unverändert |
| Arrive | `CompleteTransfer` → Current + Clear Expected |
| Cancel | Expected bereinigt; Audit-Eintrag |

Wenn `STATIONS_V2_TRANSFERS_ENABLED=false`: Zeile „n/a“ im Review-Protokoll.

### 3.9 Scope-Ergebnisse

| Rolle / Scope | List | Detail | KPI | Write |
|---------------|------|--------|-----|-------|
| `ALL_STATIONS` | Alle ACTIVE sichtbar | 200 | Org-KPIs voll | Erlaubt nach Permission |
| `ASSIGNED_STATIONS` | Nur `stationIds` | 404 cross-scope | KPIs nur zugewiesene | 403/404 fremd |
| Org-Admin ohne Scope | Wie ALL | Wie ALL | Wie ALL | Wie ALL |

**Gate:** 0 Fälle „Datenleck“ (fremde Station in List/KPI) — **P0** (§7).

### 3.10 Partial-Data-Rate

**Definition:** Anteil der Read-Responses, in denen mindestens ein KPI-/Summary-Feld `null` oder `partial: true` ist, weil ein Upstream-Modul fehlt (Health, Bookings, Telemetry).

| Quelle | Messung |
|--------|---------|
| V2 Summary API | Feld `dataQuality.partialFields[]` oder äquivalent |
| Diagnose-CLI | Check „partial read model“ (nach Merge) |
| Logs | Strukturiertes `stations_v2_partial_read_total` (falls instrumentiert) |

**Gate:** Siehe §4.4.

### 3.11 API-Latenz

| Endpoint-Klasse | p50 | p95 | p99 |
|-----------------|-----|-----|-----|
| `GET …/stations` (Liste) | ≤ 150 ms | ≤ 400 ms | ≤ 800 ms |
| `GET …/summaries` (batch) | ≤ 250 ms | ≤ 600 ms | ≤ 1200 ms |
| `GET …/:id/summary` | ≤ 120 ms | ≤ 350 ms | ≤ 700 ms |
| `POST …/booking-rules/evaluate` | ≤ 200 ms | ≤ 500 ms | ≤ 1000 ms |
| `POST …/home-fleet/preview` | ≤ 200 ms | ≤ 500 ms | ≤ 1000 ms |

Messung auf **Staging** mit Prod-ähnlichem Datenvolumen oder Canary mit ≥ 500 Requests/Fenster. Latenz-Spitzen ohne Error-Budget-Erschöpfung: max. 3 aufeinanderfolgende 5-Min-Fenster > p95.

---

## 4. Erlaubte Abweichungen

### 4.1 KPI-Abweichungen (Alt vs. Neu)

| Metrik | Erlaubte Abweichung | Nicht erlaubt |
|--------|---------------------|---------------|
| Zähler (`vehicleCount*`) | **0** — muss exakt übereinstimmen | Jede systematische ±1-Drift |
| `todayPickups/Returns` | 0 nach TZ-Normalisierung | Unterschiedliche TZ zwischen Alt/Neu |
| `bookedVehicles` | ≤ 2 % relativ **wenn** Legacy nur `RENTED` zählte — **dokumentieren** | > 5 % ohne RCA |
| `capacityUsagePercent` | ± 0,5 % Rundung | > 1 % bei gleicher capacity |
| Org-Header (scoped User) | Neu **≤** Alt (Scope korrekt) | Neu > Alt (Datenleck) |

### 4.2 Listen-Abweichungen

| Aspekt | Erlaubt |
|--------|---------|
| Zusätzliche V2-Felder | Ja (additiv) |
| Sortierung | Identisch (`status`, `name`) |
| Fehlende Station in Neu | **Nein** — jede Legacy-Zeile muss V2-Entsprechung haben |
| Zusätzliche ARCHIVED in Neu | Ja, wenn Legacy filterte |

### 4.3 Capacity / Booking Rules (Shadow)

| Aspekt | Erlaubt |
|--------|---------|
| Shadow-`BLOCKED` ohne HTTP-Fehler | Ja — erwartet |
| Abweichende Outcomes Alt (keine Rules) vs. Neu | Ja — in Review-Tabelle erfassen |
| False-positive `CAPACITY_EXCEEDED` | ≤ 10 % der Evaluations — sonst Kalibrierung |

### 4.4 Partial-Data-Rate

| Schwellwert | Bedeutung |
|-------------|-----------|
| ≤ 5 % Responses mit `partial` | **Grün** |
| 5–15 % | **Gelb** — Module dokumentieren, Gate verlängern |
| > 15 % | **Rot** — kein Enforce; Remediation |

Ausnahme: Wenn ein Modul org-weit deaktiviert (z. B. Health) und `partial` korrekt labelt → nicht als Fehler zählen.

---

## 5. Rollbackkriterien

Rollback gemäß [`stations-v2-deployment.md`](./stations-v2-deployment.md) §Rollback. Zusätzlich **Shadow-spezifisch**:

| Stufe | Auslöser | Maßnahme |
|-------|----------|----------|
| **SR1** | KPI-Drift > Gate (§4.1) an ≥ 2 Stationen | `STATIONS_V2_SUMMARY_READ_MODEL_ENABLED=false` |
| **SR2** | Scope-Datenleck (§3.9) | **Sofort** `STATIONS_V2_SCOPE_ENABLED=false` + Incident |
| **SR3** | Shadow-Enforce-Leak (HTTP 400 durch Rules trotz `shadow`) | `STATIONS_V2_BOOKING_RULES_ENFORCEMENT=off` |
| **SR4** | Geofence hat `currentStationId` geschrieben | **Sofort** `STATIONS_V2_GEOFENCE_SHADOW_ENABLED=false` + Incident (S3-Verstoß) |
| **SR5** | p95 Latenz > 2× Schwellwert über 1 h | Read-Flags zurück; Performance-RCA |
| **SR6** | Partial-Rate > 15 % ohne Erklärung | Summary-Flag aus bis Remediation |

**Keine** Datenmigration beim Rollback — nur Flag-Rücknahme + PM2-Restart im Wartungsfenster.

---

## 6. P0-Abbruchbedingungen

Sofortiger **Stopp** aller V2-Aktivierung (Flags auf Safe-Defaults, Incident-Ticket, kein weiteres Gate):

| ID | Bedingung |
|----|-----------|
| **P0-01** | Cross-tenant Daten in List/Detail/KPI (falsche `organizationId`) |
| **P0-02** | Scoped User sieht fremde Station oder KPI enthält ausgeblendete Stationen |
| **P0-03** | `currentStationId` durch Geofence/Telemetrie ohne User/Handover-Command geändert |
| **P0-04** | Booking Rules `enforce` wirkt trotz `shadow`/`warning` Konfiguration |
| **P0-05** | Delta/Home-Preview oder Assign committed **SET-Detach** nicht gelisteter Fahrzeuge (S2) |
| **P0-06** | `assignVehicle(home)` setzt still `currentStationId` (S1-Verstoß) |
| **P0-07** | Hard Delete `Station` über Tenant-API |
| **P0-08** | Systematische KPI-Falschzählung (> 5 % Fahrzeuge betroffen) ohne Workaround |

Bei P0: Canary-Org-Flags aus; **kein** globaler Rollout bis Root-Cause + Fix + erneutes Shadow-Fenster.

---

## 7. Manuelle Reviewfälle

Pflicht-Dokumentation im Gate-Review-Protokoll (Spreadsheet / Ticket).

### 7.1 Opening Hours / Feiertage

| # | Fall | Erwartetes Shadow-Outcome |
|---|------|---------------------------|
| OH-1 | Pickup 30 min vor Öffnung | `WARNING` oder `OUTSIDE_OPENING_HOURS` |
| OH-2 | Return an `holidayRules.closed` | `HOLIDAY_CLOSED` |
| OH-3 | One-Way Return an Station mit `returnEnabled=false` | `BLOCKED` im Log |
| OH-4 | `afterHoursReturnEnabled=true`, Return 22:00 | `ALLOWED` oder `WARNING` — dokumentieren |
| OH-5 | DST-Spring-Forward (fehlende Stunde) | Kein Crash; konsistente TZ |

### 7.2 Home Assignment / Delta

| # | Fall | Prüfung |
|---|------|---------|
| HA-1 | Move 1 Fahrzeug A → B | Nur `homeStationId` ändert sich |
| HA-2 | Remove aus Home-Station | `currentStationId` bleibt |
| HA-3 | Preview vs. Commit | Gleiche `vehicleId`-Menge |
| HA-4 | Station am `capacity` Limit | Preview zeigt Warning |

### 7.3 Current / Expected / Transfer

| # | Fall | Prüfung |
|---|------|---------|
| CE-1 | Handover mit `actualStationId` | Current + source + `confirmedAt` |
| CE-2 | Transfer Plan | Expected gesetzt, Current unverändert |
| CE-3 | Transfer Arrive | Expected cleared, Current = Ziel |
| CE-4 | Home-Änderung während offenem Expected | Expected **bleibt** (R5) |

### 7.4 Geofence Shadow

| # | Fall | Prüfung |
|---|------|---------|
| GF-1 | Fahrzeug physisch außerhalb Radius | Shadow `AWAY`, DB `currentStationId` unverändert |
| GF-2 | GPS fehlt | Shadow `UNKNOWN` |
| GF-3 | Shadow vs. Handover-Current | Abweichung erlaubt — **kein** Auto-Sync |

### 7.5 Scope / RBAC

| # | Fall | Prüfung |
|---|------|---------|
| SC-1 | User nur Station S1 | List enthält nicht S2 |
| SC-2 | Direct URL `…/stations/S2` | 404 |
| SC-3 | KPI-Header | Summe nur S1-Fahrzeuge |

---

## 8. Ausführung — Werkzeuge und Ablauf

### 8.1 Wöchentliche Checkliste (Canary)

1. [ ] Effektive Flags: `GET …/stations/feature-flags`
2. [ ] KPI-Diff Alt/Neu exportieren (pro Station)
3. [ ] Booking-Rules-Shadow-Log: Outcome-Verteilung
4. [ ] Scope-Matrix mit 2 Test-Usern
5. [ ] Partial-Data-Rate aus Summary-Responses
6. [ ] API-Latenz p95 aus Logs/Grafana
7. [ ] ≥ 2 manuelle Reviewfälle aus §7 dokumentieren
8. [ ] Diagnose read-only (nach CLI-Merge): `--dry-run --organization-id=…`

### 8.2 KPI-Vergleich (Beispiel)

```bash
# Legacy Stats
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/organizations/$ORG_ID/stations/stats" | jq . > /tmp/stats-legacy.json

# V2 Summaries (wenn Flag an)
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/v1/organizations/$ORG_ID/stations/summaries" | jq . > /tmp/summaries-v2.json

# Diff (manuell oder Script): vehicleCountHome, todayPickups pro stationId
```

### 8.3 Booking Rules Shadow-Log

Prüfen: strukturierte Logs / Snapshots mit `enforcementMode=shadow` und **kein** korrelierender HTTP 400 auf demselben `requestId`.

---

## 9. Gate-Review (nach Kernfenster)

### 9.1 Automatische / halbautomatische Gates

| Gate | Schwelle |
|------|----------|
| KPI-Zähler-Drift | 0 auf allen Canary-Stationen |
| Listen-Vollständigkeit | 100 % Legacy-Stationen in V2 |
| Scope-Datenleck | 0 |
| Partial-Data-Rate | ≤ 5 % (oder dokumentiert deaktivierte Module) |
| API p95 | ≤ Schwellwerte §3.11 |
| Geofence Current-Writes | 0 |
| Shadow-Block-Leak | 0 |

### 9.2 Manuelle Gates

| Gate | Schwelle |
|------|----------|
| Opening-Hours-Reviewfälle §7.1 | 5/5 plausibel |
| Home/Delta-Review §7.2 | 4/4 bestanden |
| Current/Expected §7.3 | 4/4 bestanden |
| Geofence §7.4 | 3/3 ohne Current-Write |
| Booking Rules False-positive | ≤ 10 % `BLOCKED` als falsch positiv |
| Transfer-Vorschläge (wenn aktiv) | Mind. 3 manuell geprüft, plausibel |

### 9.3 Entscheidung

| Ergebnis | Aktion |
|----------|--------|
| **Alle Gates grün** | Deployment Runbook: `warning` → später `enforce`; Schritt 8–9 freigeben |
| **Gelb** | Fenster T2 verlängern; keine Enforce |
| **Rot / P0** | SR-Stufen §5; Incident |

**Explizit verboten:** Shadow-Metriken grün → automatisch `enforce` + globaler Rollout ohne menschliches Gate-Review.

---

## 10. Troubleshooting

| Symptom | Prüfen |
|---------|--------|
| KPI-Drift nur `todayPickups` | `station.timezone` vs. Server-UTC |
| Liste kürzer in V2 | Scope-Flag, ARCHIVED-Filter |
| Viele `BLOCKED` in Shadow | Enforcement-Modus, Flag-Leak |
| Hohe Partial-Rate | Health/Bookings-Modul, null capacity |
| Latenz Summary hoch | N+1 Queries, fehlender Batch-Endpoint |
| Geofence ≠ Current | **Erwartet** in Shadow — kein Fix durch Auto-Sync |

---

## 11. Code- und Dokumentationsreferenzen

| Komponente | Pfad |
|------------|------|
| Feature Flags | `backend/src/shared/stations/stations-v2-feature-flags.*` |
| Booking Enforcement | `backend/src/shared/stations/stations-v2-booking-rules-enforcement.util.ts` |
| Scope Guard | `backend/src/shared/guards/station-scope.guard.ts` |
| Architektur KPIs | `docs/architecture/stations-v2.md` §13.4 |
| Geofence Shadow | `docs/architecture/stations-v2.md` §15 |
| Deployment | `docs/runbooks/stations-v2-deployment.md` |

---

## 12. Abgrenzung

| Tool | Zweck |
|------|-------|
| **Shadow Validation** (dieses Runbook) | Gates vor Enforce / breiter UI / Legacy-Abschaltung |
| **Deployment Runbook** | Flag-Phasen 1–10, Rollback |
| **Data Remediation** | Datenqualität, keine Rollout-Gates |
| **E2E / Unit Tests** | Verhalten, kein Prod-Shadow |

---

*Kein vollständiger Rollout ohne abgeschlossenes Shadow-Fenster, Mindeststichprobe und dokumentiertes Gate-Review. Geofence bleibt Shadow — Current Station wird nicht automatisch verändert.*
