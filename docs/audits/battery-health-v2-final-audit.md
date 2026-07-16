# Battery Health V2 — Final Closure Audit (Prompt 77/78)

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-16 (Prompt 77 Read-only) · **Remediation** 2026-07-16 (Prompt 78) |
| **Scope** | Prompt 77: Read-only-Abschlussaudit. Prompt 78: P0/P1-Remediation + vollständige Validierung |
| **Methodik** | Code-Inspektion, Grep, Jest/Vitest/Playwright, `tsc`, Vite/Nest-Build, Prisma validate |
| **Verwandte Docs** | [`../testing/battery-health-v2-frontend-e2e-coverage.md`](../testing/battery-health-v2-frontend-e2e-coverage.md), [`../testing/battery-health-v2-backend-coverage.md`](../testing/battery-health-v2-backend-coverage.md), [`../runbooks/battery-health-v2-shadow-validation.md`](../runbooks/battery-health-v2-shadow-validation.md), [`../runbooks/battery-health-v2-deployment.md`](../runbooks/battery-health-v2-deployment.md) |

## Executive Summary

Battery Health V2 ist **architektonisch geschlossen** für Shadow-Betrieb: kanonische Read-Model-Pipeline (`CanonicalBatteryHealthService` + `canonical`), durable BullMQ-Jobs, Data-Quality-Gates, Shadow-Validation ohne Auto-Publication, umfangreiche Tests und grüne Builds.

**Prompt 78:** Beide **P1-Funde (B-01, B-02) behoben** — Legacy `BatteryV2Service` schreibt keine parallelen `SOH_PERCENT`-Evidence mehr; Rest-Capture triggert kanonisches `BATTERY_ASSESSMENT_RECOMPUTE`; Lead-Acid-Kurve nur noch chemistry-gated.

**Kein P0-Blocker** identifiziert (weder Prompt 77 noch 78).

**Finale Bewertung: `READY_FOR_SHADOW_ONLY`**

| Status | Bedeutung |
|--------|-----------|
| **READY** | Nein — Readiness/Publication weiterhin blockiert; historische DB-Belast + P2-Compat/UI offen |
| **READY_FOR_SHADOW_ONLY** | **Ja** — Default-Flags, Pipeline, Tests und P1-Fixes erlauben Shadow-Validierung 4–8 Wochen |
| **NOT_READY** | Nein |

**Verbleibende Risiken (P2, kein Shadow-Blocker):** Compat-API-Oberfläche, UI-Legacy-Fallbacks, stille `.catch()` in Summary-Konsumenten, historische DB-Belast bis Repair-Lauf, Retention-Storage bei Aktivierung.

---

## Test- und Build-Evidenz (Prompt 78 — nach P1-Remediation)

| Prüfung | Befehl | Ergebnis |
|---------|--------|----------|
| Prisma format/validate | `npx prisma format && npx prisma validate` | **grün** (bestehende SetNull-Warnung) |
| Migrationen destructive SQL | Grep `DROP\|DELETE FROM\|TRUNCATE` in `202607*.sql` | **keine Treffer** |
| Backend Battery V2 Unit | `npm run test:battery:v2` | **733/733 grün** (99 Suites) |
| Backend Integration | `npm run test:battery:v2:verify` (integration) | **12/12 grün** (provider-observation); Retention-Integration übersprungen (kein Docker) |
| Frontend Unit + E2E + Build | `npm run test:battery:v2:verify` | **78 Unit + 11 E2E + Build grün** |
| Backend Typecheck + Build | `npm run test:battery:v2:verify` | **grün** |
| Queue-Smoke / Retry-DL | `battery-v2-pipeline-hardening.spec`, `battery-v2-job-error.util.spec` | **grün** |
| Recharge-Reconciliation | `hv-recharge-session-reconcile.service.spec` | **grün** |
| M2/M3 Shadow | `hv-capacity-m2.policy.spec`, `hv-capacity-cross-session.policy.spec`, `hv-soh-gate.policy.spec` | **grün** |
| Legacy-Diagnose | `battery-data-diagnostic.service.spec` | **grün** |
| Remediation Dry-Run (CLI) | `scripts/ops/repair-battery-data.ts` (default dry-run) | **nicht ausführbar** in Cloud-Agent (kein DB/JWT/AppModule-Bootstrap); Logik via Diagnostic-Unit-Tests abgedeckt |
| Retention Dry-Run | `battery-v2-retention.service.spec` (`dryRun=true`, `deleted=0`) | **grün** |
| Prometheus | `battery-v2-prometheus.metrics.spec` | **grün** (15+ Counter) |
| KS FH 660E HV-Shadow | `hv-capacity-m2.policy.spec`, `vehicle-battery-reference-capacity.policy.spec`, `hv-method-profile.resolver.spec`, `dimo-recharge-segments.client.spec` | **grün** |
| ICE Rest/Wake | `lv-rest-measurement-quality.spec`, `battery-rest-target-evaluation.spec` | **grün** |

