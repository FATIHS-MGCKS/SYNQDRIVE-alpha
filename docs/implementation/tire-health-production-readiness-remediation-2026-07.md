# Tire Health Production-Readiness Remediation — July 2026

| Field | Value |
|-------|-------|
| **Remediation ID** | `tire-health-production-readiness-remediation-2026-07` |
| **Audit branch** | `audit/tire-health-production-readiness-2026-07` |
| **Audit commit** | `5280a83bb8c0803c30a76dd726c277f3f0a5248d` |
| **Implementation branch** | `fix/tire-health-production-readiness-2026-07` |
| **Audit report** | `docs/audits/tire-health-production-readiness-2026-07.md` |
| **Findings register** | `docs/audits/data/tire-health-integrity-findings-2026-07.json` |
| **Started** | 2026-07-16 UTC |

---

## Ausgangslage

Der Tire-Health-Audit (Prompts 1–7, Juli 2026) bewertete Architektur, VPS-Integrität, DIMO-Signale, historisches Backtesting, Consumer-Verdrahtung und Tests auf einer **6-Fahrzeug-Flotte** (anonymisiert `VEHICLE_001`–`006`).

**Kernbefunde:**

- Pipeline läuft technisch (~1 320 Recalcs / 60d), aber **Wear-Data-Points = 0** (kein `installed_odometer_km`).
- **Prediction-as-Ground-Truth** im Code (`actualTreadMm = predicted` ohne Messung).
- **Rental Health** ohne HM-Druckkontext am Booking-Gate.
- **DIMO kPa als bar** interpretiert (1/6 Fahrzeuge mit TPMS).
- Trip-km nicht auf Setup-Counter angewendet; keine Trip-Ledger-Idempotenz.
- Backtest **NOT_ENOUGH_DATA** (n=4 Räder, MAE 0.213 mm).
- 22/30 Audit-Testszenarien fehlen in CI.

**Audit-Urteil:** `NOT_READY` (P0: 5 · P1: 17 · P2: 9 · P3: 0).

**Git-Basis bei Remediation-Start:**

- Arbeitskopie auf Audit-Commit `5280a83` (Branch `audit/tire-health-production-readiness-2026-07`).
- Gegenüber `origin/main` (`0672e0f`): **nur Audit-Artefakte** (+4 600 Zeilen, 16 Dateien) — keine Tire-Code-Änderungen seit `main`@`2cd57c8`.
- Implementierungsbranch `fix/tire-health-production-readiness-2026-07` von `5280a83` abgezweigt.

---

## Production-Readiness-Urteil (Ausgang)

| Kategorie | Urteil |
|-----------|--------|
| **Gesamt** | **`NOT_READY`** |
| A Correctness | NOT_READY |
| B Data Quality | NOT_READY |
| C Model Validity | NOT_ENOUGH_DATA |
| D Safety | CONDITIONALLY_READY |
| E Reliability | CONDITIONALLY_READY |
| F Observability | NOT_READY |
| G User Experience | CONDITIONALLY_READY |
| H DIMO Signal Readiness | NOT_READY |
| I Test Readiness | NOT_READY |

### Bestätigte P0-Ausgangsprobleme

| ID | Titel | Blocker |
|----|-------|---------|
| P0-TH-01 | 8 mm `ensureTiresForSetup`-Fallback | Ja |
| P0-TH-02 | Keine DB-Unique-Constraint ACTIVE Setup/Fzg. | Ja |
| P0-TH-03 | `installed_odometer_km` null → 0 Wear-Data-Points | Ja |
| P0-TH-04 | Predicted als `actualTreadMm` | Ja |
| P0-TH-21 | Rental Health ohne HM-Kontext | Ja |

### Bestätigte P1-Ausgangsprobleme (Auswahl)

| ID | Titel |
|----|-------|
| P1-TH-01 | `activateStoredSet` km-Fenster inkonsistent |
| P1-TH-02 | `initialTreadSource` semantisch falsch |
| P1-TH-03 | `urbanBias`/`highwayBias` ungenutzt |
| P1-TH-04 | AI setzt `userConfirmedSpec: true` |
| P1-TH-05 | Druck-Einheit nicht validiert (DIMO) |
| P1-TH-06 | Wear-Data-Point ohne Dedupe |
| P1-TH-07 | Trip-km nur auf Setup, nicht Tire |
| P1-TH-08 | Trip-km nicht angewendet (enrich-only) |
| P1-TH-09/10 | Duplicate Snapshots/Events |
| P1-TH-11 | ClickHouse offline bei Audit |
| P1-TH-12 | kPa als bar |
| P1-TH-13 | Druck nur 1/6 Fahrzeuge |
| P1-TH-17/18 | Backtest n zu klein; kein modelVersion |
| P1-TH-22/23 | Regex-Blocking; falsches evidence_type |

