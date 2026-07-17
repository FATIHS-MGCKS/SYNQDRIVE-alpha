# Brake Health Post-Remediation Readiness — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `brake-health-post-remediation-readiness-2026-07` |
| **Pre-remediation audit** | `docs/audits/brake-health-production-readiness-2026-07.md` (`NOT_READY`) |
| **Implementation branch** | `fix/brake-health-production-readiness-2026-07` |
| **Implementation head (pre-P26 commit)** | `f11a70c5` |
| **Remediation prompts** | 26 of 26 (code + docs) |
| **Production data modified** | **No** — agent environment had no `DATABASE_URL` |
| **Staging validation** | **NOT EXECUTED** — operator-required on DB copy |
| **Completed** | 2026-07-17 UTC |

---

## Executive summary

The 25-prompt code remediation series addresses the architectural and lifecycle defects identified in the July 2026 production-readiness audit. Unit, integration, concurrency, and regression-matrix tests pass locally. **No controlled staging apply, shadow replay, or fleet backfill was executed** in the agent environment.

**Technically repaired ≠ empirically validated.** Ground-truth measurements remain at zero; backtest reports **`NOT_ENOUGH_DATA`**.

### Final production-readiness verdict

| Scope | Verdict |
|-------|---------|
| **Overall (go-live)** | **`SHADOW_ONLY`** |
| Code correctness (post-remediation) | **`CONDITIONALLY_READY`** |
| Model validity / backtest | **`NOT_ENOUGH_DATA`** |
| Fleet operational readiness | **`NOT_READY`** (0 initialized BHC at audit; staging apply pending) |

**Recommended next step:** Execute [`brake-health-production-rollout.md`](../runbooks/brake-health-production-rollout.md) on staging DB copy → shadow replay → pilot measurement campaign → re-assess.

---

## Dimension ratings (post-remediation)

| Dimension | Pre-audit | Post-remediation | Notes |
|-----------|-----------|------------------|-------|
| **A — Correctness** | NOT_READY | **CONDITIONALLY_READY** | Scoped lifecycle, gap policy, thresholds fixed in code; fleet not materialized |
| **B — Lifecycle Integrity** | NOT_READY | **CONDITIONALLY_READY** | Component installations, atomic service, scope matrix; staging replay pending |
| **C — Reference Spec Quality** | CONDITIONALLY_READY | **CONDITIONALLY_READY** | Provenance + rotor-width guard; operator confirmation still required |
| **D — Evidence Quality** | NOT_READY | **CONDITIONALLY_READY** | DTC producer, dedupe, freshness; no fleet evidence rows yet |
| **E — Model Validity** | NOT_ENOUGH_DATA | **NOT_ENOUGH_DATA** | 0 GT measurements; `calibrateFromMeasurement` not implemented for brakes |
| **F — Safety** | NOT_READY | **CONDITIONALLY_READY** | DTC evidence + rental separation; shadow mode required before hard blocks |
| **G — Reliability** | NOT_READY | **CONDITIONALLY_READY** | Recalc orchestrator, queue dedupe, fingerprint idempotency |
| **H — Observability** | NOT_READY | **READY** | 22 `synqdrive_brake_*` metrics + Prometheus alerts |
| **I — User Experience** | CONDITIONALLY_READY | **CONDITIONALLY_READY** | Honest MEASURED/ESTIMATED UI; shadow labels documented |
| **J — DIMO Readiness** | NOT_READY | **CONDITIONALLY_READY** | Native event intake + ledger; `chassisBrake*` still unavailable on LTE_R1 |
| **K — Test Readiness** | CONDITIONALLY_READY | **READY** | TC01–TC42 regression matrix + 558 backend brake/rental tests |

---

## Local validation (Prompt 26 — agent environment)