---

## Risiko-Register (kompakt) — Remediation-Status Prompt 78

| ID | Priorität | Status | Kurzbeschreibung |
|----|-----------|--------|------------------|
| B-01 | **P1** | **behoben** | Paralleles Legacy-LV-Scoring + `SOH_PERCENT`-Evidence — Rest-Capture → `BATTERY_ASSESSMENT_RECOMPUTE`; keine Evidence-Writes mehr |
| B-02 | **P1** | **behoben** | Lead-Acid `VOLTAGE_SOC` ohne Chemistry-Gate — `resolveLeadAcidCurveAllowed()` + `estimateLeadAcidSocPercent()` |
| B-03 | P2 | **behoben** (Alias) | Compat-APIs: `estimatedLvHealthScore`-Alias in `battery-health/v2` + `/latest`; `estimatedSohPct` deprecated |
| B-04 | P2 | **behoben** | `vehicle-health-box.mapper` — nur kanonischer Score, kein Legacy-Fallback |
| B-05 | P2 | **behoben** | HealthErrorsView: `formatBatteryVoltage`, HV-Chart „HV-Zustand Trend“, kein `!` |
| B-06 | P2 | **behoben** | `fetchCanonicalBatterySummarySafe` + strukturiertes Logging; `transientErrors` in Health-Summary |
| B-07 | P2 | **dokumentiert** | Default `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED=false` + Unit-Test |
| B-08 | P2 | **Ops** | Historische Daten — `audit-battery-data` / `repair-battery-data` (Dry-Run only, kein Auto-Apply) |
| B-09 | P2 | **mitigiert** | CI-Guard `verify-prisma-migration-timestamps.sh`; bekannte Duplikate dokumentiert |
| B-10 | P2 | **dokumentiert** | Retention Default OFF + `DRY_RUN=true`; Shadow-Gate `storage_growth` |

Alle übrigen geprüften Kategorien: **kein Problem** (siehe Detailabschnitte).

---

## 1. Verbleibendes Fire-and-forget

### 1.1 Primäre Battery-V2-Pipeline — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| **Codepfad** | `await this.batteryObservationProducer.classifyAndEnqueue(...)` (L152–178) |
| **Beweis** | Snapshot-Job wartet auf Enqueue; kein `void`/`.catch({})` auf Battery-Follow-up |
| **Empfohlene Korrektur** | — |

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` |
| **Codepfad** | `await this.batteryTripStartProducer.enqueueStartProxy(...)` (L928–931) |
| **Beweis** | Trip-Start triggert delayed `BATTERY_START_PROXY_EXTRACT` über Producer, nicht inline Crank-Extract |
| **Empfohlene Korrektur** | — |

`BatteryV2Service.onTripStart` ist als `@deprecated` markiert und wird **nicht mehr** aus der Trip-Orchestrierung aufgerufen (nur noch in Unit-Tests).

### 1.2 Reference-Capacity Task-Callback — **P2 (B-06)**

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.service.ts` |
| **Codepfad** | L196–198: `await this.batteryTasks?.onReferenceCapacityVerified(...).catch(() => undefined)` |
| **Auswirkung** | Task-Materialisierung nach Referenz-Verifizierung kann fehlschlagen ohne sichtbaren Fehler/Retry |
| **Beweis** | Fire-and-forget mit leerem Catch |
| **Empfohlene Korrektur** | Durable Job oder `BatteryV2JobProducer` für Task-Sync; mindestens strukturiertes Error-Log + Metrik |

### 1.3 Stille Summary-Fehler in Konsumenten — **P2 (B-06)**

| Feld | Wert |
|------|------|
| **Dateien** | `health-summary.service.ts` L159; `battery-task.service.ts` L137–139, L204 |
| **Codepfad** | `canonicalBatteryHealthService.getSummary(vehicleId).catch(() => null)` |
| **Auswirkung** | Health-Tab-Aggregat und Task-Automation verhalten sich bei transienten Summary-Fehlern wie „keine Batteriedaten“ statt Retry/Fehlerzustand |
| **Beweis** | Kein Re-Throw, kein Dead-Letter, kein UI-Fehlerpanel in diesen Pfaden |
| **Empfohlene Korrektur** | Unterscheidung `null` (kein Fahrzeug) vs. `error` (transient); optional Retry mit Backoff in Task-Pfad |