---

## Baseline (Prompt 1) — 2026-07-16

### Ausgeführte Befehle

| # | Befehl | Verzeichnis | Exit |
|---|--------|-------------|------|
| 1 | `npm run prisma:validate` | `backend/` | 0 |
| 2 | `npx tsc -p tsconfig.json --noEmit` | `backend/` | 0 |
| 3 | `npm test` | `backend/` | **1** |
| 4 | `npx tsc -b` | `frontend/` | 0 |
| 5 | `npm test` | `frontend/` | 0 |
| 6 | `npm run build` | `backend/` | 0 |
| 7 | `npm run build` | `frontend/` | 0 |
| 8 | `npm test -- tire` | `backend/` | 0 |
| 9 | `npm test -- tire` | `frontend/` | 0 |

### Testergebnisse (vor Änderungen)

| Suite | Ergebnis | Detail |
|-------|----------|--------|
| Backend gesamt | **3 FAIL** | 457 passed, 2 failed suites, 7 skipped — 4027 passed / 4037 total |
| Backend tire | **PASS** | 5 suites, 136 tests |
| Frontend gesamt | **PASS** | 231 files, 1452 passed, 1 skipped, 1 todo |
| Frontend tire | **PASS** | 2 files, 15 tests |

### Vorhandene Fehler (nicht Tire-bezogen, Baseline)

| Suite | Fehler | Ursache |
|-------|--------|---------|
| `invoice-payment-task.integration.spec.ts` | Priority `HIGH` statt `NORMAL` bei „due today“ | Task-Automation-Prioritätslogik vs. Test-Erwartung |
| `vehicles.controller.status-patch.spec.ts` (2×) | `invalidateFleetMapCache is not a function` | Mock `VehiclesService` ohne neue Cache-Invalidierungsmethode |

### Prisma Validate — Warnung

- `onDelete: SetNull` auf required FK — Schema gültig, keine Blockade für Tire-Remediation.

### Code-Abweichungen zum Audit (Landkarte)

**Keine audited Tire-Pfade entfernt.** Alle 44 Pfade in `tire-health-code-map-2026-07.csv` existieren.

| Typ | Delta |
|-----|-------|
| **Neu** | `tires/dto/tire-mutation.dto.ts`, `ai/vehicle-specs/tire-spec-ai.schema.util.ts`, Operator tire-measure Support-Dateien, `useVehicleHealthBoxData.ts`, `tire-health-detail-ui.test.ts` |
| **Umbenannt** | Audit `mapVehicleHealthBox` → Code `buildVehicleHealthBoxViewModel` |
| **Erweitert** | Wear-Model (+Temp/Load/Season-Faktoren), `tire-status` (+Season/Confidence), HM `normalizeHmTirePressureStatuses`, `getRotationHistory` |
| **Unverändert (P0-relevant)** | `ensureTiresForSetup` 8-mm-Fallback, `recalculate` predicted→actual, Rental ohne HM, DIMO kPa-Rohwerte |

Vollständige Inventur: Abschnitt **Code-Landkarte** unten.

---

## 24 Umsetzungsschritte (Cursor-Prompts)