| Gate | Result |
|------|--------|
| `npm run prisma:validate` | ✅ Pass (1 `onDelete SetNull` warning) |
| Backend `npm run build` | ✅ Pass |
| Frontend `npm run build` | ✅ Pass |
| Backend brake + rental tests | ✅ **51 suites, 558 passed** |
| Frontend brake tests | ✅ **16 passed** (`brake-health-canonical`, `brake-health-evidence-ui`) |
| Baseline audit `--fixtures-only` | ✅ Pass (fixture fleet classified) |
| Staging migrate deploy | ⛔ **NOT EXECUTED** (no `DATABASE_URL`) |
| Staging shadow replay | ⛔ **NOT EXECUTED** |
| Production deploy | ⛔ **NOT EXECUTED** |

---

## Staging checklist (operator — NOT EXECUTED)

| Teil | Step | Status |
|------|------|--------|
| **1 — Migration** | DB backup / snapshot | NOT_EXECUTED |
| | `prisma migrate status` | NOT_EXECUTED |
| | `migrate deploy` + `prisma generate` | NOT_EXECUTED |
| | Backend / worker / frontend deploy | NOT_EXECUTED |
| | Queue / worker health | NOT_EXECUTED |
| | Feature flags / shadow mode | NOT_EXECUTED |
| **2 — Read-only audits** | Baseline candidate audit | Fixtures only |
| | Component installation audit | NOT_EXECUTED |
| | Service scope audit | NOT_EXECUTED (0 prod events at pre-audit) |
| | TDI coverage audit | NOT_EXECUTED |
| | DIMO event coverage audit | NOT_EXECUTED |
| | Evidence integrity audit | NOT_EXECUTED |
| | Duplicate alert audit | NOT_EXECUTED |
| | Recalculation fingerprint audit | NOT_EXECUTED |
| **3 — Controlled apply** | Safe baseline backfill batches | NOT_EXECUTED |
| | `BrakeHealthCurrent` materialization | NOT_EXECUTED |
| | TDI backfill | NOT_EXECUTED |
| | DIMO event ingest + ledger | NOT_EXECUTED |
| | Recalculation batches | NOT_EXECUTED |
| | Alerts + rental health re-eval | NOT_EXECUTED |
| **4 — Shadow mode** | 60-day trip replay | NOT_EXECUTED |
| | Legacy comparison log | NOT_EXECUTED |
| **5 — Negativ/replay tests** | TC01–TC42 on staging DB | Unit tests only |
| **7 — Backtest** | As-of backtest with GT | **NOT_ENOUGH_DATA** |

---

## Read-only pre-audit documentation (fixture baseline)

Fixture run (`audit-brake-health-baseline-candidates.ts --fixtures-only`) — **not production fleet**:

| Metric | Value |
|--------|-------|
| Vehicles in fixture set | 8 |
| Auto-applicable components | 5 |
| Manual review components | 8 |
| Spec-only components | 6 |
| Conflicting components | 1 |
| No safe baseline components | 27 |
| Vehicles with pending legacy BRAKE jobs | 1 |

**Pre-audit VPS fleet (2026-07-17, 6 vehicles):**

| Metric | Value |
|--------|-------|
| `BrakeHealthCurrent` initialized | 0 / 6 |
| Reference specs | 5 |
| `trip_driving_impact` (60d) | 355 |
| Trips without TDI (60d) | 223 (38.5%) |
| TDI trip-km mismatches | 135 |
| `brake_evidence` rows | 0 |
| `BRAKE_SERVICE` events | 0 |
| Active DTC (brake-related path) | 1 (not in evidence pre-fix) |
| DIMO `chassisBrake*` on LTE_R1 | 0 / 6 |

---

## P0 finding remediation status

