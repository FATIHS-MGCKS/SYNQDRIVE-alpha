# Stations V2 — Production Readiness (Prompt 78/78)

| Feld | Wert |
|------|------|
| **Verifikationsdatum (UTC)** | 2026-07-18 |
| **Modus** | Read-only Verifikation + CI/Build-Ausführung (keine Prod-Mutation, kein Deploy) |
| **Branch / Commit** | `cursor/station-v2-final-fixes-c2c2` @ `a7f737eb` |
| **Basis** | [`stations-v2-execution-contract.md`](../architecture/stations-v2-execution-contract.md), [`stations-v2-final-audit.md`](./stations-v2-final-audit.md), [`stations-v2-final-fixes.md`](./stations-v2-final-fixes.md) |
| **Runbooks** | [`stations-v2-deployment.md`](../runbooks/stations-v2-deployment.md), [`stations-v2-shadow-validation.md`](../runbooks/stations-v2-shadow-validation.md) |

---

## 1. Executive Summary

Nach Prompt 77 (P0/P1-Remediation) ist Stations V2 **technisch vorbereitet für einen kontrollierten Shadow-/Canary-Rollout**, aber **nicht für die vollständige Produktions-Aktivierung** (Schritte 7–10 im Deployment-Runbook mit `enforce`, breiter UI und Legacy-SET-Abschaltung).

| Gesamturteil | Empfehlung |
|--------------|------------|
| **CONDITIONALLY_READY** | Shadow-Pilot: 1–2 Orgs auf `STATIONS_V2_ORG_ALLOWLIST`, `ORG_ADMIN`/stations-berechtigte Rollen, Booking Rules `shadow`/`warning`, Geofence **nur** Shadow-Read |
| **NOT_READY** | Globaler Rollout, `enforce` ohne 14–28d Shadow-Gate, scoped Worker/Driver-Flotten >100 ohne manuelle Scope-Matrix-Prüfung, Legacy-SET-Abschaltung ohne Delta-Migration |

**Keine Produktionsmutation und kein Deployment** während dieser Verifikation.

---

## 2. Verifikations-Checkliste (19 Punkte)