### 1.4 Ingestion-Bridge — kein Problem (bewusst synchron)

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-ingestion.service.ts` |
| **Codepfad** | `await this.batteryV2.onSnapshot(...)`, `await this.hvBattery.recordSnapshot(...)` |
| **Beweis** | Bridge delegiert **awaited** an Legacy-Services innerhalb des retryfähigen Queue-Handlers |
| **Empfohlene Korrektur** | Langfristig Logik in dedizierte Handler migrieren (Kommentar L38–41) — kein Fire-and-forget-Risiko |

---

## 2. Poll als Measurement

### 2.1 HV Snapshot Dedup — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/hv-battery-health.service.ts` |
| **Codepfad** | Observation-Policy + `idempotency_key` Unique Index (`hv_snapshot_observation_dedup` Migration) |
| **Beweis** | `hv-battery-health.service.observation.spec.ts` — duplicate polls erzeugen keine neuen Snapshots |
| **Empfohlene Korrektur** | — |

### 2.2 TELEMETRY_POLL_FALLBACK Ladesessions — **P2 (B-07, by design)**

| Feld | Wert |
|------|------|
| **Dateien** | `hv-fallback-charge-session.policy.ts`, `hv-charge-session-quality.assessor.ts`, `battery-v2-snapshot-ingestion.service.ts` L123–128 |
| **Codepfad** | Poll-Übergang `tractionBatteryIsCharging` → Session `TELEMETRY_POLL_FALLBACK` wenn DIMO-Recharge-Segmente nicht verfügbar |
| **Auswirkung** | Poll-basierte Ladesessions mit niedrigerer Evidence Strength; nicht für operative SOH-Freigabe gedacht |
| **Beweis** | Flag `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` (Default prüfen in Deployment-Runbook); M2/M3-Gates filtern Qualität; DIMO-Segment superseded Fallback |
| **Empfohlene Korrektur** | In Shadow-Validation `hv_fallback_charge_session`-Gate beobachten; Fallback in Prod nur wenn Segments dauerhaft fehlen |

### 2.3 Legacy Pairwise ΔEnergy/ΔSOC — kein Problem (Default OFF)

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/config/battery-health-v2.config.ts` |
| **Beweis** | `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED=false`; `hv-capacity-policy.spec.ts` |
| **Empfohlene Korrektur** | Flag in Prod **nicht** aktivieren |

---

## 3. Providerduplikate

### 3.1 Aktive Dedup-Pipeline — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-measurement.repository.ts`, `hv-snapshot-observation.policy.ts`, `battery-provider-observation.integration.spec.ts` |
| **Beweis** | Tenant-Idempotency + `(vehicleId, type, observedAt)` Unique; Metrik `synqdrive_battery_provider_duplicate_total` |
| **Empfohlene Korrektur** | — |

### 3.2 Historische HV-Snapshot-Duplikate — **P2 (B-08)**

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/diagnostic/battery-data-diagnostic.service.ts` |
| **Check** | `hv_persistence_duplicate` |
| **Auswirkung** | Vor Dedup-Migration angehäufte identische `hv_battery_health_snapshots`-Zeilen |
| **Beweis** | Repair-Action `dedupe_hv_snapshots` in `battery-data-repair.service.ts` |
| **Empfohlene Korrektur** | Ops: `audit-battery-data.ts` → `repair-battery-data.ts --apply` nach Dry-Run |

---

## 4. Falsche Freshness

### 4.1 Strukturiertes Freshness-Modell — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-freshness.policy.ts`, `canonical-battery-signal-freshness.builder.ts`, `canonical-battery-health.service.spec.ts` |
| **Beweis** | Separate `fetchFreshness` vs. `observationFreshness`; Regression „BMW X6 stale-first“; Provider-SOH STALE bei frischem Fetch sichtbar |
| **Empfohlene Korrektur** | — |

### 4.2 Health-Summary verschluckt Summary-Fehler — **P2 (B-06)**

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/health-summary/health-summary.service.ts` L159 |
| **Auswirkung** | Aggregiertes Health-Tab kann Battery-Modul als fehlend statt „stale/error“ darstellen |
| **Empfohlene Korrektur** | Expliziter `data_stale`/error-State statt `catch(() => null)` |

---

## 5. Wake-Werte als Rest

### 5.1 Laufende Kontamination-Erkennung — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `lv-rest-measurement-quality.ts`, `battery-rest-target-evaluation.ts`, `lv-rest-window.policy.ts` |
| **Beweis** | `CONTAMINATED_BY_WAKE`, `detectWakeFlankMeasurementIds`, Metrik `synqdrive_battery_rest_contaminated_total` |
| **Empfohlene Korrektur** | — |

### 5.2 Diagnose + Repair für historische REST-Qualität — **P2 (B-08)**

| Feld | Wert |
|------|------|
| **Datei** | `battery-data-diagnostic.service.ts` |
| **Check** | `rest_voltage_above_wake_threshold` |
| **Beweis** | `battery-data-diagnostic.service.spec.ts` — REST ≥ Wake-Schwelle bei VALID-Quality wird geflaggt |
| **Empfohlene Korrektur** | Repair `mark_rest_measurement_unverified` auf betroffene Flotte |

---

## 6. Crank ohne Coverage

### 6.1 Start-Proxy Cadence Gate — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/lv-start-proxy/battery-start-proxy-cadence-gate.ts` |
| **Codepfad** | `coverageRatio < MIN_COVERAGE_RATIO` → `insufficient_coverage` |
| **Beweis** | Metrik `synqdrive_battery_start_insufficient_coverage_total`; Diagnostic `crank_insufficient_coverage` |
| **Empfohlene Korrektur** | — |

