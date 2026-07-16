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
| **1** | Implementierungsbaseline, Branch, Fortschrittsdatei, Baseline-Tests | Docs only | Audit `5280a83` | Nein | Nein | Nein | **DONE** | `94a1049` |
| **2** | P0-TH-04: Kein synthetisches GT in `TireWearDataPoint` | `tire-health.service.ts`, `tire-ground-truth.util.ts` | — | Nein | Nein | Nein | **DONE** | `0da74af` |
| **3** | Evidence Source + Provenance Schema | `schema.prisma`, migration, evidence modules | 2 | **Ja** (nicht auf Prod) | Nein | Nein | **DONE** | `5b0571f` |
| **4** | P1-TH-08: Trip-Ledger + Finalize→Usage | trips + `updateTireUsageFromTrip` | 3 | Ja (ledger table) | Ja | Nein | PENDING | — |
| **5** | P0-TH-01: 8-mm-Fallback entfernen/absichern | `tire-identity.service.ts` | — | Nein | Ja | Nein | PENDING | — |
| **6** | P0-TH-02: Partial unique ACTIVE setup | `schema.prisma` + lifecycle | — | **Ja** | Ja | Nein | **DONE** | Prompt 5 |
| **7** | P1-TH-06: Wear-Data-Point Dedupe | `tire-health.service.ts` | 2, 3 | Nein | Ja | Nein | PENDING | — |
| **8** | P1-TH-01/07: Lifecycle km-Konsistenz | `activateStoredSet`, per-tire km | 4 | Nein | Ja | Nein | PENDING | — |
| **9** | P1-TH-05/12: kPa→bar DIMO-Ingest | `dimo-snapshot.processor.ts` | — | Nein | Ja | Nein | PENDING | — |
| **10** | Druck-Katalog + Validierung + Tests | config + wear model | 9 | Nein | Ja | Nein | PENDING | — |
| **11** | P0-TH-21: HM-Injection Rental Health | `rental-health.service.ts` | 10 | Nein | Ja | Nein | PENDING | — |
| **12** | P1-TH-22/23: Strukturiertes Blocking/Evidence | rental-health + types | 11 | Nein | Ja | Nein | PENDING | — |
| **13** | P1-TH-18: `modelVersion` auf Snapshots befüllen | recalculate writes | 2, 3 | Nein (Spalte in Prompt 3) | Ja | Nein | **PARTIAL** | — |
| **14** | P1-TH-09/10: Snapshot/Event-Dedupe | recalculate + processor | 13 | Nein | Ja | Nein | PENDING | — |
| **15** | P2-TH-24: Prometheus Tire-Metriken | observability | — | Nein | Ja | Nein | PENDING | — |
| **16** | Recalc-Queue-Monitoring | `MONITORED_QUEUES` | 15 | Nein | Ja | Nein | PENDING | — |
| **17** | `TireHealthService`-Orchestrierungstests | `tire-health.service.spec.ts` | 2, 11 | Nein | Nein | Nein | **PARTIAL** (recalc GT Prompt 2) | — |
| **18** | Regression/Leakage-Tests recalculate | tire-health.spec | 2, 7 | Nein | Nein | Nein | **PARTIAL** (GT + regression filter Prompt 2) | — |
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
| 6 | Partial unique index | `(vehicle_id) WHERE status = 'ACTIVE'` | **Erledigt Prompt 5** |
| 3 | `20260716180000_tire_evidence_ground_truth_provenance` | Evidence enums + provenance columns (additive) |
| 5 | `20260716183000_tire_lifecycle_invariants` | Lifecycle enum + partial unique indexes (nicht auf Prod) |
| 13 | `model_version` auf `tire_health_snapshots` | **Teilweise in Prompt 3** — Spalte vorhanden, Writes folgen Prompt 13 |
| 3b | Optional data backfill | `installed_odometer_km` — **nicht** im Audit-Scope automatisch |

**Bis Prompt 3:** Migration erstellt, **nicht auf Produktion angewendet**. Keine Daten-Backfills.

---

## Prompt 3 — Evidence Source & Provenance Schema (2026-07-16)

### Neue Enums

| Enum | Werte |
|------|-------|
| `TireEvidenceSource` | `MANUAL_MEASUREMENT`, `WORKSHOP_MEASUREMENT`, `DOCUMENT_MEASUREMENT`, `MANUFACTURER_CONFIRMED`, `USER_CONFIRMED`, `AI_ESTIMATED`, `MODEL_ESTIMATED`, `DEFAULT_ASSUMPTION`, `PROVIDER_SIGNAL`, `UNKNOWN` |
| `TireBaselineStatus` | `UNKNOWN`, `INCOMPLETE`, `ESTIMATED`, `CONFIRMED`, `DOCUMENTED` |

Zentrale TypeScript-Module: `tire-evidence-source.ts`, `tire-provenance.repository.ts`

### Neue Felder (alle nullable / ohne Backfill)

| Modell | Felder |
|--------|--------|
| `VehicleTireSetup` | `initialTreadEvidenceSource`, `initialTreadMeasuredAt`, `initialTreadConfirmedAt`, `initialTreadEvidenceId`, `baselineConfidence`, `baselineStatus` |
| `Tire` | dieselben Baseline-Felder |
| `VehicleTireTreadMeasurement` | `evidenceSource` |
| `TireWearDataPoint` | `isGroundTruth`, `actualSource`, `actualMeasurementId`, `actualMeasuredAt`, `predictionGeneratedAt`, `modelVersion`, `modelConfigHash`, `predictionSnapshotId` |
| `TireHealthSnapshot` | `modelVersion`, `modelConfigHash`, `inputFingerprint`, `baselineSource`, `evidenceSummary` |

Legacy `initialTreadSource` (String) und `source` (String) auf Measurements **unverändert**.

### Migration

`backend/prisma/migrations/20260716180000_tire_evidence_ground_truth_provenance/migration.sql`

### FK / Delete-Constraints

| Relation | onDelete | Begründung |
|----------|----------|------------|
| `TireWearDataPoint.actualMeasurement` → `VehicleTireTreadMeasurement` | **RESTRICT** | GT-Messung darf Validierungsdaten nicht still löschen |
| `TireWearDataPoint.predictionSnapshot` → `TireHealthSnapshot` | **SET NULL** | Snapshot-Löschung behält Wear-Punkt |
| `VehicleTireSetup.initialTreadEvidence` → Measurement | **SET NULL** | Evidence-Link optional |
| `VehicleTireTreadMeasurement.tireSetup` | **RESTRICT** (war CASCADE) | Setup-Löschung erfordert explizite Measurement-Auflösung |

### Tests

```bash
cd backend && npx prisma format && npm run prisma:validate && npx prisma generate
npx tsc -p tsconfig.json --noEmit
npm test -- tire
# 10 suites, 173 passed (+15 neue Evidence/Provenance-Tests)
```

Neue Testdateien: `tire-evidence-source.spec.ts`, `tire-provenance.repository.spec.ts`, `tire-schema.spec.ts`

### Deployment-Hinweise

1. **Staging zuerst:** `npx prisma migrate deploy` auf Staging-VPS
2. **Kein Daten-Backfill** in dieser Migration — alle neuen Spalten bleiben `NULL`
3. **Breaking behavior:** Löschen eines `VehicleTireSetup` mit Messungen schlägt fehl (RESTRICT), bis Messungen/Wear-Punkte explizit aufgelöst sind
4. **Prompt 4+** wird `recalculate()` anreichern, um neue Provenance-Felder bei Writes zu setzen
5. **Produktion:** Migration erst nach Review + Staging-Deploy ausführen

### Bestätigung

- ✅ Additiv und rückwärtskompatibel
- ✅ Keine Bestandsdaten klassifiziert oder überschrieben
- ✅ `isGroundTruth` ohne DEFAULT — niemals implizit `true`
- ✅ Keine Wear-Formel-, UI- oder Runtime-Änderung

---

## Prompt 4 — Evidence Provenance Write Paths (2026-07-16)

### Ziel

Alle Tire-Schreibpfade setzen `TireEvidenceSource` und Baseline-Provenance korrekt. Der 8-mm-Fallback bleibt numerischer Modellstart, erscheint aber nie als Messung.

### Neue zentrale Helper (`tire-evidence-provenance.ts`)