| ID | Title | Code status | Fleet / staging |
|----|-------|-------------|-----------------|
| P0-BH-01 | Zero initialized BHC | Backfill + registration init implemented | **OPEN** — apply on staging |
| P0-BH-02 | Spec without init | Registration materializes BHC | **OPEN** — backfill pending |
| P0-BH-03 | Orphan BRAKE enrichment jobs | Producer removed; diagnostics added | **RESOLVED** (code) |
| P0-BH-04 | k-factor calibration | **Not implemented** for brakes | **OPEN** |
| P0-BH-05 | `harshBrakeWearMultiplier` | Stepped hard-brake rate + ledger; multiplier **not stacked** (documented) | **ACCEPTED_DEVIATION** |
| P0-BH-06 | DTC → BrakeEvidence | `BrakeDtcEvidenceProducerService` | **RESOLVED** (code) |
| P0-BH-09 | No component identity | `BrakeComponentInstallation` | **RESOLVED** |
| P0-BH-10 | Service scope ignored | Scope matrix + atomic apply | **RESOLVED** |
| P0-BH-11 | Spec fills all components | Scoped anchors only | **RESOLVED** |
| P0-BH-14 | Rotor width as disc anchor | Spec provenance + eligibility guard | **RESOLVED** |
| P0-BH-40 | TDI no-op without init | Init path fixed; recalc orchestrator | **OPEN** until fleet init |

**Remaining P0 (code):** 1 (`P0-BH-04` calibration runtime)  
**Remaining P0 (operational):** 3 (`P0-BH-01`, `P0-BH-02`, `P0-BH-40` until supervised backfill)  
**Accepted deviation:** 1 (`P0-BH-05` — canonical formula uses hard-brake rate, not separate multiplier)

---

## P1 finding remediation status (selected)

| ID | Title | Status |
|----|-------|--------|
| P1-BH-38 | Rolling gap temporal leakage | **RESOLVED** — `brake-coverage-gap.domain.ts` |
| P1-BH-41 | Trips without TDI | **PARTIAL** — authoritative TDI + backfill tooling; fleet gap remains |
| P1-BH-42 | TDI km mismatches | **PARTIAL** — fingerprint + distance policy; re-backfill needed |
| P1-BH-45 | VDI hard_brake=0 despite events | **RESOLVED** — ledger + DIMO intake |
| P1-BH-46 | DIMO braking events not ingested | **RESOLVED** — `DimoBrakingEventIntakeService` |
| P1-BH-47 | `chassisBrake*` unavailable LTE_R1 | **OPEN** — hardware/provider limitation |
| P1-BH-50 | Spec-only → HIGH confidence | **RESOLVED** — confidence caps + honest UI |
| P1-BH-52 | `hasAlert` dual semantics | **RESOLVED** — unified alert taxonomy |
| P1-BH-53 | COVERAGE_GAP not in openAlerts | **RESOLVED** |
| P1-BH-54 | No Prometheus brake metrics | **RESOLVED** — 22 metrics + alerts |

**Estimated remaining P1:** ~8 (mostly data-quality / fleet-apply / DIMO signal availability)

---

## P2 / P3

| Severity | Pre-audit | Estimated remaining |
|----------|-----------|---------------------|
| P2 | 7 | ~5 (documentation, legacy cleanup, ClickHouse) |
| P3 | 0 | 0 |

Full re-audit on staging DB copy required for authoritative remaining counts.

---

## Shadow mode assessment

| Criterion | Status |
|-----------|--------|
| Recalculation runs and persists snapshots | Code ready; **not replayed on staging** |
| No hard block from estimated wear only | `MEASUREMENT_REQUIRED` policy in rental health |
| Safety DTCs may act per policy | DTC evidence producer wired |
| UI shows ESTIMATED / not validated | `BrakeEvidencePanel` + presentation layer |
| Legacy comparison protocol | Defined in rollout runbook; **not executed** |

**Shadow replay scope (required on staging):**

- All available 60-day trips
- Known service registrations
- DIMO braking events
- DTC active/cleared history

---

## Backtest (Teil 7)

Source: `docs/audits/data/brake-health-backtest-summary-2026-07.csv` (pre-remediation fleet, unchanged)

| Component | n | MAE | RMSE | Bias | Median | P90 | ±0.5 mm | ±1.0 mm | Condition accuracy | Calibration |
|-----------|---|-----|------|------|--------|-----|---------|---------|-------------------|-------------|
| Front Pads | — | — | — | — | — | — | — | — | — | **NOT_ENOUGH_DATA** |
| Rear Pads | — | — | — | — | — | — | — | — | — | **NOT_ENOUGH_DATA** |
| Front Discs | — | — | — | — | — | — | — | — | — | **NOT_ENOUGH_DATA** |
| Rear Discs | — | — | — | — | — | — | — | — | — | **NOT_ENOUGH_DATA** |