### 6.2 Legacy Crank-Felder in DB — **P2 (B-08)**

| Feld | Wert |
|------|------|
| **Datei** | `battery-data-diagnostic.service.ts` L417–444 |
| **Auswirkung** | Alte `battery_features.crank*` ohne ausreichende Coverage können lesbar bleiben (`LEGACY_UNVERIFIED`) |
| **Beweis** | Repair `clear_crank_readiness_fields`; Default `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED=false` |
| **Empfohlene Korrektur** | Repair-Lauf + Verifikation in Shadow-Report `lv_start_proxy_coverage` |

---

## 7. BEV-Crank

### 7.1 Runtime-Gate — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-measurement.repository.spec.ts` (BEV → UNSUPPORTED_PROFILE), `battery-v2.service.ts` (Crank-Pfad deprecated), Trip-Producer |
| **Beweis** | BEV REST downgraded; ICE-only Start-Proxy-Job |
| **Empfohlene Korrektur** | — |

### 7.2 Historische BEV-Crank-Features — **P2 (B-08)**

| Feld | Wert |
|------|------|
| **Datei** | `battery-data-diagnostic.service.ts` |
| **Check** | `bev_with_ice_crank` |
| **Empfohlene Korrektur** | Repair `clear_crank_readiness_fields` |

---

## 8. Lead-Acid-Kurve bei Lithium/Unknown

### 8.1 Kanonischer LV-Assessment-Pfad — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/lv-assessment/lv-chemistry-assessment-context.policy.ts` |
| **Beweis** | `lv-chemistry-assessment-context.policy.spec.ts` — Lithium/Unknown: `chemicalSocEstimationAllowed=false`, `UNSUPPORTED` |
| **Empfohlene Korrektur** | — |

### 8.2 Legacy BatteryV2Service Lead-Acid-Scoring — **P1 (B-02) — behoben (Prompt 78)**

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/battery-v2.service.ts` |
| **Fix** | `resolveLeadAcidCurveAllowed()` via `resolveLvBatteryChemistry` + `isLeadAcidCurveApplicable`; `computeHealth(..., { leadAcidCurveAllowed })` → `insufficient_data` wenn Lithium/Unknown |
| **Fix** | Shared `estimateLeadAcidSocPercent()` aus `lv-assessment-thresholds.ts` statt inline `VOLTAGE_SOC` |
| **Tests** | `battery-v2.service.spec.ts` — Chemistry-Gate + insufficient_data für Nicht-Lead-Acid |
| **Status** | **behoben** |

---

## 9. LV Score als SOH

### 9.1 UI-Labeling — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-lv-semantics.ts`, `BatteryLvSummaryCard.tsx`, `battery-health-v2-surfaces.test.ts` |
| **Beweis** | Primärlabel „Geschätzter 12V-Batteriezustand“; Tests verbieten SOH-Wording auf LV |
| **Empfohlene Korrektur** | — |

### 9.2 Parallele Legacy-Evidence SOH_PERCENT — **P1 (B-01) — behoben (Prompt 78)**

| Feld | Wert |
|------|------|
| **Datei** | `battery-v2.service.ts`, `battery-v2-snapshot-ingestion.service.ts` |
| **Fix B-01a** | `onSnapshot()` führt **kein** `recomputeHealth()` mehr aus — nur Rest-Capture + `BatteryHealthService.recordSnapshot` |
| **Fix B-01b** | `recomputeHealth()` schreibt **keine** `batteryEvidence.recordMany` mit `SOH_PERCENT` mehr; `BatteryEvidenceService`-Dependency entfernt |
| **Fix B-01c** | Nach Rest-Capture: `BatteryV2SnapshotIngestionService.enqueueLvAssessmentRecompute()` → durable `BATTERY_ASSESSMENT_RECOMPUTE` Job |
| **Tests** | `battery-v2.service.spec.ts`, `battery-v2-snapshot-ingestion.service.spec.ts` |
| **Status** | **behoben** (kanonischer LV-Write-Pfad: `BatteryAssessmentService.recomputeLvEstimatedHealth`) |
| **Hinweis** | `recomputeHealth()` bleibt für expliziten Legacy-Crank-Pfad (`BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED=true`, Default OFF) |