| Helper | Zweck |
|--------|-------|
| `resolveInitialTreadEvidence(...)` | Einheitliche Auflösung von Baseline-Evidenz inkl. 8-mm-Fallback |
| `deriveBaselineConfidence(...)` | Confidence nach Evidenzquelle (`DEFAULT_ASSUMPTION` ≤ 20) |
| `isMeasuredEvidence(...)` | `MANUAL` / `WORKSHOP` / `DOCUMENT` |
| `isConfirmedEvidence(...)` | `MANUFACTURER_CONFIRMED` / `USER_CONFIRMED` |
| `buildSnapshotEvidenceSummary(...)` | Snapshot-`evidenceSummary`-Payload |
| `buildSetupBaselineFields(...)` | Setup/Tire-Baseline-Spalten für Prisma-Writes |

### Verdrahtete Schreibpfade

| Pfad | Datei | Evidence-Verhalten |
|------|-------|-------------------|
| Tire Setup Creation | `tire-lifecycle.service.ts` → `installTireSet` | `buildSetupBaselineFields` auf Setup-Create |
| `ensureTiresForSetup` | `tire-identity.service.ts` | Per-Rad `DEFAULT_ASSUMPTION` bei 8-mm-Fallback; Setup-Baseline-Update |
| Fahrzeugregistrierung | `tire-lifecycle.service.ts` → `upsertSetupAndMeasurement` | `manual_registration` → `DOCUMENT_MEASUREMENT`; Baseline-Patch |
| Manuelle Messung | `recordMeasurement` | `evidenceSource` auf Measurement + Setup-Baseline |
| Werkstatt / Dokument | `recordMeasurement` | `WORKSHOP_MEASUREMENT` / `DOCUMENT_MEASUREMENT` via Legacy-Source |
| AI Tire Spec (Job) | `ai-tire-spec-job.service.ts` | `AI_ESTIMATED` beim Fetch; `USER_CONFIRMED` bei `applyResult` |
| AI Tire Spec (Direct) | `vehicle-intelligence.controller.ts` | `userConfirmedSpec` aus DTO (default `false`) |
| `userConfirmedSpec` | `ai-tire-spec-normalizer.ts` | **Fix:** default `false`, nicht mehr auto-`true` |
| Teilersatz / Vollersatz | `replaceAtPosition` / `replaceTires` | Replacement → `MANUAL`/`WORKSHOP`; keine GT ohne Messung |
| Rotation | `rotateTires` → `recordMeasurement` | `calibration` → `MODEL_ESTIMATED` |
| Stored Set Reactivation | `activateStoredSet` | Erbt gespeicherte Setup-Provenance (kein Reset) |
| Recalculation | `tire-health.service.ts` | Snapshot + Wear-Data-Point-Provenance |
| Snapshot Creation | `recalculate()` | `evidenceSummary` mit `isMeasured` / `isDefaultAssumption` |
| Validation Data Point | `recalculate()` | `buildWearDataPointProvenance`; `isGroundTruth` nur bei echter Messung |

### Wear-Model-Anpassung

`fallback_estimate` wenn `setup.initialTreadEvidenceSource === DEFAULT_ASSUMPTION` (statt `initial_manual_plus_wear`).

### API — `TireHealthSummary` (additiv)

Neue Felder (Backend-DTO, keine UI-Umbauten):

- `currentTreadValue`
- `currentTreadEvidenceSource` (`TireEvidenceSource`)
- `isMeasured`, `isEstimated`, `isDefaultAssumption`
- `lastActualMeasurementAt`
- `baselineSource`

Legacy `currentTreadSource` (String / `TreadSource`) bleibt für Abwärtskompatibilität.

### 8-mm-Fallback-Invariante

| Regel | Status |
|-------|--------|
| Numerischer Startwert erlaubt | ✅ |
| `isGroundTruth = true` | ❌ nie |
| `actualMeasurementId` | ❌ nie |
| Hohe Baseline-Confidence | ❌ max ~20 |
| Als „gemessen“ in API/UI | ❌ `isMeasured: false`, `isDefaultAssumption: true` |

### Tests

```bash
cd backend && npm test -- tire
# 11 suites, 188 passed (+15 neue Provenance-Tests)
```

Neue/erweiterte Testdateien:

- `tire-evidence-provenance.spec.ts` — 8-mm-Fallback, Messung, AI Spec, User Confirmation, Dokument, Stored Set, Teilersatz, partielle Räder, AI-Spec-default
- `tire-health.service.spec.ts` — Snapshot-Provenance, Wear-Data-Point-Provenance

### Bestätigung Prompt 4

- ✅ Jeder neue Tire-Wert besitzt nachvollziehbare Provenance
- ✅ 8 mm ist eindeutig `DEFAULT_ASSUMPTION`
- ✅ Kein Default wird als Messung ausgegeben
- ✅ Keine Prediction wird Ground Truth
- ✅ API kann Evidence eindeutig transportieren
- ✅ Keine UI-Umbauten, keine Produktionsdatenänderung

---

## Prompt 5 — Tire Lifecycle Invariants (2026-07-16)

### Ziel

Lifecycle gegen widersprüchliche aktive Setups, doppelte Radpositionen und verlorene kumulative Laufleistung absichern.

### Zustandsmaschine (`tire-lifecycle-state.ts`)

| Zustand | Bedeutung |
|---------|-----------|
| `NEW` | Setup angelegt, noch nicht aktiv |
| `ACTIVE` | Einziger health-berechtigter Zustand |
| `STORED` | Ausgebaut, kumulativ km erhalten |
| `REMOVED` | Terminal — vom Fahrzeug entfernt |
| `RETIRED` | Terminal — verworfen/verkauft (`DISCARDED`/`SOLD` legacy) |

Rotation und Reactivation bleiben **Events** (`TireEvent`, `TirePositionHistory`), keine Dauerzustände.

### DB-Constraints (Migration `20260716183000_tire_lifecycle_invariants`)

| Index | Regel |
|-------|-------|
| `vehicle_tire_setups_one_active_setup_per_vehicle` | Partial unique: `(vehicle_id) WHERE status='ACTIVE' AND removed_at IS NULL` |
| `tires_one_active_tire_per_setup_position` | Partial unique: `(tire_set_id, current_position) WHERE active=true` |

**Prisma-Hinweis:** Partial unique indexes sind nur in SQL verwaltet (nicht in `schema.prisma` deklarierbar). `prisma migrate deploy` wendet die Migration an; `prisma db pull` spiegelt sie nicht als `@@unique` wider.

### Verdrahtete Lifecycle-Operationen

| Operation | Datei | Transaktional | Invarianten |
|-----------|-------|---------------|-------------|
| `installTireSet` | `tire-lifecycle.service.ts` | ✅ `$transaction` | Archiv ACTIVE→STORED/RETIRED, dann neues ACTIVE |
| `replaceTires` | `tire-lifecycle.service.ts` | via install/partial | Nur ACTIVE health-eligible |
| `rotateTires` | `tire-lifecycle.service.ts` | Rotation in TX | Staggered-Guard, ACTIVE only |
| `activateStoredSet` | `tire-lifecycle.service.ts` | ✅ `$transaction` | Kumulativ-km erhalten, Remount, History |
| `storeTireSet` | **neu** | ✅ | ACTIVE→STORED, Dismount |
| `removeTireSet` | **neu** | ✅ | →REMOVED terminal |
| `retireTire` | **neu** | ✅ | Per-Rad retire, km im Event |
| `TirePositionHistory` | `tire-identity.service.ts` | in TX | Install/Rotate/Replace/Retire |

### Kumulativ-km bei Stored-Set-Reactivation

- `totalKmOnSet` / `cityKm` / `highwayKm` / `ruralKm` werden **explizit beibehalten**
- `installedAt` / `installedOdometerKm` starten neue Montageperiode
- `TirePositionHistory` bleibt erhalten; `remountStoredSetupTires` reaktiviert Identitäten

### API (additiv, keine UI-Umbauten)

- `POST /vehicles/:id/tires/store-set`
- `POST /vehicles/:id/tires/remove-set`
- `POST /vehicles/:id/tires/retire`

### Tests

```bash
cd backend && npm test -- tire
# 13 suites, 206 passed (+18 neue Lifecycle-Invariant-Tests)
```

Neue Testdateien:

- `tire-lifecycle-state.spec.ts` — Zustandsübergänge, Terminal, Conflict-Mapping
- `tire-lifecycle-invariants.spec.ts` — zwei aktive Setups, Stored Reactivation, staggered, Teilersatz-Pfad, Rollback, Multi-Tenant

### Bestätigung Prompt 5

- ✅ Widersprüchliche aktive Setups technisch verhindert (App + partial unique index)
- ✅ Lifecycle-Vorgänge atomar (`$transaction`)
- ✅ Kumulative Reifenhistorie bleibt erhalten
- ✅ Stored Sets nicht health-berechnet (`getActiveSetup` / `status=ACTIVE` only)
- ✅ Concurrency via unique-index → `ConflictException` getestet
- ✅ Migration **nicht** auf Produktion ausgeführt

