# KG-ATE ↔ KG-EED Boundary Map

**Date:** 2026-09-01  
**Status:** DISCOVERY ONLY  
**Purpose:** Strict authority separation for canonical knowledge graphs.

---

## Part D — Cross-graph relations

| CROSS_GRAPH_RELATION_ID | FROM_GRAPH | FROM_NODE | RELATION | TO_GRAPH | TO_NODE | AUTHORITY_OWNER | NOTES |
|-------------------------|------------|-----------|----------|----------|---------|-----------------|-------|
| XG-001 | ATE | ATE-N13 `reconcileWindow` step 5 | MAY_TRIGGER | EED | EED-N-RF-01 detect | **EED** | ATE documents invocation only |
| XG-002 | ATE | ATE-N13 | MAY_CONSUME | EED | EED-N-RF-09 API rows | **EED** | Timeline reads energy events |
| XG-003 | EED | EED-N-RF-10 UI card | MAY_ATTACH_TO | ATE | trips-timeline aggregate | **ATE** (timeline shell) | EED owns card semantics |
| XG-004 | ATE | TripPostFinalizeAnalysisProducer | PARALLEL_TO | EED | — | **ATE** (DI V2) | No energy coupling |
| XG-005 | ATE | `fetchTripSegments` | MUST_NOT_INTERPRET_AS | EED | refuel segments | **EED** | Repair segments ≠ energy segments |
| XG-006 | EED | `durationSeconds` REFUEL | MUST_NOT_INTERPRET_AS | ATE | trip duration | **EED** | Trip wall-clock ≠ fuel envelope |
| XG-007 | ATE | Scheduler leader | GUARDED_BY | EED | indirect detect cadence | **ATE** (infra) | EED inherits schedule via reconcile |
| XG-008 | ATE | Reconciliation mutex | LOCKED_BY | EED | detect in same window | **ATE** (infra) | Prevents concurrent reconcile+detect races |
| XG-009 | SHARED | DimoProviderBudget | BUDGETED_BY | ATE + EED | all DIMO fetches | **P1.3 Platform** | Neither graph owns budget algorithm |
| XG-010 | EED | `fuelLevelRiseDurationSeconds` | MUST_NOT_INTERPRET_AS | ATE | enrichment duration | **EED** | Orthogonal concepts |
| XG-011 | ATE | `behaviorEnrichmentStatus` | INDEPENDENT_OF | EED | energy row presence | split | Trip can enrich without energy |
| XG-012 | EED | RECHARGE `durationSeconds` | MUST_NOT_INTERPRET_AS | EED | REFUEL rise fields | **EED** | Kind-specific semantics |
| XG-013 | ATE | `useTripEnrichment` route manual | MUST_NOT_TRIGGER | EED | energy detect | **EED** | Route enrich ≠ energy |
| XG-014 | EED | KS MX case | PROVEN_BY | SHARED | production DB + DIMO | **EED** | ATE cites as external evidence only |
| XG-015 | ATE | `enqueueRepairEnrichment` | MAY_TRIGGER | EED | detect on repair window | **EED** | Same step 5 on repair path |
| XG-016 | EED | sibling reconciliation | MUST_NOT_DELETE | ATE | trips | **EED** | REFUEL rows only |
| XG-017 | ATE | Driving Intelligence V2 | CONSUMES_PARALLEL | EED | — | **Driving Intelligence** | Separate KG authority |
| XG-018 | EED | Battery V2 HV sessions | DEPENDS_ON | EXTERNAL | HvChargeSession | **Battery V2** | No merge without explicit link decision |

### Forbidden authority duplication

| Topic | Canonical owner | Other graph may only… |
|-------|-----------------|----------------------|
| REFUEL `durationSeconds` meaning | **EED** | ATE: “energy step runs here” |
| `fuelLevelRise*` semantics | **EED** | — |
| RECHARGE duration meaning | **EED** | — |
| Sibling reconciliation rules | **EED** | — |
| Scheduler cadence / leader | **ATE** | EED: “detect runs when reconcile runs” |
| Trip enrichment state machine | **ATE** | — |
| Reconciliation mutex scope | **ATE** | — |
| DIMO global budget | **P1.3 Platform** | Both: dependency + invariants |
| Trip timeline layout | **ATE** (shell) | EED: energy card content |

---

## Part E — Shared external authorities

| AUTHORITY_NAME | USED_BY_ATE | USED_BY_EED | ATE_MAY_STATE | EED_MAY_STATE | CROSS_REF | DO_NOT_DUPLICATE |
|----------------|-------------|-------------|---------------|---------------|-----------|----------------|
| **Scheduler Leader Election** | YES | indirect | Leader gating on reconcile schedulers | “Detect runs under leader-gated reconcile” | `scheduler-leader/` | Lease algorithm, Redis keys |
| **Reconciliation Execution Mutex** | YES | YES (same call stack) | Per-vehicle lock during reconcile | “Detect inside mutex scope” | `reconciliation-execution-mutex/` | Lock TTL, key format |
| **DIMO Provider Gateway / Budget** | YES | YES | Reconcile fetches use gateway | Energy fetches use gateway | `P1_3_GLOBAL_DIMO_*` | Rate limiter internals |
| **DimoSegmentsService** | YES (HF, segments repair) | YES (energy, fuel samples) | HF + repair segment fetch | Energy + fuel sample fetch | `dimo-segments.service.ts` | Query builders per domain |
| **BullMQ platform** | YES | NO (today) | Queue names, job IDs | Future scheduler only | `queue-names.ts` | Generic Bull semantics |
| **Driving Intelligence V2** | YES (parallel) | NO | Post-finalize V2 init | — | `driving-intelligence-v2.md` | Scoring models |
| **Battery V2 / HV Charge** | NO | partial overlap | — | RECHARGE timeline vs HV session split | `architecture/battery-v2/` | Session lifecycle |
| **Route V2** | YES (`TripsService.enrichTrip`) | NO | Route enrichment stage | — | trips module | Mapbox routing |
| **Redis DB0** | YES | YES | Locks, leader, budget, bull | Same | ops docs | Namespace inventory |
| **Prisma / Postgres** | YES | YES | `VehicleTrip`, repairs | `VehicleEnergyEvent` | schema | ORM patterns |
| **Scale-to-2 / P1.8** | YES | indirect | Soak gate, replica count | Benefits from migrated schema | staging validation docs | Scale decision |

---

## Authority conflicts found

| ID | Conflict | Resolution |
|----|----------|------------|
| — | None requiring merge | Graphs remain separate; boundaries above |

**COUNT: 0 unresolved authority conflicts** (by explicit ownership assignment).

---

## Relation count

**CROSS_GRAPH_RELATIONS: 18**