### 9.3 API-Feldname `estimatedSohPct` — **P2 (B-03)**

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` |
| **Endpunkte** | `GET battery-health/v2` (L1488), `GET battery-health/latest` (L1433) |
| **Auswirkung** | Externe/ältere Konsumenten können semantisch falsches SOH annehmen |
| **Empfohlene Korrektur** | Feld als `estimatedLvHealthScore` aliasen; `estimatedSohPct` als deprecated markieren |

---

## 10. Alte Pairwise-HV-Kapazität

### 10.1 Policy + Default — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `hv-capacity-policy.ts`, `hv-battery-health.service.ts` L394–396, L664–666 |
| **Beweis** | `presentLegacyHvCapacity` → `LEGACY_UNVERIFIED`; operative SOH null; Tests grün |
| **Empfohlene Korrektur** | — |

---

## 11. SOH ohne verifizierte Referenz

### 11.1 HV SOH Gate — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/hv-capacity-shadow/hv-soh-gate.policy.ts` |
| **Codepfad** | L131: `verificationStatus !== VERIFIED` → kein operatives SOH-% |
| **Beweis** | `hv-soh-gate.policy.spec.ts` — `TESLA_AUDIT_UNVERIFIED_REFERENCE` |
| **Empfohlene Korrektur** | — |

---

## 12. Parallele Battery-APIs

### 12.1 Kanonische SSOT — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `canonical-battery-health.service.ts`, `battery-critical.detector.ts`, `rental-health.service.ts` |
| **Beweis** | Detector + Rental-Health lesen Canonical; `canonical`-Feld im Summary |
| **Empfohlene Korrektur** | — |

### 12.2 Compat-Endpunkte weiterhin aktiv — **P2 (B-03)**

| Endpunkt | Status | Hinweis |
|----------|--------|---------|
| `GET .../battery-health-summary` | **kanonisch** | SSOT |
| `GET .../battery-health-detail` | **kanonisch** | SSOT |
| `GET .../battery-health/latest` | Compat | `_canonical`-Hinweis + `canonical`-Feld |
| `GET .../battery-health/v2` | Compat | Legacy `BatteryV2Service`-Shape |
| `GET .../hv-battery-status` | Compat | Mapped aus Canonical |
| `GET .../battery-health` (list) | Legacy | Prüfen ob noch konsumiert |

**Empfohlene Korrektur:** Consumer-Migrations-Audit (`docs/architecture/battery-consumer-migration-audit.md`) abschließen; Compat-Routen terminieren.

### 12.3 Parallele LV-Scoring-Services — **P1 (B-01) — behoben (Prompt 78)**

| Service | Rolle nach Fix |
|---------|----------------|
| `BatteryV2Service` | Rest-Capture only (+ optional Legacy-Crank wenn Flag ON) |
| `BatteryAssessmentService` | **Kanonischer** LV-Assessment-Write via Queue |
| `LvCanonicalBatteryResolver` | Prioritäts-Resolver für UI/Readiness |

**Status:** Ein Write-Pfad für operative LV-Assessment — Legacy-Scoring nicht mehr aus Snapshot-Hook.

---

## 13. UI-Fehler zu null

### 13.1 Battery V2 Komponenten — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-ui-formatters.ts`, `BatteryHvDetailContent.tsx`, `BatteryLvSummaryCard.tsx` |
| **Beweis** | Null-Guards vor `toFixed`; E2E „API error surfaces retry“ |
| **Empfohlene Korrektur** | — |

### 13.2 HealthErrorsView Non-null-Assertions — **P2 (B-05)**

| Feld | Wert |
|------|------|
| **Datei** | `frontend/src/rental/components/HealthErrorsView.tsx` |
| **Codepfad** | L2040, L2045, L2048: `numericValue!.toFixed`, `crankingVoltage)!.toFixed` nach Null-Check |
| **Auswirkung** | Aktuell guarded; bei Refactoring leicht zu Runtime-Crash |
| **Empfohlene Korrektur** | Lokale Hilfsfunktion `formatV(value)` ohne `!` |

### 13.3 Vehicle Health Box Legacy-Score-Fallback — **P2 (B-04)**

| Feld | Wert |
|------|------|
| **Datei** | `frontend/src/rental/components/vehicle-detail/vehicle-health-box.mapper.ts` |
| **Codepfad** | L428–435: `legacyHealthScore` aus `healthPercent` / `publishedSohPct` / `sohPercent` |
| **Auswirkung** | Übersichts-Kachel kann Legacy-SOH-% statt kanonischem Bars-Score zeigen wenn Canonical-Score fehlt |
| **Empfohlene Korrektur** | Nur `resolveCanonicalEstimatedHealthScore(battery)`; Legacy-Fallback entfernen |