---

## Prompt 6 — Traceable Odometer Anchors (2026-07-16)

### Ziel

Neue oder reaktivierte Tire Setups dürfen nur mit nachvollziehbarem Odometer-Anker prognosefähig werden. Kein erfundener Odometer.

### Schema (Migration `20260716190000_tire_odometer_anchor`)

**Neue Enums**

| Enum | Werte |
|------|-------|
| `TireOdometerAnchorSource` | `MANUAL_CONFIRMED`, `PROVIDER_DIMO`, `PROVIDER_HIGH_MOBILITY`, `VEHICLE_LATEST_STATE`, `DOCUMENTED`, `HISTORICAL_INFERRED`, `UNKNOWN` |
| `TireOdometerAnchorStatus` | `ANCHORED`, `ANCHOR_REQUIRED`, `MEASUREMENT_REQUIRED` |

**Additive Felder auf `VehicleTireSetup`**

- `installedOdometerSource`
- `installedOdometerCapturedAt`
- `installedOdometerEvidenceId`
- `odometerAnchorStatus`
- `odometerAnchorConfidence`

**Neue Tabelle `VehicleTireSetupMountPeriod`**

Revisionssichere Montageperioden — historische `installedOdometerKm`-Werte werden bei Stored-Set-Reactivation nicht still überschrieben; neue Periode als eigene Zeile.

### Kernmodul (`tire-odometer-anchor.ts`)

| Funktion | Zweck |
|----------|-------|
| `resolveOdometerAnchor()` | Serverseitig `VehicleLatestState` + Provider-Source lesen; Client-Wert nur mit `manualConfirmed` |
| `assessOdometerPlausibility()` | Rollback- und Sprung-Erkennung vs. letztem bekannten Wert |
| `deriveOdometerAnchorStatus()` | `ANCHORED` / `ANCHOR_REQUIRED` / `MEASUREMENT_REQUIRED` |
| `isPredictionCapable()` | Prognose nur bei `ANCHORED` |
| `applyAnchorToRemainingKmProjection()` | Unterdrückt präzise Rest-km + cappt Confidence |

### Verdrahtete Pfade

| Pfad | Anker-Verhalten |
|------|-----------------|
| `installTireSet` | Anker auflösen + Mount-Period anlegen |
| `activateStoredSet` | Neue Mount-Period; kumulativ km erhalten; alter Anker in History |
| `storeTireSet` / `removeTireSet` | Offene Mount-Period schließen |
| `replaceTires` (full_set) | via `installTireSet` |
| `replaceTires` (partial) | Setup-Anker unverändert; Event-Odometer serverseitig |
| `upsertSetupAndMeasurement` / Fahrzeugregistrierung | via `installTireSet` |
| API `POST /tires` | `confirmOdometerKm` erforderlich für Client-Odometer |

### API / DTO (additiv)

- `confirmOdometerKm?: boolean` auf Setup-/Change-/Activate-DTOs
- Summary-Felder: `predictionCapable`, `odometerAnchorStatus`, `odometerAnchorConfidence`, `installedOdometerSource`

### Tests

```bash
cd backend && npm test -- tire
# 14 suites, 222 passed (+16 neue Odometer-Anker-Tests)
```

Neue/erweiterte Testdateien:

- `tire-odometer-anchor.spec.ts` — DIMO, HM, manuell, kein Odometer, Rollback, Sprung, API-Manipulation
- `tire-lifecycle-invariants.spec.ts` — Stored-Set-Reactivation + unbestätigter Client-Odometer
- `tire-schema.spec.ts` — Enum-Verträge

### Bestätigung Prompt 6

- ✅ Neue Setups besitzen nachweisbaren Anker oder klaren `ANCHOR_REQUIRED`/`MEASUREMENT_REQUIRED`-Status
- ✅ Keine unbekannte Zahl wird erfunden
- ✅ Confidence und Prognosefähigkeit reagieren korrekt (`predictionCapable`)
- ✅ Montagehistorie revisionssicher via `VehicleTireSetupMountPeriod`
- ✅ Migration **nicht** auf Produktion ausgeführt

---

## Prompt 7 — Read-only Odometer Anchor Backfill Audit (2026-07-16)

### Ziel

Read-only Audit für bestehende Setups ohne belastbaren `installedOdometerKm`-Anker. Keine Produktionsdaten verändern.

### Deliverables

| Artefakt | Pfad |
|----------|------|
| Audit-Logik | `tire-odometer-anchor-backfill-audit.ts` |
| DB-Loader (read-only SQL) | `tire-odometer-anchor-backfill-audit.loader.ts` |
| Safety guard | `tire-odometer-anchor-backfill-audit.safety.ts` |
| Ops CLI | `backend/scripts/ops/audit-tire-odometer-anchor-candidates.ts` |
| Repo wrapper | `scripts/ops/audit-tire-odometer-anchor-candidates.sh` |
| Bericht | `docs/audits/tire-odometer-anchor-backfill-candidates-2026-07.md` |
| JSON Export | `docs/audits/data/tire-odometer-anchor-backfill-candidates-2026-07.json` |

### Kandidaten-Priorität (A→F)

1. Dokumentierte Installations-/Registrierungsmessung (`vehicle_tire_tread_measurements`)
2. Historischer DIMO-Odometer (`tire_health_snapshots` + `provider_source`)
3. Historischer HM-Odometer (`hm_signal_group_states`)
4. Snapshot-Historie (persistierte Snapshots — **nicht** live `vehicle_latest_states` allein)
5. Werkstatt-/Reifendokument (`vehicle_document_extractions` TIRE)
6. Explizite Trip-/Energy-Event-Odometer-Grenzen (`vehicle_energy_events.odometer_end_km`)

**Ausgeschlossen:** pauschale Rückrechnung vom heutigen Odometer minus Trip-km.

### Confidence-Klassen

`EXACT` | `HIGH_CONFIDENCE` | `MEDIUM_CONFIDENCE` | `LOW_CONFIDENCE` | `NO_SAFE_CANDIDATE` | `CONFLICTING_DATA`

### Ausführung

```bash
# Synthetic fixtures (kein DB-Zugriff)
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts --fixtures-only

# Read-only DB (supervised)
TIRE_ODOMETER_ANCHOR_AUDIT_ALLOW_PROD=1 cd backend && \
  npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-odometer-anchor-candidates.ts \
  --output-dir=../docs/audits/data \
  --report=../docs/audits/tire-odometer-anchor-backfill-candidates-2026-07.md
```

### Tests

```bash
cd backend && npm test -- tire-odometer-anchor-backfill
# 11 passed (alle Confidence-Klassen via Synthetic Fixtures)
```

### Bestätigung Prompt 7

- ✅ Read-only — kein Apply-Modus, keine Updates, keine Recalculation, keine Tire Events
- ✅ Kandidaten nachvollziehbar mit `supportingSignals` / `conflicts`
- ✅ Unsichere Fälle bleiben unsicher (`NO_SAFE_CANDIDATE`, `CONFLICTING_DATA`)
- ✅ Kein historischer Anker erfunden
- ✅ Anonymisierte Setup-IDs, keine VIN/Kennzeichen/GPS/Secrets im Bericht

---

## Prompt 8 — Controlled Odometer Anchor Backfill Apply (2026-07-16)

### Ziel

Kontrolliertes, standardmäßig sicheres Apply-Werkzeug für Bestandssetups — strikt getrennt vom Read-only-Audit. **In diesem Prompt nicht gegen Produktion ausgeführt.**

### Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `tire-odometer-anchor-backfill-apply.ts` | **Neu** — Plan, Validierung, Payload-Builder, Batch-Limit |
| `tire-odometer-anchor-backfill-apply.safety.ts` | **Neu** — Prod/Remote-Guards für Apply |
| `tire-odometer-anchor-backfill.service.ts` | **Neu** — Nest-Service: Plan + transaktionale Writes |
| `tire-odometer-anchor-backfill-apply.spec.ts` | **Neu** — Dry-run, Apply-Guards, Klassifikation, Idempotenz, Cross-Tenant, Batch |
| `tire-odometer-anchor-backfill-audit.ts` | `candidateHash`, `setupId`, Manifest-Hash |
| `audit-tire-odometer-anchor-candidates.ts` | Dry-run Plan + guarded `--apply` Pfad |
| `20260716200000_tire_odometer_anchor_backfill_event` | `ODOMETER_ANCHOR_BACKFILLED` Event-Typ |
| `docs/runbooks/tire-odometer-anchor-backfill.md` | **Neu** — Betriebs-Runbook |