| # | Prüfpunkt | Ergebnis | Evidenz / Anmerkung |
|---|-----------|----------|---------------------|
| 1 | **Prisma format + validate** | **PASS** | `npx prisma format` + `validate` (mit `DATABASE_URL` Dummy); Schema gültig. Warnung: `onDelete: SetNull` auf required FK (bestehend, nicht Stations-spezifisch). |
| 2 | **Migration SQL destruktiv?** | **PASS** | `20260718120000_stations_v2_final_fixes`: nur `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, Indizes, Partial-Unique. **Kein** `DROP`/`TRUNCATE`/irreversibles `ALTER`. |
| 3 | **Backend-Testpaket** | **PASS** | `npm run test:stations:v2` → **8 Suites, 24/24 Tests grün** (2026-07-18). |
| 4 | **Backend-Typecheck + Build** | **FAIL (repo-weit)** | `nest build` scheitert an fehlendem `twilio`-Modul (8 TS-Fehler, Voice/Twilio). **Stations-Module:** `tsc` ohne stations-bezogene Fehler. |
| 5 | **Frontend-Testpaket** | **PARTIAL** | `stations-v2-feature-flags.test.ts` **1/1 grün**. Gesamt-`npm test`: 277/296 Files grün; 4 Failures in `notificationEngine.*` (unrelated). |
| 6 | **Frontend-Typecheck + Build** | **FAIL (repo-weit)** | `tsc -b` scheitert an fehlenden Typen in `api.ts` (`VehicleDataQualityState`, `VehicleOperationalState`, `VehicleBookingContext`) — nicht Stations-spezifisch. |
| 7 | **E2E** | **NOT COVERED** | Kein dediziertes Playwright-Spec für Stations V2 UI/Flags. Stations nur als Mock-Fixtures in anderen E2E (Battery, Fleet, Tasks). |
| 8 | **Authz-/Scope-Matrix** | **CODE PASS / E2E MISSING** | `PermissionsGuard` + `@RequirePermission('stations', read\|write\|manage)` auf Controller; `StationScopeGuard` + `StationAccessService` (Membership `stationIds`). Unit: `station-access.service.spec.ts`. Kein Integrationstest Controller×Role. |
| 9 | **Primary-Concurrency** | **PARTIAL** | App-Tx `updateMany` bei `setPrimary`; DB Partial-Unique `stations_one_primary_per_org_idx`. **Kein** Race-/Parallel-Integrationstest. |
| 10 | **600-Fahrzeuge / 500-UI** | **CODE PASS** | `StationAssignVehicleModal`: Pagination `limit:100` bis `meta.total` erschöpft. `setStationVehicles`: `STATION_PARTIAL_SET_REJECTED` wenn `requested.length < orgVehicleCount` (Spec: 150 Org / 1 requested). |
| 11 | **Home/Current/Expected** | **MOSTLY PASS** | `changeHomeStation` nur `homeStationId`; `assignVehicle(target:'home')` nur Home; Handover/Transfer schreiben Current mit Provenance. **Ausnahme:** `registerFromDimo` koppelt noch home+current (`vehicles.service.ts` ~2078). |
| 12 | **Archive/Restore** | **PASS** | `delete()` → `archive()`; Snapshot `archivedCapabilitiesSnapshot`; Restore aus Snapshot; UI Restore-Button in `StationDetailView`. |
| 13 | **Booking Rules + Overrides** | **PARTIAL** | Vier-Outcome-Engine + Enforcement `off\|shadow\|warning\|enforce`; `MANUAL_CONFIRMATION_REQUIRED` wirft in `enforce`. **Kein** dedizierter Override-API/UI-Pfad für manuelle Bestätigung. |
| 14 | **Zeitzonen/DST** | **PARTIAL** | `station-opening-calendar.util.ts` nutzt `Intl` + `station.timezone`; KPI `todayPickups/Returns` über `stationDayBounds`. **Keine** DST-Regressionstests. |
| 15 | **Summary-/KPI-Konsistenz** | **PARTIAL** | Einheitliches `StationReadModelService`; Batch `GET …/summaries`. `vehiclesWithHealthWarnings` weiterhin `null` + `partialFields` — bewusste Degradation. |
| 16 | **Reconciliation Dry Run** | **BLOCKED** | `stations-v2-diagnose` CLI **nicht im Repo** (Runbook referenziert `scripts/ops/stations-v2-diagnose.ts`). Kein DB-gebundener Dry-Run ausführbar. |
| 17 | **Monitoring-Konfiguration** | **PARTIAL** | Metriken definiert: `synqdrive_stations_v2_feature_disabled_total`, `_partial_read_total`, `_summary_latency_seconds`; Import in Guard + Read Model. **Keine** verifizierte Prometheus-Scrape-/Alert-Rule-Konfiguration in diesem Lauf. |
| 18 | **Geofence ohne operative Wirkung** | **PASS** | Kein Worker/Webhook schreibt `currentStationId` aus GPS. `evaluateGeofenceShadow` nur read-only in Fleet-Response (flag-gated). Client `HomeAwayBadge` unverändert read-only. |
| 19 | **Keine Prod-Mutation / kein Deploy** | **PASS** | Nur Read-only-Audit, lokale Tests/Builds; keine VPS/PM2/DB-Writes. |

### Backend-Gesamtsuite (Referenz)

`npm test` (vollständig): **850 passed / 37 failed** Suites — Failures überwiegend Twilio-Modul (`Cannot find module 'twilio'`). Stations-V2-Paket isoliert grün.

---

## 3. Readiness-Bewertung (getrennt)

Legende: **READY** = produktionsfähig mit Flag-Canary; **CONDITIONALLY_READY** = Code vorhanden, Gate/Tests/Ops fehlen; **NOT_READY** = Blocker oder nicht verifiziert.

| Dimension | Status | Begründung |
|-----------|--------|------------|
| **MASTER_DATA_READY** | **CONDITIONALLY_READY** | Additive Migration bereit; Partial-Unique Primary. Diagnose-/Reconciliation-CLI fehlt; Prod-Migration noch nicht angewendet (bewusst). |
| **RBAC_READY** | **CONDITIONALLY_READY** | `PermissionsGuard` verdrahtet; Driver-Rolle ohne `stations`-Permission wird geblockt. Kein E2E/Integrationstest pro Rolle. |
| **STATION_SCOPE_READY** | **CONDITIONALLY_READY** | Scope aus DB-Membership (nicht JWT). List/KPI/Summaries scope-gefiltert. Kein Live-Test mit echten scoped Users. |
| **LIFECYCLE_READY** | **READY** | Archive/Restore/Set-Primary; PATCH-Bypass für status/isPrimary blockiert; kein Hard Delete. |
| **PRIMARY_READY** | **CONDITIONALLY_READY** | DB-Constraint + App-Tx; kein Parallel-Race-Test. |
| **HOME_FLEET_READY** | **CONDITIONALLY_READY** | Delta-API + Partial-SET-Schutz + UI-Pagination. Legacy `PUT …/vehicles` noch aktiv bis `STATIONS_V2_SET_VEHICLES_DISABLED`. |
| **PHYSICAL_POSITION_READY** | **CONDITIONALLY_READY** | Provenance-Spalten + Handover/Transfer/Manual-Position. `registerFromDimo` koppelt noch home+current. |
| **TRANSFERS_READY** | **CONDITIONALLY_READY** | Schema + API (`PLANNED→IN_TRANSIT→ARRIVED/CANCELLED`); begrenzte Unit-Tests; kein UI-Consumer. |
| **BOOKING_RULES_READY** | **CONDITIONALLY_READY** | Engine + Calendar + Capacity-Regel. Override-Pfad für `MANUAL_CONFIRMATION_REQUIRED` fehlt; nur `shadow`/`warning` für Pilot empfohlen. |
| **OPERATIONS_READY** | **CONDITIONALLY_READY** | Archive-Preview API; Domain-Audit flag-gated; Transfer-Lifecycle API. Runbook-CLI-Lücken. |
| **KPI_READY** | **CONDITIONALLY_READY** | Batch-Summaries, TZ-aware today-KPIs, home-basierte Kapazität. Health-Warnings weiter partial. |
| **UI_UX_READY** | **CONDITIONALLY_READY** | `stationsUiV2Enabled` Gating (Sidebar/App); Restore; Batch-Summaries. Kein Stations-E2E; Gesamt-Frontend-Build rot (unrelated). |
| **MONITORING_READY** | **CONDITIONALLY_READY** | Prometheus-Counter/Histogram im Code; keine verifizierten Alerts/Dashboards. |
| **OVERALL_READY** | **NOT_READY** | Voller V2-Rollout blockiert durch fehlende E2E, Diagnose-CLI, Repo-weite Build-Rotstellen, fehlendes Shadow-Gate in Prod. |
| **CONDITIONALLY_READY** | **JA** | Shadow-Pilot gemäß Abschnitt 6 möglich. |
| **NOT_READY** | **JA (für Voll-Rollout)** | Siehe Blocker Abschnitt 5. |

---

## 4. Authz- und Scope-Matrix (Code-Soll)

| Route (Auszug) | Permission | V2-Flag | Scope-Guard |
|----------------|------------|---------|-------------|
| `GET …/stations`, `stats`, `summaries` | `stations:read` | summaries → `stationSummaryV2Enabled` | List/Stats via `StationAccessService` |
| `POST …/stations`, `PATCH :id` | `stations:write` | — | `:id` wenn gesetzt |
| `DELETE :id` | `stations:manage` | — | archiviert nur |
| `POST …/archive`, `restore`, `set-primary` | `stations:write` | `stationsLifecycleV2Enabled` | `:id` |
| `POST …/change-home-station`, `home-fleet/preview` | `stations:write/read` | `stationDeltaAssignmentEnabled` | — |
| `GET/POST …/transfers` | read/write | `stationTransfersEnabled` | from/to Station |
| `PATCH …/vehicles/current-station` | `stations:write` | `stationPositioningV2Enabled` | — |
| `GET …/overview-stats`, `fleet` | `stations:read` | `stationSummaryV2Enabled` | `:id` |

**Rollen-Defaults:** `driver` hat **kein** `stations`-Modul (`organization-role.defaults.ts`) → API-Zugriff verweigert (gewollt, SEC-03 behoben).

---

## 5. Verbleibende Blocker (Voll-Rollout)

| ID | Thema | Schwere |
|----|-------|---------|
| B-01 | Kein `stations-v2-diagnose --dry-run` im Repo | P1 |
| B-02 | Kein Stations-V2 E2E (UI-Flags, Scope, Restore) | P1 |
| B-03 | Backend/Frontend Gesamt-Build rot (Twilio, `api.ts`-Typen) | P1 (CI) |
| B-04 | Booking-Rules `MANUAL_CONFIRMATION_REQUIRED` ohne Override-Workflow | P1 |
| B-05 | `registerFromDimo` koppelt home+current (HCE-03) | P2 |
| B-06 | Prometheus-Metriken ohne verifizierte Alert-Regeln | P2 |
| B-07 | JWT ohne embedded `stationScope` (DB-Lookup stattdessen) | P2 (akzeptiert) |

---

## 6. Aktive Feature Flags (Defaults: alle `false` in Prod)

| Flag-Key | Env-Variable | Abhängigkeiten |
|----------|--------------|----------------|
| `stationsSchemaV2Enabled` | `STATIONS_V2_SCHEMA_ENABLED` | — |
| `stationsScopeV2Enabled` | `STATIONS_V2_SCOPE_ENABLED` | Schema |
| `stationsLifecycleV2Enabled` | `STATIONS_V2_LIFECYCLE_ENABLED` | Schema |
| `stationSummaryV2Enabled` | `STATIONS_V2_SUMMARY_READ_MODEL_ENABLED` | Schema, Scope |
| `stationDeltaAssignmentEnabled` | `STATIONS_V2_DELTA_ASSIGNMENT_ENABLED` | Schema, Scope |
| `stationPositioningV2Enabled` | `STATIONS_V2_POSITIONING_ENABLED` | Schema, Scope |
| `stationBookingRulesEnabled` | `STATIONS_V2_BOOKING_RULES_ENABLED` | Schema, Scope |
| `stationCapacityWarningsEnabled` | `STATIONS_V2_CAPACITY_WARNINGS_ENABLED` | Booking Rules |
| `stationTransfersEnabled` | `STATIONS_V2_TRANSFERS_ENABLED` | Schema, Positioning |
| `stationAuditTrailEnabled` | `STATIONS_V2_AUDIT_TRAIL_ENABLED` | Schema |
| `stationGeofenceShadowEnabled` | `STATIONS_V2_GEOFENCE_SHADOW_ENABLED` | Schema |
| `stationsUiV2Enabled` | `STATIONS_V2_UI_ENABLED` | Scope, Summary |
| `bookingRulesEnforcement` | `STATIONS_V2_BOOKING_RULES_ENFORCEMENT` | `off\|shadow\|warning\|enforce` |
| `legacySetVehiclesEndpointDisabled` | `STATIONS_V2_SET_VEHICLES_DISABLED` | — |

**Org-Canary:** `STATIONS_V2_ORG_ALLOWLIST=<uuid-a>,<uuid-b>` — Flags wirken nur für gelistete Orgs.

---

## 7. Bekannte Einschränkungen

- **Geofence:** Shadow-Read only — **kein** automatischer Current-Write aus GPS (Invariante S3/R9 erfüllt).
- **SET-Legacy:** `PUT …/:id/vehicles` bleibt bis Schritt 10 aktiv; Partial-SET serverseitig abgelehnt.
- **Scope:** JWT enthält kein `stationScope`; Resolution über `OrganizationMembership` bei jedem Request.
- **KPI Partial Data:** `vehiclesWithHealthWarnings` liefert `null` mit `partialFields`-Metadaten.
- **Transfers:** API-only; kein Rental-UI; `ARRIVED` schreibt home+current (bewusster Transfer-Abschluss).
- **Diagnose:** Runbook-CLI `stations-v2-diagnose` und `stations-v2-data-remediation.md` noch nicht im Repo.
- **Prod-Ist (Audit 1):** 1 Org, 2 Stationen, 6 Fahrzeuge — keine station-scoped User in Prod.

---

## 8. Sichere Produktions-Aktivierungsreihenfolge

> Quelle: [`stations-v2-deployment.md`](../runbooks/stations-v2-deployment.md) + Shadow-Gates aus [`stations-v2-shadow-validation.md`](../runbooks/stations-v2-shadow-validation.md).  
> **Vor jedem Schritt:** `pg_dump`-Backup; PM2-Restart nur im Wartungsfenster; Verifikation mit `curl …/feature-flags` und `npm run test:stations:v2`.

| Schritt | Phase | Env (Canary-Org) | Gate vor nächstem Schritt |
|--------:|-------|------------------|---------------------------|
| **0** | Migration | *(DB-Migration anwenden)* | `prisma migrate deploy`; keine destructive SQL |
| **1** | Schema | `STATIONS_V2_SCHEMA_ENABLED=true` | API startet; keine Migrationsfehler |
| **2** | Scope/RBAC | `STATIONS_V2_SCOPE_ENABLED=true` | Scoped User: nur erlaubte Stationen; Driver ohne Permission → 403 |
| **3** | Lifecycle | `STATIONS_V2_LIFECYCLE_ENABLED=true` | Archive/Restore/Set-Primary; optional `STATIONS_V2_AUDIT_TRAIL_ENABLED=true` |
| **4** | Summary | `STATIONS_V2_SUMMARY_READ_MODEL_ENABLED=true` | `GET …/summaries` konsistent zu Einzel-`overview-stats` (Pilot-Stichprobe) |
| **5** | Delta Home | `STATIONS_V2_DELTA_ASSIGNMENT_ENABLED=true` | Home-Änderungen ohne Current-Drift; kein stiller SET-Detach |
| **6** | Positioning | `STATIONS_V2_POSITIONING_ENABLED=true` | Current/Expected mit Provenance; Home unverändert |
| **7a** | Rules Shadow | `STATIONS_V2_BOOKING_RULES_ENABLED=true` + `ENFORCEMENT=shadow` | **14 Kalendertage** Shadow-Runbook (T1) |
| **7b** | Rules Warning | `ENFORCEMENT=warning` | Weitere 14 Tage (T2) oder Gate-Review |
| **7c** | Rules Enforce | `ENFORCEMENT=enforce` + `STATIONS_V2_CAPACITY_WARNINGS_ENABLED=true` | Nur nach grünem Gate-Review |
| **8** | Transfers | `STATIONS_V2_TRANSFERS_ENABLED=true` | Plan/Arrive/Cancel in Pilot-Org |
| **9** | UI | `STATIONS_V2_UI_ENABLED=true` | Rental Stations sichtbar; Flags-API konsumiert |
| **10** | Legacy aus | `STATIONS_V2_SET_VEHICLES_DISABLED=true` | `PUT …/vehicles` → 410; alle Clients auf Delta |

**Parallel (optional, nach Schritt 6):**

```bash
STATIONS_V2_GEOFENCE_SHADOW_ENABLED=true   # nur Read-Model, kein Current-Write
```

**Explizit verboten bis eigener Vertrag/Prompt:**

- Automatische Geofence-Current-Writes aus Telemetrie/GPS
- Globales `enforce` + breite UI ohne abgeschlossenes Shadow-Gate (T1/T2)

### Rollback (Kurz)

| Stufe | Aktion |
|-------|--------|
| R1 | Betroffenes Flag `false` in `backend.env`; PM2 restart |
| R2 | `STATIONS_V2_UI_ENABLED=false` |
| R3 | `STATIONS_V2_BOOKING_RULES_ENFORCEMENT=off` |
| R4 | `STATIONS_V2_SCOPE_ENABLED=false` |
| R5 | `STATIONS_V2_SET_VEHICLES_DISABLED=false` falls SET benötigt |

---

## 9. Empfohlene nächste Schritte (post-78)

1. `stations-v2-diagnose.ts` (read-only `--dry-run`) in Repo mergen (Prompt 73-Rest).
2. Stations-V2 Playwright-Specs (Flag-Gate, Scope, Restore, Assign-Pagination).
3. Repo-weite Build-Fixes (Twilio-Dep, `api.ts`-Typen) für grüne CI.
4. Shadow-Pilot auf `STATIONS_V2_ORG_ALLOWLIST` gemäß Shadow-Runbook (14–28 Tage).
5. Override-Workflow für `MANUAL_CONFIRMATION_REQUIRED` vor `enforce`-Rollout.

---

## 10. Verifikations-Artefakte

| Artefakt | Ergebnis |
|----------|----------|
| `npm run test:stations:v2` | 24/24 PASS |
| `npx prisma validate` | PASS |
| Migration `20260718120000_stations_v2_final_fixes` | Additiv only |
| `nest build` | FAIL (Twilio, unrelated) |
| `frontend npm run build` | FAIL (`api.ts` types, unrelated) |
| Playwright Stations-Specs | Keine vorhanden |

---

*Read-only Verifikation — Prompt 78/78. Keine Produktionsmutation, kein Deployment, kein PM2-Restart.*