### 13.4 SOH-Trend-Chart für LV — **P2 (B-05)**

| Feld | Wert |
|------|------|
| **Datei** | `frontend/src/rental/components/HealthErrorsView.tsx` L3620–3631 |
| **Auswirkung** | Chart-Titel „SOH Trend“ / `name="SOH %"` für LV-Verlauf — semantisch irreführend |
| **Empfohlene Korrektur** | Label „12V-Zustand Trend“ / „Geschätzter Zustand %“ |

---

## 14. Shadow-Effekt auf Readiness

### 14.1 Readiness-Policy — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/battery-readiness.policy.ts` |
| **Codepfad** | L381–389: `restShadowSignal` / `hvCapacityShadowSignal` → `effect: READY`, kein Block |
| **Beweis** | `battery-readiness.policy.spec.ts`; Flag `BATTERY_V2_READINESS_ENABLED` Default **false** |
| **Empfohlene Korrektur** | — |

### 14.2 Shadow-Validation Safety — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `battery-shadow-validation.service.ts` |
| **Beweis** | `publicationBlocked: true`, `readinessBlocked: true`; Gate `safety_readiness_disabled` |
| **Empfohlene Korrektur** | — |

### 14.3 Alert/Task-Gates — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-alert.policy.ts` L127–128, `battery-task.policy.ts` `SHADOW_ONLY_GATE_REASONS` |
| **Beweis** | `LEGACY_UNVERIFIED`, `V2_SHADOW_DIAGNOSTIC` blockieren decision-capable Alerts |
| **Empfohlene Korrektur** | — |

---

## 15. Unzuverlässige Alerts/Tasks

### 15.1 Policy + Dedup — kein Problem

| Feld | Wert |
|------|------|
| **Dateien** | `battery-alert.policy.ts`, `battery-task.policy.ts`, `battery-critical.detector.ts` |
| **Beweis** | Semantische `dedupeKey`; Tests für Legacy-Unverified/Shadow; Detector liest Canonical |
| **Empfohlene Korrektur** | — |

### 15.2 Task-Materialisierung bei Summary-Fehler — **P2 (B-06)**

| Feld | Wert |
|------|------|
| **Datei** | `battery-task.service.ts` L137–139 |
| **Auswirkung** | Insight → Task kann ausfallen ohne Alert, wenn `getSummary` fehlschlägt |
| **Empfohlene Korrektur** | Retry oder Queue-Job `BATTERY_TASK_MATERIALIZE` |

---

## 16. Fehlende Queue-Retries

### 16.1 Retry-Policies — kein Problem

| Job-Typ | Attempts | Backoff |
|---------|----------|---------|
| `BATTERY_OBSERVATION_CLASSIFY` | 3 | exponential 5s |
| `BATTERY_REST_TARGET_EVALUATE` | 3 | exponential 5s |
| `BATTERY_START_PROXY_EXTRACT` | 3 | exponential 10s |
| `BATTERY_ASSESSMENT_RECOMPUTE` | 3 | exponential 5s |
| `BATTERY_PUBLICATION_UPDATE` | 3 | exponential 5s |
| `HV_RECHARGE_SESSION_RECONCILE` | 3 | exponential 5s |
| `HV_CAPABILITY_REFRESH` | 2 | fixed 15s |
| `HV_CAPACITY_SHADOW_RECOMPUTE` | 2 | fixed 10s |

**Beweis:** `battery-v2-job.retry-policy.ts`, `battery-v2-pipeline-hardening.spec.ts`, Dead-Letter-Tabelle `battery_v2_job_dead_letters`.

### 16.2 Niedrigere Attempts bei HV-Jobs — **P2**

| Feld | Wert |
|------|------|
| **Auswirkung** | `HV_CAPABILITY_REFRESH` / `HV_CAPACITY_SHADOW_RECOMPUTE` nur 2 Versuche — bei DIMO-Rate-Limits schneller Dead-Letter |
| **Empfohlene Korrektur** | Reconciliation-Scheduler prüft Dead-Letters (vorhanden in `battery-v2-reconciliation.service.ts`); Ops-Monitoring auf `synqdrive_battery_jobs_dead_letter_total` |

---

## 17. Fehlende Metriken

### 17.1 Prometheus-Abdeckung — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/modules/vehicle-intelligence/battery-health/observability/battery-v2-prometheus.metrics.ts` |
| **Beweis** | `battery-v2-prometheus.metrics.spec.ts` listet 15+ Counter inkl. Jobs, Rest, Start-Proxy, Assessments, Retention |
| **Empfohlene Korrektur** | — |