### Apply-Schutz

- Default: **DRY RUN** (`apply: false`)
- `--apply` erfordert: Org/Setup-Scope, Candidate-Version, Manifest-Hash, Git-Ref, Schema-Version, Backup, Operator, Reason, Batch-Limit
- Auto-Apply nur `EXACT` + `HIGH_CONFIDENCE`
- `MEDIUM` / `LOW` / `CONFLICTING` → nur Manual-Review-Liste
- `NO_SAFE_CANDIDATE` → optional `MEASUREMENT_REQUIRED` (kein erfundenes km)
- Recalculation: separat via `--recalculate`, batch-limitiert

### Tests

```bash
cd backend && npm test -- tire-odometer-anchor-backfill
```

### Bestätigung Prompt 8

- ✅ Kein unbeabsichtigter Produktions-Apply (Safety-Guards + explizite Flags)
- ✅ Unsichere Historie bleibt Unknown / Manual Review
- ✅ Sichere Kandidaten revisionssicher (Candidate-Hash, TireEvent, Mount Period)
- ✅ Wiederholung erzeugt keine Doppeländerung (Idempotenz via Event-Hash)
- ✅ Runbook unter `docs/runbooks/tire-odometer-anchor-backfill.md`

---

## Prompt 9 — Tire Trip Usage Ledger (2026-07-16)

### Ziel

Persistenter, mandantensicherer und idempotenter Ledger für die Zuordnung abgeschlossener Trips zu Tire Setups. **Noch keine Integration** in den Trip-Finalisierungspfad.

### Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `schema.prisma` | **Neu** `TireTripUsageLedger` mit allen Pflichtfeldern |
| `20260716210000_tire_trip_usage_ledger` | Additive Migration + Tenant-Scope-Trigger |
| `tire-trip-usage-ledger.ts` | Source-Version, deterministischer `sourceFingerprint`, Road-Split-Helper |
| `tire-trip-usage-ledger.repository.ts` | Idempotentes Upsert, Tenant-Guards, Setup-Queries |
| `tire-trip-usage-ledger.repository.spec.ts` | Fingerprint, Idempotenz, Cross-Tenant, Upsert |
| `tire-trip-usage-ledger.schema.spec.ts` | Prisma-Validate, Schema-/Migrations-Contracts |
| `tire-trip-usage-attribution-policy-2026-07.md` | **Neu** — keine Auto-Split-Policy bei Setup-Wechsel |

### Ledger-Vertrag

- **Source of Truth** für zugeordnete Tire-Usage-Daten pro `(tripId, tireSetupId)`
- `@@unique([tripId, tireSetupId])` — ein Trip pro Setup nur einmal
- Updates nur bei geändertem `sourceFingerprint` (Reprocessing, verspätete Segmente, Distanzänderung, Invalidierung)
- `totalKmOnSet` / Belastungszähler auf Setup **unverändert** (später abgeleitete Aggregate)

### Tests

```bash
cd backend && npm test -- tire-trip-usage-ledger
```

### Bestätigung Prompt 9

- ✅ Ein Trip kann pro Setup nur einmal zugeordnet werden (Unique Constraint)
- ✅ `sourceFingerprint` deterministisch vorhanden
- ✅ Ledger mandantensicher (App-Guards + DB-Trigger)
- ✅ Bestehende Aggregate unverändert — keine Trip-Finalisierungs-Integration
- ✅ Keine automatische Split-Logik bei Setup-Wechsel (Policy dokumentiert)

---

## Prompt 10 — Canonical Trip Finalization → Tire Usage (2026-07-16)

### Ziel

Tire Usage genau einmal an den autoritativen, finalen Trip-Abschluss binden — nicht mehr nur über den Enrichment-Endpunkt.

### Kanonischer Finalisierungszeitpunkt

`tripAnalysisStatus === COMPLETED|SKIPPED` **und** alle Analysis-Stages terminal (`areAnalysisStagesComplete`) — ausgelöst in `TripAnalysisCoordinatorService.markStage` / `onBehaviorSkipped`.

| Phase | Bedeutung für Tire Usage |
|-------|--------------------------|
| Trip `COMPLETED` + `endTime` | Beendet, aber noch nicht usage-final |
| `PARTIAL` / `IN_PROGRESS` | Analytics läuft — **kein Write** |
| Terminal analysis + `analysisCompletedAt` | **Kanonisch final** → `TireTripUsageService` |
| Reprocessing / Retry | Idempotent via `sourceFingerprint` |
| Setup-Wechsel-Overlap | `REQUIRES_REVIEW` — kein Raten |

### Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `tire-trip-usage-attribution.ts` | Historische Setup-Auflösung, Finalisierungs-Guards, Aggregate-Delta |
| `tire-trip-usage.service.ts` | **Neu** — zentraler Service (Ledger + Aggregate + Event + Status) |
| `tire-trip-usage-attribution.spec.ts` | Setup vor/nach Wechsel, Overlap, Finalisierung |
| `tire-trip-usage.service.spec.ts` | Final trip, Retry, Enrich-Idempotenz, Review, Org, Reprocessing |
| `trip-analysis-coordinator.service.ts` | Hook nach terminaler Analysis |
| `vehicle-intelligence.controller.ts` | Enrich → `TireTripUsageService` (kein `updateTireUsageFromTrip`) |
| `tire-health.service.ts` | `updateTireUsageFromTrip` deprecated |
| `20260716220000_tire_trip_usage_attribution` | `TRIP_USAGE_ATTRIBUTED`, Trip-Processing-Status-Felder |

### Transaktion pro Apply

1. Ledger upsert (fingerprint-idempotent)
2. Setup-Aggregate delta (nur bei CREATED/UPDATED)
3. `TireEvent.TRIP_USAGE_ATTRIBUTED`
4. `vehicle_trips.tire_usage_attribution_status` + `tire_usage_processed_at`

### Tests

```bash
cd backend && npm test -- tire-trip-usage
```

### Bestätigung Prompt 10

- ✅ Finaler Trip wird über kanonischen Analysis-Abschluss berücksichtigt
- ✅ Reprocessing ohne Datenänderung = No-op (`UNCHANGED`)
- ✅ Setup-Zuordnung historisch über Mount-Perioden / Install-Intervalle
- ✅ Enrichment-Pfad erzeugt keine Doppelzählung mehr

---

## Prompt 11 — Replay & Concurrency Safety (2026-07-16)

### Ziel

`TireTripUsageLedger` sicher gegen geänderte Trip-Ergebnisse, verspätete Telemetrie und parallele Worker.

### Verhalten

| Fall | Aktion |
|------|--------|
| Gleicher Fingerprint | Sofortiger No-op — keine Events, kein Aggregate-Rebuild, Metric `duplicate_prevented` |
| Geänderter Fingerprint | Ledger-Revision + `TRIP_USAGE_REVISED` Audit, Aggregate **aus Ledger neu gebildet** |
| Cancelled / merged Trip | Soft-Invalidierung (`invalidatedAt`), Audit `invalidateTripUsage`, keine stillen Löschungen |
| Parallele Worker | Advisory xact lock + Unique + Retry (P2002/P2034) |

### Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `20260716230000_tire_trip_usage_replay_safety` | `TRIP_USAGE_REVISED`, Revision/Invalidation-Spalten |
| `tire-trip-usage-replay.ts` | Locks, Ledger-Rebuild, Retry, Audit-Payloads, Metriken |
| `tire-trip-usage-replay.spec.ts` | Rebuild, Retry, 10 parallele Worker |
| `tire-trip-usage.service.ts` | Rebuild statt Delta, strikter UNCHANGED-No-op, Invalidierung |
| `tire-trip-usage-ledger.repository.ts` | Revision-Felder, `invalidateTireTripUsageLedgerEntry` |
| `tire-trip-usage-attribution.ts` | Status `INVALIDATED` |
| `tire-trip-usage-attribution-policy-2026-07.md` | Prompt-11-Policy |

### Transaktion pro Apply (aktualisiert)

1. `pg_advisory_xact_lock(tripId, tireSetupId)`
2. Ledger upsert (fingerprint-idempotent)
3. Bei UNCHANGED → sofort return (kein Write)
4. Bei CREATED/UPDATED → Aggregate aus aktiven Ledger-Zeilen rebuilden
5. `TRIP_USAGE_ATTRIBUTED` (neu) oder `TRIP_USAGE_REVISED` (Änderung)
6. Trip-Processing-Status

### Tests

```bash
cd backend && npm test -- tire-trip-usage
```

### Bestätigung Prompt 11