`ground_truth_measurements=0`; `calibrateFromMeasurement` not implemented for brakes.

**No model validation claims.**

---

## Migrations (brake remediation)

| Migration | Purpose |
|-----------|---------|
| `20260717140000_brake_component_installation_lifecycle` | Component installations |
| `20260717150000_brake_service_application_atomic` | Atomic service apply + outbox |
| `20260717160000_brake_reference_spec_provenance` | Spec provenance semantics |
| `20260717170000_brake_wear_thresholds` | Per-component minimums |
| `20260717180000_trip_driving_impact_authoritative_coverage` | Authoritative TDI |
| `20260717190000_dimo_braking_event_intake` | DIMO event intake |
| `20260717200000_braking_event_ledger` | Canonical event ledger |
| `20260717210000_brake_coverage_gap_policy` | Gap / overcoverage fields |
| `20260717220000_brake_recalculation_orchestrator` | Recalc queue + audit |
| `20260717230000_brake_health_snapshots` | Versioned snapshots |
| `20260717240000_brake_dtc_evidence` | DTC evidence linkage |
| `20260717250000_brake_evidence_lifecycle` | Evidence freshness / dedupe |
| `20260717260000_brake_health_alerts` | Structured alerts |
| `20260717270000_brake_rental_health` | Rental health review |

---

## Final acceptance criteria

| Criterion | Status |
|-----------|--------|
| Registration materializes brake health | ✅ Code |
| Partial service affects only scoped components | ✅ Code + TC05–TC11 |
| Service / evidence / health atomic | ✅ `BrakeServiceApplicationService` |
| Spec is not measurement | ✅ Provenance + UI |
| Component-specific minimum thickness | ✅ `brake-wear-threshold.domain.ts` |
| TDI coverage traceable | ✅ Authoritative TDI + gap policy |
| DIMO events ingested + deduped | ✅ Intake + ledger |
| No temporal leakage | ✅ Gap policy + as-of replay |
| Recalculations idempotent | ✅ Fingerprint + queue dedupe |
| Predictions versioned | ✅ Snapshots `brake-wear-v2` |
| DTC evidence active + resolvable | ✅ Producer + clearance |
| Alerts separated (wear / safety / data quality) | ✅ Alert taxonomy |
| Rental blocking evidence-safe | ✅ `BrakeRentalHealthReviewService` |
| Legacy consumers removed | ✅ Canonical migration |
| UI honest | ✅ `BrakeEvidencePanel` |
| Tests and builds green | ✅ Local validation |
| Staging shadow replay successful | ⛔ **NOT EXECUTED** |
| 0 remaining P0 findings | ⛔ **3 operational + 1 code P0** |
| Model validation not overstated | ✅ `NOT_ENOUGH_DATA` |

---

## Related documents

| Document | Path |
|----------|------|
| Pre-remediation audit | `docs/audits/brake-health-production-readiness-2026-07.md` |
| Implementation log | `docs/implementation/brake-health-production-readiness-remediation-2026-07.md` |
| Production rollout runbook | `docs/runbooks/brake-health-production-rollout.md` |
| Measurement campaign | `docs/runbooks/brake-health-measurement-campaign.md` |
| Baseline backfill runbook | `docs/runbooks/brake-health-component-baseline-backfill.md` |
| Findings register (pre-remediation) | `docs/audits/data/brake-health-integrity-findings-2026-07.json` |

---

## Sign-off

| Role | Verdict | Date |
|------|---------|------|
| Code remediation (Prompts 1–25) | Complete @ `f11a70c5` | 2026-07-17 |
| Staging / production validation (Prompt 26) | **Pending operator** | — |
| Production go-live | **`SHADOW_ONLY`** until staging + measurement campaign | — |