| # | Ziel | Scope | Abhängigkeit | Migration | VPS | DIMO | Status | Commit |
|---|------|-------|--------------|-----------|-----|------|--------|--------|
| **1** | Implementierungsbaseline, Branch, Fortschrittsdatei, Baseline-Tests | Docs only | Audit `5280a83` | Nein | Nein | Nein | **DONE** | `5c01f20` |
| **2** | P0-TH-04: Kein synthetisches GT in `TireWearDataPoint` | `tire-health.service.ts` | — | Nein | Nein | Nein | PENDING | — |
| **3** | P0-TH-03: `installed_odometer_km` bei Install/Aktivierung | `tire-lifecycle.service.ts` | — | Optional Backfill-Skript | Ja | Nein | PENDING | — |
| **4** | P1-TH-08: Trip-Ledger + Finalize→Usage | trips + `updateTireUsageFromTrip` | 3 | Ja (ledger table) | Ja | Nein | PENDING | — |
| **5** | P0-TH-01: 8-mm-Fallback entfernen/absichern | `tire-identity.service.ts` | — | Nein | Ja | Nein | PENDING | — |
| **6** | P0-TH-02: Partial unique ACTIVE setup | `schema.prisma` + lifecycle | — | **Ja** | Ja | Nein | PENDING | — |
| **7** | P1-TH-06: Wear-Data-Point Dedupe | `tire-health.service.ts` | 2, 3 | Nein | Ja | Nein | PENDING | — |
| **8** | P1-TH-01/07: Lifecycle km-Konsistenz | `activateStoredSet`, per-tire km | 4 | Nein | Ja | Nein | PENDING | — |
| **9** | P1-TH-05/12: kPa→bar DIMO-Ingest | `dimo-snapshot.processor.ts` | — | Nein | Ja | Nein | PENDING | — |
| **10** | Druck-Katalog + Validierung + Tests | config + wear model | 9 | Nein | Ja | Nein | PENDING | — |
| **11** | P0-TH-21: HM-Injection Rental Health | `rental-health.service.ts` | 10 | Nein | Ja | Nein | PENDING | — |
| **12** | P1-TH-22/23: Strukturiertes Blocking/Evidence | rental-health + types | 11 | Nein | Ja | Nein | PENDING | — |
| **13** | P1-TH-18: `modelVersion` auf Snapshots | schema + recalculate | 2 | **Ja** | Ja | Nein | PENDING | — |
| **14** | P1-TH-09/10: Snapshot/Event-Dedupe | recalculate + processor | 13 | Nein | Ja | Nein | PENDING | — |
| **15** | P2-TH-24: Prometheus Tire-Metriken | observability | — | Nein | Ja | Nein | PENDING | — |
| **16** | Recalc-Queue-Monitoring | `MONITORED_QUEUES` | 15 | Nein | Ja | Nein | PENDING | — |
| **17** | `TireHealthService`-Orchestrierungstests | `tire-health.service.spec.ts` | 2, 11 | Nein | Nein | Nein | PENDING | — |
| **18** | Regression/Leakage-Tests recalculate | tire-health.spec | 2, 7 | Nein | Nein | Nein | PENDING | — |
| **19** | `evaluateTires` Blocking-Tests | rental-health.spec | 11, 12 | Nein | Nein | Nein | PENDING | — |
| **20** | 30/30 Consumer-Wiring-Szenarien | test matrix CSV | 11–19 | Nein | Nein | Nein | PENDING | — |
| **21** | P2-TH-14: `exteriorAirTemperature` persistieren | dimo-snapshot | 9 | Nein | Ja | Ja (read-only) | PENDING | — |
| **22** | P2-TH-15: TPMS-Warning-Ingest (wenn Signal) | dimo + health | 9 | Nein | Ja | Ja (read-only) | PENDING | — |
| **23** | VPS Read-only-Verifikation | audit scripts | 2–14 | Nein | **Ja** | Nein | PENDING | — |
| **24** | Backtest + Production-Readiness Re-Assessment | backtest script + report | 2–14, 23 | Nein | **Ja** | Nein | PENDING | — |

### Abnahmekriterien je Phase (Kurz)

| Phase | Prompts | Abnahme |
|-------|---------|---------|
| A Data integrity | 2–8 | 0 synthetische GT-Punkte; Trip-Ledger-Tests grün; Odometer gesetzt |
| B Pressure | 9–10 | V002 Druckfaktor plausibel (bar) |
| C Rental | 11–12 | Gate ≡ `/tires/summary` inkl. HM |
| D Versioning | 13–14 | Replaybarer Backtest; keine Dup-Snapshots |
| E Observability | 15–16 | Dashboards/Metriken für Recalc |
| F Tests | 17–20 | 30/30 Szenarien; keine Regression |
| G DIMO | 21–22 | Ambient temp persistiert; TPMS-Pfad bereit |
| H Validation | 23–24 | VPS grün; Backtest VALIDATED oder PARTIALLY_VALIDATED |

---

## Migrationen (geplant)

| Prompt | Migration | Beschreibung |
|--------|-----------|--------------|
| 4 | `trip_tire_usage_ledger` (o.ä.) | Idempotente Trip→Setup-Zuordnung |
| 6 | Partial unique index | `(vehicle_id) WHERE status = 'ACTIVE'` |
| 13 | `model_version` auf `tire_health_snapshots` | Formel-Version persistieren |
| 3 | Optional data backfill | `installed_odometer_km` — **nicht** im Audit-Scope automatisch |

**Bis Prompt 1:** Keine Migration ausgeführt.

---

## VPS-Verifikationen (geplant)

| Prompt | Verifikation |
|--------|--------------|
| 23 | Read-only SQL + Audit-Skripte Phase 3–5 |
| 24 | `audit-tire-health-backtest.ts` nach Fixes |

**Bis Prompt 1:** Keine VPS-Verbindung.

---

## Offene Risiken