- ✅ Keine Doppelzählung bei Retry (strikter Fingerprint-No-op)
- ✅ Geänderte Trip-Daten → korrekte Aggregate via Ledger-Rebuild
- ✅ Parallele Worker sicher (Lock + Retry)
- ✅ Historische Setup-Zuordnung stabil
- ✅ Invalidierung auditierbar, keine stillen Löschungen

---

## Prompt 12 — Historical Tire Trip Usage Backfill Dry Run (2026-07-16)

### Ziel

Read-only Dry-Run für den historischen Aufbau des `TireTripUsageLedger` aus vorhandenen Trips — **keine Produktionsdaten schreiben**.

### Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `tire-trip-usage-backfill-audit.ts` | Attribution, Distanz-Verifikation, Setup-Rollups, Fixtures, Markdown |
| `tire-trip-usage-backfill-audit.safety.ts` | Prod/Remote-Guards |
| `tire-trip-usage-backfill-audit.spec.ts` | 13 Szenarien (single, conflict, odometer, stored, …) |
| `audit-tire-trip-usage-backfill.ts` | Ops-CLI (60 Tage default, Filter, Batch) |
| `scripts/ops/audit-tire-trip-usage-backfill.sh` | Repo-Root-Wrapper |
| `tire-trip-usage-backfill-dry-run-2026-07.md` | Anonymisierter Fixture-Bericht |

### CLI

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts --fixtures-only

# DB (read-only, guarded):
npx ts-node -r tsconfig-paths/register scripts/ops/audit-tire-trip-usage-backfill.ts \
  --organization-id=<uuid> --days=60 --batch-size=200 --full-setup-history
```

### Tests

```bash
cd backend && npm test -- tire-trip-usage-backfill
```

### Bestätigung Prompt 12

- ✅ Vollständige Wirkung vor Apply sichtbar (Kandidaten, Konflikte, km-Abweichungen)
- ✅ Konflikte werden nicht automatisch geraten
- ✅ Kilometerabweichungen nachvollziehbar (authoritative vs ledger vs totalKmOnSet)
- ✅ Script strikt read-only

---

## Prompt 13 — Controlled Ledger Backfill & Reconciliation (2026-07-16)

### Ziel

Kontrollierter historischer Ledger-Backfill + deterministische Aggregate-Reconciliation. **Nicht gegen Produktion ausführen.**

### Geänderte / neue Dateien

| Datei | Änderung |
|-------|----------|
| `tire-trip-usage-backfill-apply.ts` | Apply-Plan, Report-Hash, Guards, Audit-Log |
| `tire-trip-usage-backfill-apply.safety.ts` | Prod/Remote-Apply-Guards |
| `tire-trip-usage-backfill.service.ts` | Orchestrierung: Apply + Reconcile + optional Recalc |
| `tire-trip-usage-ledger-reconciliation.service.ts` | Dry-run/Repair aus Ledger |
| `tire-trip-usage-backfill-apply.spec.ts` | Guards, Hash, Konflikt, Reconcile, Batch |
| `audit-tire-trip-usage-backfill.ts` | `--apply` Pfad + Nest-Service |
| `tire-trip-usage-ledger-backfill.md` | **Neu** — Runbook |

### Apply-Vertrag

- Nur `SINGLE_SETUP` ohne Odometer-Konflikt
- `--expected-report-hash` + `--confirm-backup` + Scope (org/vehicle/trip)
- Post-Batch: Aggregate-Rebuild aus Ledger
- Optional: `TireHealthService.recalculate` batch-limitiert

### Tests

```bash
cd backend && npm test -- tire-trip-usage-backfill
```

### Bestätigung Prompt 13

- ✅ Ledger sicher historisch aufbaubar (guarded apply)
- ✅ Aggregate aus Ledger reproduzierbar (reconciliation service)
- ✅ Unsichere Trips unberührt (manual review queue)
- ✅ Apply geschützt und idempotent

---

## Prompt 16 — DIMO Reifendruck kPa → bar (2026-07-16)

### Root Cause

`DimoSnapshotProcessor.normalizeSnapshot()` schrieb DIMO-Rohwerte (offiziell **kPa**) unverändert in `vehicle_latest_states.tire_pressure_*`. Der Wear-Model-Druckfaktor (`computePressureFactor`, nominal **2.5 bar**) interpretierte diese Werte als bar → z. B. VEHICLE_002 mit 274–301 kPa wirkte wie massive Überdruckung.

**Offizielle Semantik (verifiziert):**

| DIMO-Signal | Rad | Einheit |
|-------------|-----|---------|
| `chassisAxleRow1WheelLeftTirePressure` | FL | kPa |
| `chassisAxleRow1WheelRightTirePressure` | FR | kPa |
| `chassisAxleRow2WheelLeftTirePressure` | RL | kPa |
| `chassisAxleRow2WheelRightTirePressure` | RR | kPa |

Quellen: `scripts/audits/audit-tire-health-dimo-signals.ts`, Audit-Report P1-TH-12, `data-analyse-signal-catalog.ts` (intern **bar**).

**High Mobility:** unverändert — Konvertierung bleibt in `high-mobility-mqtt-payload.util.ts` (`normalizeHmTirePressures`) mit expliziter `unit`-Angabe; keine blinden HM-Änderungen in diesem Prompt.

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `dimo-tire-pressure.normalizer.ts` | **Neu** — Provider-Grenze: kPa `/100` → bar, Plausibilität, Source-Metadaten |
| `dimo-tire-pressure.normalizer.spec.ts` | **Neu** — Ingest-/Metadaten-Tests |
| `tire-pressure-canonical.util.ts` | **Neu** — Read-Compat für Legacy-DIMO-Zeilen (provider-scoped) |
| `tire-pressure-canonical.util.spec.ts` | **Neu** — Legacy/HM/getrennt, keine Doppelkonvertierung |
| `dimo-snapshot.processor.ts` | Normalisierung aller 4 Räder; `_synqdrive.tirePressure` in `rawPayloadJson` |
| `dimo-segments.service.ts` | `fetchTirePressureHistory` normalisiert kPa → bar |
| `tire-wear-model.service.ts` | Kanonische bar-Werte vor `computePressureFactor` |
| `tire-health.service.ts` | Recalc-Fingerprint, Confidence, `resolvePressureContext` mit bar |
| `tire-health-replay.service.ts` | Replay-Kontext mit kanonischen Druckwerten |

### Kanonisches Datenmodell (intern)

Pro Signal / Rad:

- `normalizedValue` — bar (für Wear-Modell und DB-Spalten ab Ingest-Fix)
- `normalizedUnit` = `BAR`
- `sourceValue` — Rohwert vom Provider
- `sourceUnit` = `KPA` (DIMO) bzw. `BAR` (post-fix / HM)
- `sourceProvider` = `DIMO`
- `sourceTimestamp`

Implausible Werte (`missing`, `0`, negativ, zu niedrig/hoch) → `normalizedValue = null` → kein Druckfaktor.

### Historische Daten — kein blindes Prod-Backfill

| Aspekt | Entscheidung |
|--------|--------------|
| DB-Spalten | Weiterhin `tire_pressure_*` (Float), semantisch **bar** |
| Legacy DIMO (kPa roh) | Read-Compat: nur wenn `providerSource = DIMO` und Wert in Legacy-kPa-Band (50–650) |
| Neue Ingests | Speichern bereits normalisierte bar-Werte |
| Prod-Backfill | **Nicht** in diesem Prompt — separates guarded Script empfohlen |

**Empfohlenes Backfill (späterer Prompt / Ops):**

```sql
-- Dry-run: Fahrzeuge mit DIMO-Legacy-kPa in bar-Spalten
SELECT vehicle_id, tire_pressure_fl, tire_pressure_fr, tire_pressure_rl, tire_pressure_rr
FROM vehicle_latest_states
WHERE provider_source = 'DIMO'
  AND (
    tire_pressure_fl BETWEEN 50 AND 650 OR
    tire_pressure_fr BETWEEN 50 AND 650 OR
    tire_pressure_rl BETWEEN 50 AND 650 OR
    tire_pressure_rr BETWEEN 50 AND 650
  );
