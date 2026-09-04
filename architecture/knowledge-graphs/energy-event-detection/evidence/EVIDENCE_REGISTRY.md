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
| EED-EV-0016 | ARCHITECTURE_DOC | P1.3-S5 | `P1_3_S5_ENERGY_REFUEL_SEMANTICS_2026-08-30.md` | Normative semantics record | Runtime enforcement alone | ARCHITECTURE_AUTHORITY | 2026-09-01 |
| EED-EV-0017 | ARCHITECTURE_DOC | Backfill policy | discovery doc + task decision | No fleet backfill required | Ops will never reprocess | PROVEN_HISTORICALLY | 2026-09-01 |
| EED-EV-0018 | TEST | KS MX fixture | `ks-mx-2024-aug28-refuel.fixture.ts` | Fixture encodes 4818s/685s/~280s band | Production observation | PROVEN_BY_TEST | 2026-09-01 |
| EED-EV-0019 | ARCHITECTURE_DOC | Boundary map (discovery) | `ATE_EED_BOUNDARY_MAP_2026-09-01.md` | Proposed 18 relations | Future-proof boundary | INFERENCE | 2026-09-01 |
| EED-EV-0020 | CODE | Metrics | `energy-events-metrics.service.ts` | Structured observability hooks | SLO thresholds defined | PROVEN_IN_CODE | 2026-09-01 |
| EED-EV-0021 | ARCHITECTURE_DOC | Provider budget | `DIMO_GLOBAL_PROVIDER_BUDGET.md` | Budget external to EED | Per-tenant limits | INFERENCE | 2026-09-01 |
| EED-EV-0022 | ARCHITECTURE_DOC | Battery V2 parallel path | `battery-v2/lifecycle/hv-charge-sessions.md` | HvChargeSession separate ingest | Auto-link to VehicleEnergyEvent | INFERENCE | 2026-09-01 |
| EED-EV-0023 | ARCHITECTURE_DOC | Discovery | `ENERGY_EVENT_DETECTION_DISCOVERY_2026-09-01.md` | Initial 52-component inventory | Verified without code re-check | INFERENCE | 2026-09-01 |
| EED-EV-0024 | TEST | Fuel rise spec | `refuel-fuel-rise.spec.ts` | KS MX sample band derivation | All vehicles' rise accuracy | PROVEN_BY_TEST | 2026-09-01 |
| EED-EV-0026 | TEST | KS MX 2024 — 2026-09-04 forensic replay | `refuel-sibling-reconciliation.sept04-2026.spec.ts` | Duplicate REFUEL arrival-order failure | HF dwell reconstruction | PROVEN_BY_TEST | 2026-09-04 |
| EED-EV-0031 | TEST | G1.2d late-sibling hardening | `physical-refuel-reconciliation.design.spec.ts` | Singleton late INSUFFICIENT sibling duplicate enrichment | G2 recovery path | PROVEN_BY_TEST | 2026-09-04 |
| EED-EV-0032 | TEST | G2.1 runtime wiring | `physical-refuel-reconciliation-runtime.service.spec.ts` | Feature-flagged reconcile + finality-gated enqueue | G2.2 shadow rollout | PROVEN_BY_TEST | 2026-09-04 |
| EED-EV-0033 | TEST | G2.1a runtime safety + liveness | `physical-refuel-reconciliation-runtime.service.spec.ts`, recovery scheduler | Legacy bypass closed; durable recovery; V2 fail-closed coords | G2.2 shadow rollout | PROVEN_BY_TEST | 2026-09-04 |
| EED-EV-0034 | TEST | G2.1b cross-cutover + recovery | `physical-refuel-g21b-*.spec.ts`, PG integration | V2-only candidates; observation enqueue; coordinate retry; PG lock proof | G2.2 shadow rollout | PROVEN_BY_TEST | 2026-09-04 |
| EED-EV-0035 | TEST | G2.1c final recovery semantics | `physical-refuel-g21c-final-recovery-semantics.spec.ts` | Queue-independent recovery; route epistemics; fingerprint invalidation; V2 stale enrichment | G2.2 shadow rollout | PROVEN_BY_TEST | 2026-09-04 |
| EED-EV-0025 | PRODUCTION | P1.3-S6 deploy | `P1_3_S6_PRODUCTION_DEPLOY_SINGLE_REPLICA_2026-08-30.md` | KS MX reprocess: 4818s, 330s rise, 685s deleted | Fleet-wide generalization | PROVEN_IN_PRODUCTION | 2026-09-01 |

## Negative results (first-class)

| ID | Finding | Evidence |
|----|---------|----------|
| NEG-EED-001 | KS MX ~80 min **not** caused by SynqDrive coalescing (single-segment pass-through) | EED-EV-0006, EED-EV-0018 |
| NEG-EED-002 | KS MX ~80 min **not** caused by parser expansion (preserved DIMO 4818s) | EED-EV-0004, EED-EV-0025 |
| NEG-EED-003 | RECHARGE rows **not** subject to REFUEL sibling deletion | EED-EV-0011, EED-INV-006 |

## Evidence maturity policy

- **PROVEN_IN_CODE** — verified in repository source at review SHA
- **PROVEN_BY_TEST** — unit/integration test asserts behavior (includes fixtures)
- **PROVEN_IN_PRODUCTION** — production deploy/ops artifact (not fixture alone)
- **PROVEN_HISTORICALLY** — documented product/ops decision
- **ARCHITECTURE_AUTHORITY** — normative architecture doc; cross-check code separately
- **INFERENCE** — discovery or cross-doc; not promoted to CONFIRMED node epistemic_status
- **UNVERIFIED** — must not appear as CONFIRMED operational fact