### 17.2 Legacy-Scoring-Pfad ohne dedizierte Metrik — **P2**

| Feld | Wert |
|------|------|
| **Auswirkung** | `BatteryV2Service.recomputeHealth` nicht separat instrumentiert (nur indirekt über Publications) |
| **Empfohlene Korrektur** | Counter `synqdrive_battery_legacy_v2_recompute_total` bis Pfad entfernt |

---

## 18. Riskante Retention

### 18.1 Safety Defaults — kein Problem

| Feld | Wert |
|------|------|
| **Datei** | `backend/src/config/battery-v2-retention.config.ts` |
| **Beweis** | `BATTERY_V2_RETENTION_ENABLED=false`, `DRY_RUN=true`; `qualifiedEvidence: 0` = nie löschen |
| **Empfohlene Korrektur** | — |

### 18.2 Storage-Wachstum bei aktivem Pruning — **P2 (B-10)**

| Feld | Wert |
|------|------|
| **Fenster** | HV Snapshots 365d, Measurements HV 1095d, Shadow Evidence 1095d |
| **Auswirkung** | Große EV-Flotten: signifikantes Postgres-Wachstum bis Aggregates/Prune laufen |
| **Empfohlene Korrektur** | Shadow-Report `storage_growth`; Retention erst nach Gate-Freigabe aktivieren |

---

## 19. Migrationen und Indizes

### 19.1 Kern-Indizes — kein Problem

| Migration | Indizes |
|-----------|---------|
| `20260716153000_battery_v2_measurements` | `tenant_idempotency_key`, `dedup_key`, `vehicle_id_observed_at` |
| `20260716170000_hv_snapshot_observation_dedup` | `(vehicle_id, idempotency_key)` UNIQUE |
| `20260716170000_battery_v2_job_dead_letters` | `(job_type, idempotency_key)` UNIQUE |
| `20260717120000_battery_v2_retention_aggregates` | Aggregate-Tabellen für sicheres Pruning |

### 19.2 Doppelter Migrations-Timestamp — **P2 (B-09)**

| Feld | Wert |
|------|------|
| **Ordner** | `20260716170000_battery_v2_job_dead_letters` und `20260716170000_hv_snapshot_observation_dedup` |
| **Auswirkung** | Prisma wendet alphabetisch an — beide additiv, aber undeploybare Reihenfolge bei Konflikten schwerer nachvollziehbar |
| **Empfohlene Korrektur** | Bei nächster Migration eindeutige Timestamps; Fresh-Deploy in CI verifizieren |

---

## 20. Tests und Builds

### 20.1 — kein Problem

Abdeckung und Verify-Skripte sind vorhanden und grün (siehe Evidenz-Tabelle oben).

| Bereich | Artefakt |
|---------|----------|
| Backend | `npm run test:battery:v2`, `test:battery:v2:integration`, `test:battery:v2:verify` |
| Frontend | `npm run test:battery:v2`, `test:battery:v2:e2e`, `test:battery:v2:verify` |
| Shadow | `battery-shadow-validation.policy.spec.ts` |
| Diagnostic | `battery-data-diagnostic.service.spec.ts` (13 Checks) |

**Lücke (P2):** Kein dedizierter Integrationstest für vollständigen `BatteryV2Service.onSnapshot` → Canonical-Summary-End-to-End mit Chemistry-Matrix (ICE/Lithium/BEV).

---

## Feature-Flag-Matrix (Default-Produktion)

| Flag | Default | Audit-Bewertung |
|------|---------|-----------------|
| `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED` | false | OK |
| `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED` | false | OK |
| `BATTERY_V2_REST_SHADOW_ENABLED` | false | OK |
| `BATTERY_V2_READINESS_ENABLED` | false | OK |
| `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` | prüfen Runbook | P2 wenn true ohne Segment-Coverage |
| `BATTERY_V2_RETENTION_ENABLED` | false | OK |

---

## Go/No-Go (manuell, nicht automatisch)

| Gate | Kriterium | Status |
|------|-----------|--------|
| Shadow-Mindestdauer | ≥ 28 Tage (`SHADOW_OBSERVATION_MIN_DAYS`) | **Ops** |
| P1-Funde | B-01, B-02 adressiert | **behoben** (Prompt 78) |
| Daten-Reparatur | `audit-battery-data` Dry-Run → Review → optional Apply | **Ops** (CLI auf VPS mit DB) |
| Readiness-Flag | Erst nach Shadow-Report `gates_ready_for_manual_review` | **Blockiert** |
| Publication | `publicationBlocked` in Shadow-Report | **Blockiert** |

---

## Prompt 78 — P1-Remediation (Implementierung)

