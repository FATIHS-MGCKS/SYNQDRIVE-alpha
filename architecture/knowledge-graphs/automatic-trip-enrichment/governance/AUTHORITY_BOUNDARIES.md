# KG-ATE Authority Boundaries

**Purpose:** Zero silent ownership overlap. External graphs are referenced, not duplicated.

## Authority matrix

| Domain | Classification | Canonical owner | ATE may state | ATE must NOT state |
|--------|----------------|-----------------|---------------|-------------------|
| Post-finalize behavior enqueue | ATE_OWNS | KG-ATE | Enqueue timing, idempotency, status FSM | — |
| `runEnrichmentSync` pipeline | ATE_OWNS | KG-ATE | Stage order: behavior→route→misuse→DI enqueue | DI scoring rules |
| SMART5 HF detectors | ATE_OWNS | KG-ATE | HF path selection, skip thresholds | DIMO GraphQL schema |
| LTE_R1 native + abuse | ATE_OWNS | KG-ATE | Dual-path assessability | Native event taxonomy beyond ingestion |
| Route/safety enrich stage | ATE_OWNS | KG-ATE | Invoked after behavior COMPLETED | Mapbox routing algorithm |
| Misuse `evaluateTrip` trigger | ATE_OWNS | KG-ATE | Fire-and-forget scheduling | Misuse case business rules detail |
| Trip reconciliation repair | ATE_OWNS | KG-ATE | Window tiers, repair steps, mutex scope | Trip FSM transition rules (DecisionEngine) |
| `behaviorEnrichmentStatus` | ATE_OWNS | KG-ATE | State machine semantics | — |
| `detectEnergyEvents` invocation | ATE_REFERENCES_EXTERNAL | KG-EED | Step 5 MAY_TRIGGER in reconcileWindow | REFUEL/RECHARGE meaning |
| `durationSeconds` (energy) | OUT_OF_SCOPE | KG-EED | — | Any fuel/charge duration semantics |
| `fuelLevelRiseDurationSeconds` | OUT_OF_SCOPE | KG-EED | — | Rise algorithm or meaning |
| Energy sibling reconciliation | OUT_OF_SCOPE | KG-EED | — | Delete/merge rules for energy rows |
| Driving Intelligence V2 init | ATE_REFERENCES_EXTERNAL | KG-DI | Parallel post-finalize producer | V2 stage handlers, assessability policy |
| `trip.driving-impact.compute` scoring | ATE_REFERENCES_EXTERNAL | KG-DI | ATE enqueues job | TDI formula, stress classification |
| Scheduler leader election | SHARED_INFRASTRUCTURE | KG-Scaling-Process | ATE schedulers call shouldRun | Lease algorithm, Redis key format |
| Reconciliation execution mutex | SHARED_INFRASTRUCTURE | KG-Scaling-Process | Per-vehicle lock during reconcile | Lock TTL implementation detail |
| DIMO provider gateway/budget | SHARED_INFRASTRUCTURE | KG-Scaling-Process | Calls wrapped in request context | Budget algorithm, cooldown semantics |
| `DimoSegmentsService` | SHARED_INFRASTRUCTURE | DIMO module | HF/segment fetch usage | Full query catalog |
| Trip persistence / FSM | ATE_REFERENCES_EXTERNAL | TripDecisionEngine | Repairs go through engine | Direct DB trip mutation bypass |
| Telemetry ingestion (snapshots) | ATE_REFERENCES_EXTERNAL | DIMO snapshot pipeline | Orthogonal to enrichment queue | Snapshot poll cadence ownership |
| Battery V2 HV sessions | OUT_OF_SCOPE | Battery V2 KG | — | RECHARGE vs HV session mapping |
| UI timeline layout | AMBIGUOUS | Frontend rental trips UI | Trip detail surfaces reference enrichment status | Full timeline composition spans EED/DI cards — not fully modeled in KG-ATE |
| ClickHouse evidence mirror | OUT_OF_SCOPE | Analytics/telemetry | CH fallback in repair if used | CH adoption policy |

**AUTHORITY_CONFLICTS: 0** (explicit assignment; see `ATE-EV-0034`)

## Cross-graph contract

### KG-EED (Energy Event Detection)

```
ATE: MAY_TRIGGER detectEnergyEvents (reconciliation step 5)
EED: OWNS detection, persistence, REFUEL/RECHARGE semantics, sibling reconciliation
```

ATE graph nodes for energy: **only** `ATE-EXT-006` external authority reference + edge `MAY_TRIGGER`.

Forbidden in KG-ATE:

- REFUEL duration semantics
- RECHARGE duration semantics
- `fuelLevelRiseDurationSeconds` semantics
- Energy sibling reconciliation semantics

### KG-Driving-Intelligence

```
ATE: enqueues driving-impact; initializes V2 runs via TripPostFinalizeAnalysisProducer
DI:  OWNS scoring, assessability, V2 job handlers, TDI computation
```

### KG-Scaling-Process

```
ATE: uses leader guard, reconciliation mutex, provider budget
Scaling Process: OWNS algorithms, limits, multi-replica deployment gates
```

Reference: `architecture/scaling-process/`

### Battery V2

Orthogonal unless explicit future link decision. RECHARGE timeline vs HV charge session split remains Battery V2 + EED concern.

## External authority nodes (graph)

| Node ID | Authority |
|---------|-----------|
| ATE-EXT-001 | SchedulerLeaderGuardService |
| ATE-EXT-002 | ReconciliationExecutionMutexService |
| ATE-EXT-003 | DIMO Provider Gateway / Budget |
| ATE-EXT-004 | runWithDimoRequestContext |
| ATE-EXT-005 | DimoSegmentsService |
| ATE-EXT-006 | KG-EED |
| ATE-EXT-007 | KG-Driving-Intelligence |

## Discovery boundary map

Full cross-graph relations (18): `architecture/knowledge-graphs/discovery/ATE_EED_BOUNDARY_MAP_2026-09-01.md`  
Canonical EED graph: **not yet created** (Phase 2B+).