```

Apply nur nach Review: `UPDATE … SET tire_pressure_* = tire_pressure_* / 100` mit Guard + Audit-Log; bis dahin reicht Read-Compat.

### Tests

- 274 kPa → 2.74 bar; 301 kPa → 3.01 bar
- fehlend / 0 / negativ / zu hoch → `normalizedValue = null`
- vier Radpositionen (`normalizeDimoSnapshotTirePressures`)
- Source-Metadaten (`toSynqDriveTirePressureMeta`)
- DIMO vs HM getrennt (keine HM-kPa-Heuristik auf Read-Pfad)
- keine Doppelkonvertierung (post-fix bar + Legacy-Read-Compat)

### Bestätigung Prompt 16

- ✅ DIMO-Druck wird **exakt einmal** an der Provider-Grenze normalisiert
- ✅ Interne Einheit eindeutig **bar**
- ✅ Provider-Herkunft in Metadaten / `_synqdrive` nachvollziehbar
- ✅ Wear-Modell erhält keine kPa-Werte als bar
- ✅ Keine blinden Produktions-DB-Updates

---

## Prompt 17 — Kanonisches TirePressureContext Read Model (2026-07-16)

### Ziel

Implizite/widersprüchliche Drucklogik (aggregierte DIMO/HM-Freshness, pauschales `hm_oem`, globale Timestamps) durch ein zentrales Read Model ersetzen.

### Neue Dateien

| Datei | Rolle |
|-------|-------|
| `tire-pressure-context.types.ts` | Kanonisches Schema: Räder, Coverage, Eligibility, TPMS |
| `tire-pressure-context.builder.ts` | Deterministischer Merge DIMO↔HM, Freshness, Wear-Gates |
| `tire-pressure-context.builder.spec.ts` | 14 Szenarien (DIMO/HM/MIXED/NONE, stale, TPMS, …) |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `tire-health.service.ts` | `resolvePressureContext` → Builder; Context an Wear-Modell |
| `tire-wear-model.service.ts` | Druckfaktor nur bei `wearEligibility.eligible` |
| `rental-health.service.ts` | Kein Text-Regex für Druckseverity; `sourceType`-basierte Quelle |
| `dimo-snapshot.processor.ts` + Query | `chassisTireSystemIsWarningOn` strukturiert in `_synqdrive.tpmsWarning` |
| `frontend/src/lib/api.ts` | Erweitertes `TirePressureContext`-Interface |

### Read-Model (Auszug)

- Pro Rad: `value`, `sourceProvider`, `sourceTimestamp`, `freshness`
- `sourceType`: `DIMO` \| `HIGH_MOBILITY` \| `MIXED` \| `NONE` (pro Rad, nicht pauschal HM)
- `coverage`: `wheelsAvailable`, `coveragePercent` (nie 100 % aus 1 Rad), `continuousExposureEligible`
- `tpmsWarning` / `tpmsWarningSource` — capability-gated (fehlend ≠ kein TPMS)
- `wearEligibility` — Druck nur als Wear-Faktor wenn plausibel, frisch, Quelle bekannt, Solldruck bekannt, Coverage ≥ `minReadingsForActive`

### Source Priority

Pro Rad: **neuerer `sourceTimestamp` gewinnt**; Tie → `HIGH_MOBILITY`.

### Bestätigung Prompt 17

- ✅ Druckquelle und Freshness pro Rad nachvollziehbar
- ✅ Kein Text-Regex als kanonische Severity-Quelle (Rental Health)
- ✅ Stale Druck → neutraler Wear-Faktor, `continuousExposureEligible=false`
- ✅ MIXED mit per-wheel `sourceProvider`

---

## Prompt 18 — Evidence-based Recommended Tire Pressure (2026-07-16)

### Ziel

Unsichere Ableitung des Solldrucks aus `maxInflationKpa` (Reifen-Maximalwert) entfernen. Wear-Faktor nur bei bestätigtem Fahrzeugsolldruck; UI/API zeigt fehlende Spec transparent.

### Schema / Migration

| Feld | Rolle |
|------|-------|
| `recommendedPressureFrontBar` / `recommendedPressureRearBar` | Achs-Solldruck (bar) |
| `recommendedPressureLoadedFrontBar` / `recommendedPressureLoadedRearBar` | Beladungsvariante |
| `pressureSpecSource` | `VEHICLE_MANUFACTURER` … `UNKNOWN` |
| `pressureSpecConfirmedAt` | Zeitpunkt der Bestätigung |
| `pressureSpecConfidence` | Quellenabhängige Confidence |

Migration: `20260716260000_tire_recommended_pressure`

### Neue / geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `tire-recommended-pressure.ts` | Resolver — **liest nie `maxInflationKpa`** |
| `tire-recommended-pressure.spec.ts` | Quellen, Achsen, loaded, AI vs. confirmed |
| `tire-pressure-context.builder.ts` | `recommendedPressure` + Wear-Gate |
| `tire-wear-model.service.ts` | `computePressureFactor(recommendedBar)` ohne Max-Inflation-Fallback |
| `tire-health.service.ts` | Summary: `recommendedPressure`, `pressureSpecMissingLabel` |
| `tire-lifecycle.service.ts` | Persist bei Install + `updateRecommendedPressure()` |
| `vehicle-intelligence.controller.ts` | `PATCH …/recommended-pressure` |
| `dto/tire-mutation.dto.ts` | `UpdateRecommendedPressureDto` |
| `frontend/src/lib/api.ts` | `RecommendedTirePressureSpec` auf Summary/Context |

### Invarianten

- `AI_ESTIMATED` → niedrigere Confidence (42), **nicht** wear-eligible
- `USER_CONFIRMED` erfordert `confirmPressureSpec=true` (keine Auto-Bestätigung)
- Unbekannter Solldruck → `pressureFactor = 1`, Label **„Solldruck nicht hinterlegt“**
- TPMS-Warnung bleibt unabhängig vom Solldruck nutzbar
- Staggered: Hinterachse explizit erforderlich

### Bestätigung Prompt 18

- ✅ Kein Maximaldruck als Sollwert im Wear-Pfad
- ✅ Source + Confidence im Read Model sichtbar
- ✅ Front/Rear und loaded getrennt
- ✅ API zur Erfassung (POST setup + PATCH recommended-pressure)

---

## Prompt 19 — Evidence-aware Rental Health & Blocking (2026-07-16)

### Ziel

Rental Health und Booking Gate behandeln geschätzte Profiltiefe nicht mehr wie gemessene Sicherheitswahrheit. Hard Blocks nur mit strukturierter Evidenz.

### Neue Dateien

| Datei | Rolle |
|-------|-------|
| `tire-rental-health.types.ts` | Kanonisches Read Model (wear/pressure/spec evidence, blocking, reason codes) |
| `tire-rental-health.policy.ts` | Zentrale Policy A–F (gemessen ≤1.6 → HARD_BLOCK; geschätzt kritisch → REVIEW/MEASUREMENT) |
| `tire-rental-health.policy.spec.ts` | 12+ Policy-Szenarien |
| `tire-rental-health-review.service.ts` | Zeitlich begrenzte Override + Audit |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `rental-health.service.ts` | HM-Druck injiziert; `buildTireModuleHealth`; blocking nur bei `HARD_BLOCK` + Evidenz |
| `rental-health.controller.ts` | `POST/DELETE …/tire-rental-health/review-override` |
| `rental-health.service.spec.ts` | Tire blocking, TPMS, estimated vs measured |
| `frontend/.../tire-rental-health-ui.ts` | UI-Summary aus `tire_read_model` (keine Parallel-Policy) |
| `frontend/src/lib/api.ts` | `TireRentalHealthReadModel` auf `modules.tires` |

### Policy (Kurz)

| Situation | Aktion |
|-----------|--------|
| Gemessen ≤ 1.6 mm | HARD_BLOCK |
| TPMS / Provider-Issue (frisch) | HARD_BLOCK |
| Geschätzt kritisch (hohe Conf.) | REVIEW_REQUIRED — kein Block |
| Geschätzt kritisch (niedrige Conf.) | MEASUREMENT_REQUIRED |
| Default 8 mm / stale / unknown | Nie GOOD |
| Override aktiv | Block unterdrückt bis `expiresAt` |

### Bestätigung Prompt 19

- ✅ Hard Blocks nur mit Evidenz + Reason Code
- ✅ `displayMode` / `evidence_type` ehrlich (measured ≠ estimated)
- ✅ DIMO/MIXED nicht als `hm_oem` gelabelt
- ✅ Booking Gate = `rental_blocked` aus derselben Policy
- ✅ Override: Permission, Reason, Expiry, ActivityLog

---

### Root Cause

`TireHealthService.recalculate()` (Z.428–429) setzte `actualTreadMm` auf Achsenmittel der **Prediction**, wenn keine Messwerte vorhanden waren (`actualFrontAvg = frontAvgPredicted`). Dadurch entstanden bei aktiviertem Odometer-Guard synthetische Validierungsdaten mit Null-Residual — Regression und Accuracy würden sich selbst bestätigen.

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `tire-ground-truth.util.ts` | **Neu** — `hasValidGroundTruthMeasurement`, `resolveAxleGroundTruthTreadMm`, Source-Whitelist, Synthetic-Leak-Detector |
| `tire-ground-truth.util.spec.ts` | **Neu** — 13 Unit-Tests |
| `tire-health.service.ts` | `recalculate()` schreibt Wear-Data-Points nur bei validem GT pro Achse |
| `tire-wear-model.service.ts` | `filterRegressionDataPoints` filtert `actual ≈ predicted` (Legacy-Schutz) |
| `tire-health.service.spec.ts` | **Neu** — 8 Recalculate-Regressionstests |
| `tire-health.spec.ts` | +1 Calibration-ohne-GT-Test, Regression-Filter-Test |

### Neue Invariante

> **Kein `TireWearDataPoint` ohne vollständige, zulässige Achsen-Messung (beide Räder).**  
> `actualTreadMm` stammt ausschließlich aus `resolveAxleGroundTruthTreadMm()` — niemals aus Prediction.  
> Snapshots und `predictedTreadMm` bleiben unverändert erlaubt.

### Tests (158 tire-related, alle grün)

```bash
cd backend && npm test -- tire
# 7 suites, 158 passed
```

### Verbleibende Schema-Defizite (nach Prompt 4)

- Legacy-Zeilen ohne `evidenceSource` — kein Backfill (bewusst)
- `inputFingerprint` / `modelConfigHash` auf Snapshots noch nicht befüllt (Prompt 13)
- Frontend-Typen in `api.ts` noch nicht um neue Summary-Felder erweitert (API-Vertrag vorbereitet)

### Verbleibende Schema-Defizite (nach Prompt 3) — erledigt in Prompt 4

- ~~Provenance-Felder noch nicht in `recalculate()` befüllt~~ → **erledigt Prompt 4**
- `installed_odometer_km` weiterhin oft null → Wear-Data-Points werden selten geschrieben
- Legacy-Zeilen in DB nicht bereinigt — nur Read-Filter in Regression

### Bestätigung

- ✅ Keine Produktionsdaten geändert
- ✅ Keine Migration
- ✅ Recalculation/Snapshots funktionieren weiter
- ✅ P0-TH-04 Codepfad behoben

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
| Prediction-as-GT aktiviert sobald Odometer gesetzt | P0 | **Mitigiert Prompt 2** — Code schreibt nur echte GT; Prompt 3 dennoch erst nach Review |
| kPa/bar falsch auf einzigem TPMS-Fahrzeug | P1 | **Mitigiert Prompt 16** — Ingest + Read-Compat; DB-Backfill optional später |
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
4. ~~P1-TH-12 — Einheitenfehler~~ → **Mitigiert Prompt 16** (DB-Backfill optional)
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
| dimo | `dimo-snapshot.processor.ts` | DIMO kPa → bar an Provider-Grenze → `vehicle_latest_states` |
| dimo | `dimo-tire-pressure.normalizer.ts` | Kanonische Normalisierung + Source-Metadaten |
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

## Prompt 22 — Capability-gated DIMO tire context signals (2026-07-16)

### Ziel

Nur audit-bewährte DIMO-Signale nutzen; fachlich unzulässige Ableitungen verhindern (Wheel Speed → Tread, Yaw-Doppelbelastung, Barometrik ohne Semantik, Außentemperatur als Reifentemperatur).

### Audit-Quellen

- `docs/audits/data/tire-health-dimo-signal-capability-2026-07.csv`
- `docs/audits/data/tire-health-dimo-timeseries-coverage-2026-07.csv`

### Neue Dateien

| Datei | Rolle |
|-------|-------|
| `tire-dimo-signal-capability.ts` | Signal-Registry + Capability-Gates (documented, listed, historical, coverage, stale, SynqDrive persist/use) |
| `tire-dimo-context.types.ts` | Read Model: ambient, odometer plausibility, TPMS capability |
| `tire-ambient-context.ts` | Mehrtägige zeitgewichtete Außentemperatur, Spike-Rejection, Druck-Kontexthinweise |
| `tire-dimo-context.builder.ts` | Orchestrierung + gated TPMS/Odometer/Speed Resolver |
| `*.spec.ts` | Szenarien: available/unavailable, coverage, multi-day ambient, spike, stale, calendar fallback, TPMS 0 %, no wheel-speed tread, no double driving factor |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `tire-status.ts` | `classifySeasonStatus` mit optionalem Ambient-Assist; Kalender-Fallback; advisory-only Hinweise |
| `tire-pressure-context.builder.ts` | TPMS nur bei Capability `usable` |
| `tire-wear-model.service.ts` | Gated Odometer/Speed; Ambient für Season-Mismatch; Heat-Stress ohne doppelte Driving-Last |
| `tire-health.service.ts` | `resolveDimoTireContext`, `dimoContext` auf Summary, Trip-basierte Ambient-Samples |
| `tire-health-alert.builder.ts` | Season-Alerts mit Ambient-Assist wenn capability-gated |

### Invarianten

- **Außentemperatur** = Umgebungskontext (nie Reifentemperatur); ≥2 Samples über mehrere Tage
- **Saison** = Kalender bleibt Fallback; Ambient verbessert Hinweisqualität; keine gesetzliche Aussage
- **Odometer** = Plausibilität/Anchor/Backfill; nicht additiv zu Trip-`totalKmOnSet`
- **TPMS** = Architektur vorbereitet; 0 % Audit-Abdeckung → `usable=false`, HM/Druck unverändert
- **DO_NOT_USE** = Wheel Speed, Yaw, Barometrik — explizit blockiert

### Bestätigung Prompt 22

- ✅ Neue Signale nur bei echter Capability
- ✅ Außentemperatur bleibt Kontext
- ✅ Keine nicht belegbare Profiltiefenableitung
- ✅ Keine doppelte Fahrbelastung (Driving Impact → Heat-Stress drivingWeight=0)
- ✅ **446** tire backend tests grün

---

## Prompt 23 — Observability & regression matrix (2026-07-16)

### Ziel

Tire Health operativ beobachtbar machen (strukturierte Logs + Prometheus) und kritische Audit-Testlücken (TC01–TC36) mit Regressionstests schließen.

### Neue Dateien

| Datei | Rolle |
|-------|-------|
| `tire-health-observability.util.ts` | JSON-Logs ohne PII (`vehicleId`/`tripId`/`vin` ausgeschlossen) |
| `tire-metrics.service.ts` | `synqdrive_tire_*` Counter/Gauge/Histogram auf `TripMetricsService.registry` |
| `tire-health-observability.service.ts` | Log + Metrik-Fassade; implementiert `TireTripUsageMetricHook` |
| `tire-health-observability.service.spec.ts` | Log-Format + Registry-Exposure |
| `tire-health-regression-matrix.spec.ts` | TC01–TC36 Audit-Matrix als Unit-Regression |
| `tire-recalculation.processor.spec.ts` | Queue-Metadaten: `concurrency: 2`, `lockDuration: 120s` |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `tire-health.service.ts` | Recalc/Snapshot/Pressure/Odometer/Default-Baseline Observability |
| `tire-trip-usage.service.ts` | Ledger/Dedupe/Mapping-Conflict Metriken |
| `tire-health-alert.service.ts` | Alert created/resolved/deduped |
| `tire-prediction-validation.service.ts` | Ground-truth validation error + MAE |
| `tire-lifecycle.service.ts` | Measurement events |
| `rental-health.service.ts` | Rental-block Metriken |
| `tire-recalculation.processor.ts` | Async worker, `observeQueueLag`, bounded concurrency |
| `metrics-refresh.service.ts` | `TIRE_RECALCULATION` in `MONITORED_QUEUES` |
| `prometheus-config.spec.ts` | Tire-Metriken registriert via `TireMetricsService` |
| `vehicle-intelligence.module.ts` | Provider/Export `TireMetricsService`, `TireHealthObservabilityService` |
| `frontend/src/lib/api.ts` | `TireDimoContextResponse`, `WATCH` in `TireUiStatus` |

### Prometheus-Metriken (low-cardinality)

`synqdrive_tire_recalculation_total`, `_failed_total`, `_deduplicated_total`, `_duration_seconds`, `synqdrive_tire_usage_processed_total`, `_duplicate_prevented_total`, `_mapping_conflict_total`, `synqdrive_tire_measurement_total`, `synqdrive_tire_prediction_error_mm`, `synqdrive_tire_prediction_mae_mm`, `synqdrive_tire_pressure_coverage_ratio`, `_pressure_invalid_total`, `_signal_stale_total`, `synqdrive_tire_default_baseline_total`, `synqdrive_tire_ground_truth_total`, `synqdrive_tire_alert_total`, `synqdrive_tire_rental_block_total`, `synqdrive_tire_snapshot_created_total`

### Worker/Queue-Verhalten

- **Async:** Stunden-Scheduler → `dimo.tire.recalculation` (BullMQ); interaktive Lifecycle-Pfade rufen `recalculate` synchron (bounded, deduped via Fingerprint)
- **Retry:** Global `defaultJobOptions`: `attempts: 3`, exponential backoff 5s
- **DLQ:** `removeOnFail: { count: 5000, age: 7d }` (kein separates DLQ-Topic — failed jobs in Redis)
- **Lock:** Processor `lockDuration: 120_000`, `concurrency: 2`
- **Backlog/Lag:** `observeQueueLag` + `synqdrive_queue_*` via `MetricsRefreshService`

### Testergebnisse Prompt 23

| Suite | Ergebnis |
|-------|----------|
| `prisma validate` | ✅ |
| Backend `tsc --noEmit` | ✅ |
| Tire Backend Tests (41 Suites) | ✅ **519** passed |
| Full Backend Tests | ⚠️ **3** nicht-Tire-Suites fehlgeschlagen (Invoice-Payment-Task — vorbestehend) |
| Frontend `vitest` | ✅ **1461** passed |
| Frontend `tsc -b` | ⚠️ vorbestehende Prompt-21 UI-Typen (`SegmentLevel`, `HealthErrorsView`) |
| Backend `npm run build` | ✅ |
| Frontend `npm run build` | ⚠️ blockiert durch vorbestehende `tsc -b` UI-Fehler |
| Migration Test (leer + Fixture) | ⚠️ extern — kein Postgres in CI-Agent-Umgebung |
| Tire E2E (Playwright) | ⚠️ keine dedizierten Tire-E2E-Specs im Repo |

### Bestätigung Prompt 23

- ✅ Kritische Pfade (Dedupe, Ledger, Pressure, Blocking, Ground Truth) mit Regressionstests
- ✅ Tire Health metrisch + strukturiert loggbar ohne PII
- ✅ Worker-Queue async mit Retry/Lock/Lag-Metriken

---

## Prompt 24 — Staging verification & production rollout (2026-07-16)

### Ziel

Finale Verifikation der 24-Prompt-Remediation, Staging-/Rollout-Plan, ehrliches Production-Readiness-Urteil — **ohne unkontrollierte Produktionsdatenänderung**.

### Neue Artefakte

| Datei | Rolle |
|-------|-------|
| `docs/runbooks/tire-health-production-rollout.md` | 15-Schritt Produktions-Rollout + Rollback |
| `docs/audits/tire-health-post-remediation-readiness-2026-07.md` | Kategorie-Urteile A–I, Abnahmekriterien |
| `docs/audits/data/tire-health-post-remediation-verification-2026-07.json` | Maschinenlesbare Verifikationszusammenfassung |

### Voraussetzungen (Agent-CI)

| Check | Ergebnis |
|-------|----------|
| Prisma validate | ✅ |
| Backend typecheck + build | ✅ |
| Frontend typecheck + build | ✅ (Prompt-21 UI-Typfixes inkl. `tireStatusToSegment` → `SegmentLevel`) |
| Tire tests | ✅ **519** |
| Frontend tests | ✅ **1461** |
| Regression matrix TC01–TC36 | ✅ |
| Replay/audit suites | ✅ **84** |

### Staging / Live-Audits

| Aktivität | Ergebnis |
|-----------|----------|
| DB-Backup / Staging-Snapshot | ⚠️ Nicht in Agent-Umgebung |
| `migrate deploy` | ⚠️ Operator (Runbook) |
| Read-only VPS-Audits | ⚠️ Benötigt `DATABASE_URL` |
| Kontrollierter Staging-Apply | ❌ **Nicht ausgeführt** |
| Post-fix Backtest live | ❌ **Nicht ausgeführt** — weiterhin **NOT_ENOUGH_DATA** (n=4 Räder) |

### Finales Urteil

| Kategorie | Urteil |
|-----------|--------|
| Gesamt | **CONDITIONALLY_READY** |
| Model Validity | **NOT_ENOUGH_DATA** |
| Safety / Reliability / Observability / Tests | **READY** |

### 24 Implementation Commits

| # | Hash | Beschreibung |
|---|------|--------------|
| 1 | `08908ed` | Remediation baseline |
| 2 | `402b7e4` | Ground-truth leak fix |
| 3 | `7b49bf1` | Evidence/provenance schema |
| 4 | `b28f91a` | Provenance write paths |
| 5 | `3ae02f9` | Lifecycle invariants |
| 6 | `0c96083` | Traceable odometer anchors |
| 7 | `d3d3327` | Odometer backfill audit |
| 8 | `af2e220` | Odometer backfill apply |
| 9 | `d58d6c6` | Trip usage ledger |
| 10 | `850e230` | Trip finalization → usage |
| 11 | `df9f2ee` | Replay & concurrency |
| 12 | `f065a08` | Trip usage backfill audit |
| 13 | `97579b2` | Ledger backfill + reconciliation |
| 14 | `f9a27ac` | Recalculation fingerprint dedupe |
| 15 | `4df2c2c` | Prediction versioning |
| 16 | `7bf7715` | DIMO kPa → bar |
| 17 | `ea1c96d` | TirePressureContext |
| 18 | `09dc183` | Recommended pressure |
| 19 | `0482512` | Rental blocking policy |
| 20 | `d501dac` | Structured alerts |
| 21 | `d446b79` | Honest UI evidence |
| 22 | `9ba78b4` | DIMO context signals |
| 23 | `06e4e4f` | Observability + regression matrix |
| 24 | *(dieser Commit)* | Final verification + runbook |

### Bestätigung Prompt 24

- ✅ Keine Produktions-/Staging-Datenänderung in diesem Prompt
- ✅ Runbook und Post-Remediation-Audit erstellt
- ✅ Builds und Tire-Tests grün
- ⚠️ Live-Staging-Replay und Backtest-Re-Run an Operator delegiert

---

## Change Log

| Datum | Prompt | Aktion | Commit |
|-------|--------|--------|--------|
| 2026-07-16 | 1 | Baseline: Branch, Fortschrittsdatei, Tests dokumentiert | `94a1049` |
| 2026-07-16 | 2 | P0-TH-04: Ground-truth leak fix + 22 neue Tests | `0da74af` |
| 2026-07-16 | 3 | Evidence/provenance schema + migration (additive) | `5b0571f` |
| 2026-07-16 | 4 | Evidence provenance across all tire write paths | `b28f91a` |
| 2026-07-16 | 10 | Canonical trip finalization → tire usage integration | `850e230` |
| 2026-07-16 | 11 | Replay & concurrency safety for tire trip usage ledger | `df9f2ee` |
| 2026-07-16 | 12 | Historical tire trip usage backfill dry-run audit | `f065a08` |
| 2026-07-16 | 13 | Controlled ledger backfill + aggregate reconciliation | *(dieser Commit)* |
| 2026-07-16 | 16 | DIMO tire pressure kPa → bar at provider boundary + read compat | *(dieser Commit)* |
| 2026-07-16 | 17 | Canonical TirePressureContext read model | *(dieser Commit)* |
| 2026-07-16 | 18 | Evidence-based recommended tire pressure (no maxInflationKpa as nominal) | *(dieser Commit)* |
| 2026-07-16 | 19 | Evidence-aware rental health blocking policy | *(dieser Commit)* |
| 2026-07-16 | 20 | Structured tire health alerts with dedupe + revision-safe resolution | *(dieser Commit)* |
| 2026-07-16 | 21 | Honest tire health evidence in API + UI | *(dieser Commit)* |
| 2026-07-16 | 22 | Capability-gated DIMO tire context signals | `9ba78b4` |
| 2026-07-16 | 23 | Observability + TC01–TC36 regression matrix | `06e4e4f` |
| 2026-07-16 | 24 | Staging verification + production rollout runbook | *(dieser Commit)* |

---

## Bestätigung Prompt 1

- ✅ Audit-Commit `5280a83` als Basis — alle Audit-Dateien vorhanden
- ✅ Implementierungsbranch `fix/tire-health-production-readiness-2026-07` erstellt
- ✅ **Keine fachliche Änderung** am Tire-Modul
- ✅ **Keine Migration**, keine Produktionsdatenänderung, keine Recalculation, keine DIMO-Schreiboperation, keine Infrastrukturänderung
- ✅ Baseline-Tests ausgeführt und dokumentiert
- ✅ P0/P1-Ausgangsprobleme aus Audit bestätigt (Code unverändert)