| Fund | Änderung | Dateien |
|------|----------|---------|
| **B-01** | Rest-Capture entkoppelt von Legacy-Scoring; Assessment-Enqueue nach Capture | `battery-v2.service.ts`, `battery-v2-snapshot-ingestion.service.ts`, Specs |
| **B-02** | Chemistry-Gate + shared Lead-Acid-Kurve | `battery-v2.service.ts`, `battery-v2.service.spec.ts` |

**Signalfluss nach Fix:**

```mermaid
flowchart LR
  SNAP[Snapshot Poll] --> OBS[BATTERY_OBSERVATION_CLASSIFY]
  OBS --> CAP[BatteryV2Service.onSnapshot Rest-Capture]
  CAP -->|restCaptured| JOB[BATTERY_ASSESSMENT_RECOMPUTE]
  JOB --> ASM[BatteryAssessmentService.recomputeLvEstimatedHealth]
  ASM --> CAN[lv-canonical-battery.resolver / Canonical Summary]
```

---

## Finale Bewertung und Deployment

### Verdict: **READY_FOR_SHADOW_ONLY**

| Kriterium | Erfüllt |
|-----------|---------|
| Keine P0-Blocker | Ja |
| P1 behoben | Ja (B-01, B-02) |
| Tests/Builds grün | Ja (733 Backend + 78 Frontend + 11 E2E) |
| Shadow-Safety (`publicationBlocked`, `readinessBlocked`) | Ja |
| Readiness/Publication für Kunden | **Nein — weiter verboten** |

### Empfohlene Deployment-Reihenfolge

1. **Merge + VPS-Deploy** dieses Branches (Backend-only Änderungen, keine neue Migration)
2. **Flags unverändert lassen** (siehe Matrix) — insbesondere Readiness/Publication OFF
3. **Shadow-Validierung fortsetzen** — wöchentlicher `battery-shadow-validation-report.ts`
4. **Ops: `audit-battery-data.ts`** auf Staging/Prod-DB (Dry-Run only zuerst)
5. **Nach ≥28 Tagen Shadow + Gate-Review:** manuelles Go für `BATTERY_V2_READINESS_ENABLED` (nicht in diesem Release)
6. **Repair `--apply`** erst nach Dry-Run-Review und expliziter Ops-Freigabe

### Aktive Flags (Default — unverändert)

| Flag | Default | Shadow-Release |
|------|---------|----------------|
| `BATTERY_V2_READINESS_ENABLED` | **false** | Bleibt OFF |
| `BATTERY_V2_REST_SHADOW_ENABLED` | **false** | Optional Phase 2 — nicht in diesem Deploy |
| `BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED` | **false** | Bleibt OFF |
| `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED` | **false** | Bleibt OFF |
| `BATTERY_V2_RETENTION_ENABLED` | **false** | Bleibt OFF (`DRY_RUN=true`) |
| `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` | prüfen Runbook | Nur wenn Segments dauerhaft fehlen |

### Verbleibende Risiken

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| Historische `SOH_PERCENT`-Evidence / Wake-as-Rest in DB | Mittel | `audit-battery-data` → `repair-battery-data` (Dry-Run first) |
| Compat-API `estimatedSohPct` Semantik | Niedrig | Consumer-Migration; Canonical-Feld bevorzugen |
| Summary `.catch(() => null)` | Niedrig | P2 — transient vs. fehlend unterscheiden |
| Retention-Storage bei Aktivierung | Niedrig | Shadow-Report `storage_growth`; Pruning erst nach Gate |

### Noch verbotene Publications

- **Kein** `BATTERY_V2_READINESS_ENABLED=true` ohne manuelles Shadow-Go
- **Kein** automatisches Publication-Update für Kunden-Readiness
- **Kein** `repair-battery-data.ts --apply` ohne Dry-Run-Review
- **Kein** `BATTERY_V2_RETENTION_ENABLED=true` ohne Storage-Gate-Freigabe
- **Kein** `BATTERY_V2_HV_LEGACY_PAIRWISE_CAPACITY_ENABLED=true` in Produktion

---

## Änderungshistorie

| Version | Datum | Autor | Notiz |
|---------|-------|-------|-------|
| 1.0 | 2026-07-16 | Cloud Agent (Prompt 77/78) | Initialer Read-only-Abschlussaudit |
| 1.1 | 2026-07-16 | Cloud Agent (Prompt 78/78) | P1-Remediation B-01/B-02; Validierung; Verdict `READY_FOR_SHADOW_ONLY` |
| 1.2 | 2026-07-16 | Cloud Agent (Prompt 78/78) | P2-Remediation B-03–B-07/B-09/B-10; B-08 Ops-only; Deploy auf `main` |

---

**Changes / Architektur:** Aktualisiert (V4.9.577 P1 + V4.9.578 P2-Remediation).