| Risiko | Severity | Mitigation |
|--------|----------|------------|
| Prediction-as-GT aktiviert sobald Odometer gesetzt | P0 | Prompt 2 vor Prompt 3-Produktivierung |
| kPa/bar falsch auf einzigem TPMS-Fahrzeug | P1 | Prompt 9 vor Rental-Gate-Fix |
| Backfill `installed_odometer_km` falsch | P1 | Explizites Backfill-Prompt + VPS-Review |
| ClickHouse weiter offline | P2 | PG als kanonische Trip-Quelle beibehalten |
| 3 failing Backend-Tests (non-tire) | P2 | Nicht abschwächen; separat fixen wenn CI blockiert |
| DIMO MCP nicht verfügbar | P2 | Live API + Docs wie im Audit |

---

## Spätere Go-Live-Blocker (Zielzustand)

Blocker bleiben bis Abnahme Prompt 24:

1. P0-TH-04 — synthetisches GT
2. P0-TH-21 — Rental ohne HM
3. P0-TH-03 — keine Validierung ohne Odometer
4. P1-TH-12 — Einheitenfehler
5. NOT_ENOUGH_DATA — Backtest n zu klein

---

## Code-Landkarte (Baseline 2026-07-16)

### Backend — `vehicle-intelligence/tires/`

| Datei | Kernfunktionen |
|-------|----------------|
| `tire-health.service.ts` | `getSummary`, `getDetail`, `recalculate`, `updateTireUsageFromTrip`, `resolvePressureContext` |
| `tire-wear-model.service.ts` | `computeWearAnalysis`, Faktoren, `calibrateFromMeasurement`, Regression |
| `tire-lifecycle.service.ts` | `installTireSet`, `recordMeasurement`, `rotateTires`, `replaceTires`, `activateStoredSet` |
| `tire-identity.service.ts` | `ensureTiresForSetup` (**8 mm Fallback Z.97**), `applyRotation`, `replaceAtPosition` |
| `tire-status.ts` | `aggregateTireStatus`, `resolveDisplayMode`, Schwellen |
| `tire-health.config.ts` | `TIRE_HEALTH_CONFIG`, Spec-Resolver |
| `tires.service.ts` | `findSetupsByVehicle`, `getWearAnalysis` |
| `ai-tire-spec-normalizer.ts` | `buildPersistedAiTireSpec` (**userConfirmedSpec: true**) |
| `dto/tire-mutation.dto.ts` | REST DTOs *(neu vs. Audit)* |

### Backend — Consumer / Ingest

| Modul | Datei | Tire-Rolle |
|-------|-------|------------|
| rental-health | `rental-health.service.ts` | `getSummary` **ohne HM**; `evaluateTires` |
| dimo | `dimo-snapshot.processor.ts` | Rohdruck → `vehicle_latest_states` |
| high-mobility | `high-mobility-signal-usage.service.ts` | `getTirePressureSignals` |
| driving-impact | `driving-impact.service.ts` | `getVehicleImpactForTire` |
| trips | `vehicle-intelligence.controller.ts` | `enrichTrip` → `updateTireUsageFromTrip` |
| notifications | `rental-health-notification.projector.ts` | `TIRE_CRITICAL` aus Rental-Modul |
| workers | `tire-recalculation.scheduler.ts` | Stündlicher Recalc |
| workers | `tire-recalculation.processor.ts` | `recalculate()` |

### Frontend — Tire-Consumer

| Datei | API |
|-------|-----|
| `HealthErrorsView.tsx` | Summary, Detail, Mutations, HM refresh |
| `FleetConditionDetailView.tsx` | Summary, Detail |
| `VehicleInsightsCard.tsx` | Summary |
| `vehicle-health-box.mapper.ts` | `buildVehicleHealthBoxViewModel` |
| `operator/tire-measure/*` | Measurement wizard |
| `lib/tire-health-detail-ui.ts` | Display-Mode-Helfer |

### Prisma — Tire-Modelle

`VehicleTireSetup`, `Tire`, `VehicleTireTreadMeasurement`, `TireMeasurement`, `TirePositionHistory`, `TireEvent`, `TireHealthSnapshot`, `TireWearDataPoint`, `VehicleLatestState` (+ HM-Cache-Tabellen).

---

## Change Log

| Datum | Prompt | Aktion | Commit |
|-------|--------|--------|--------|
| 2026-07-16 | 1 | Baseline: Branch, Fortschrittsdatei, Tests dokumentiert | `5c01f20` |

---

## Bestätigung Prompt 1

- ✅ Audit-Commit `5280a83` als Basis — alle Audit-Dateien vorhanden
- ✅ Implementierungsbranch `fix/tire-health-production-readiness-2026-07` erstellt
- ✅ **Keine fachliche Änderung** am Tire-Modul
- ✅ **Keine Migration**, keine Produktionsdatenänderung, keine Recalculation, keine DIMO-Schreiboperation, keine Infrastrukturänderung
- ✅ Baseline-Tests ausgeführt und dokumentiert
- ✅ P0/P1-Ausgangsprobleme aus Audit bestätigt (Code unverändert)
