# KG-EED Evidence Registry

Stable IDs: `EED-EV-####`. Each item: source, path, what it proves, what it does NOT prove, maturity, last verified.

| ID | Class | Source | Path / locator | Proves | Does NOT prove | Maturity | Verified |
|----|-------|--------|----------------|--------|----------------|----------|----------|
| EED-EV-0001 | CODE | Reconciliation step 5 | `trip-reconciliation.service.ts` | ATE MAY_TRIGGER detectEnergyEvents; isolated failure | EED semantic ownership | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0002 | CODE | EnergyEventsService | `energy-events.service.ts` | Full detect pipeline order; upsert idempotency | Production fleet coverage | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0003 | CODE | Mechanism isolation | `dimo-segments.service.ts` | Per-mechanism outcomes; partial failure OK | DIMO SLA | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0004 | CODE | Parser | `parse-energy-event-segment.ts` | posDelta MIN/MAX; preserves durationSeconds | Physical pump duration | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0005 | CODE | Persist gate | `energy-events.pipeline.ts` | REFUEL >1L; RECHARGE soc≥1 or energy>0 | Optimal threshold tuning | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0006 | CODE | Coalesce | `energy-events.pipeline.ts` | 300s/1800s/250m; single-segment pass-through | KS MX caused by coalesce | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0007 | CODE | Fuel samples | `dimo-segments.service.ts` | 30s interval fetch in window | CH long-term mirror | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0008 | CODE | Fuel rise derive | `refuel-fuel-rise.ts` | ≥3 samples; conservative null | Nozzle duration | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0009 | CODE | RECHARGE path | `dimo-recharge-segments.client.ts` | Default detector; 31d chunking | HV session linkage | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0010 | CODE | DTO | `energy-events.types.ts` | durationSeconds envelope comment | Client adoption of rise fields | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0011 | TEST | Sibling reconcile | `refuel-sibling-reconciliation.spec.ts` | KS MX 685s superseded; token guard | Fleet-wide sibling inventory | PROVEN_BY_TEST | 2026-09-01 |
| EED-EV-0012 | TEST | Idempotency | `energy-events.service.spec.ts` | Re-run updates not duplicates | Multi-replica race | PROVEN_BY_TEST | 2026-09-01 |
| EED-EV-0013 | CODE | Detector config | `dimo-energy-detector.config.ts` | minIncreasePercent 5 production | All OEM sensitivities | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0014 | CODE | Prisma schema | `schema.prisma` | VehicleEnergyEvent shape; unique dimoSegmentId | Migration rollback safety | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0015 | CODE | UI semantics | `trip-timeline-shared.tsx` | REFUEL rise vs RECHARGE duration split | All locale strings | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0016 | ARCHITECTURE_DOC | P1.3-S5 | `P1_3_S5_ENERGY_REFUEL_SEMANTICS_2026-08-30.md` | Canonical semantics authority | Automated enforcement | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0017 | ARCHITECTURE_DOC | Backfill policy | discovery doc + task decision | No fleet backfill required | Ops will never reprocess | PROVEN_HISTORICALLY | 2026-09-01 |
| EED-EV-0018 | INCIDENT | KS MX fixture | `ks-mx-2024-aug28-refuel.fixture.ts` | 4818s envelope; ~280s rise | Pump duration | PROVEN_IN_PRODUCTION | 2026-09-01 |
| EED-EV-0019 | ARCHITECTURE_DOC | Boundary map | `ATE_EED_BOUNDARY_MAP_2026-09-01.md` | 18 relations; 0 conflicts | Future boundary changes | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0020 | CODE | Metrics | `energy-events-metrics.service.ts` | Structured observability hooks | SLO thresholds defined | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0021 | ARCHITECTURE_DOC | Provider budget | `DIMO_GLOBAL_PROVIDER_BUDGET.md` | Budget external to EED | Per-tenant limits | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0022 | ARCHITECTURE_DOC | Battery V2 | `architecture/battery-v2/` | RECHARGE vs HV session split | Future link decision | INFERENCE | 2026-09-01 |
| EED-EV-0023 | ARCHITECTURE_DOC | Discovery | `ENERGY_EVENT_DETECTION_DISCOVERY_2026-09-01.md` | Initial 52-component inventory | Verified without code re-check | INFERENCE | 2026-09-01 |
| EED-EV-0024 | TEST | Fuel rise spec | `refuel-fuel-rise.spec.ts` | KS MX sample band derivation | All vehicles' rise accuracy | PROVEN_BY_TEST | 2026-09-01 |

## Negative results (first-class)

| ID | Finding | Evidence |
|----|---------|----------|
| NEG-EED-001 | KS MX ~80 min **not** caused by SynqDrive coalescing (single-segment pass-through) | EED-EV-0006, EED-EV-0018 |
| NEG-EED-002 | KS MX ~80 min **not** caused by parser expansion (preserved DIMO 4818s) | EED-EV-0004, EED-EV-0018 |
| NEG-EED-003 | RECHARGE rows **not** subject to REFUEL sibling deletion | EED-EV-0011, EED-INV-006 |

## Evidence maturity policy

- **PROVEN_IN_CODE** — verified in repository source at canonicalization SHA
- **PROVEN_BY_TEST** — unit/integration test asserts behavior
- **PROVEN_IN_PRODUCTION** — production DB/ops evidence (KS MX)
- **PROVEN_HISTORICALLY** — documented product/ops decision
- **INFERENCE** — discovery or cross-doc; not promoted to invariant without code/test
- **UNVERIFIED** — must not appear as canonical fact in nodes with CONFIRMED epistemic_status
