# Battery V2 — Knowledge Graph (Human View)

**Bootstrap date:** 2026-09-01  
Machine-readable source: [graph/nodes.yaml](./graph/nodes.yaml), [graph/edges.yaml](./graph/edges.yaml)

## Major chain (partially reconstructed)

```
[Authoritative trip finalization]
        │  BAT-V2-AUTH-TRIP-END-001
        ▼
[trip.endTime anchor]
        │  gates
        ▼
[LV Rest Window session arming]  ←── reconciliation self-heal
        │  BAT-V2-JOB-LV-SESSION-OPEN-001
        ▼
[REST_60M / REST_6H target schedule]
        │  metadata ENQUEUED + Bull job
        ▼
[LIVE_VOLTAGE observations in target window]
        │  BAT-V2-AUTH-LV-MEASURE-001 (conservative quality)
        ▼
[BATTERY_REST_TARGET_EVALUATE]
        │  PENDING_EVALUATION if retryable missing evidence
        ▼
[BatteryMeasurement]  ── BAT-V2-POL-NO-FABRICATE-001
        │
        ▼
[Assessment / publication / read model]  ← NOT YET RECONSTRUCTED
```

## Opening vs measurement (parallel authorities)

```
                    ┌── BAT-V2-AUTH-LV-OPEN-001 (opening gate)
[DIMO / latest state] ──┤     isEngineOffForRestWindowOpening
                    └── BAT-V2-AUTH-LV-MEASURE-001 (measurement quality)
                          isEngineOffForRest
```

These are **intentionally different**. Production ICE trip `61715ecd` motivated the split (#1393).

## Liveness subgraph (REST targets)

```
[Target metadata status]
        │
        ├─ ENQUEUED ──► hasLiveJob()? ──no──► PENDING_EVALUATION ──► recovery schedule
        │                    │
        │                   yes → keep ENQUEUED (skip reconcile)
        │
        ├─ PENDING_EVALUATION ──► reconciliation reschedule (cadence)
        │
        └─ terminal (COMPLETED|MISSED|FAILED|CANCELLED) → stop
```

**Key invariant:** metadata `ENQUEUED` alone is **not** proof of queue liveness (`BAT-V2-LIVE-ORPHAN-ENQ-001`).

## Session opening convergence (not four independent creators)

| Entry path | Converges on |
|------------|--------------|
| Trip finalization enqueue | `LvRestWindowSessionArmingService.ensureLvRestWindowForFinalizedTrip()` |
| Reconciliation missing session | same arming operation (+ recovery enqueue fallback) |
| Observation bridge | delegates to arming when finalized trip matches anchor |
| `BATTERY_LV_REST_SESSION_OPEN` handler | FSM via existing session machinery |

Do **not** model these as four parallel session-creation implementations.

## Decision lineage (seeded)

```
BAT-V2-EVID-PROD-61715ECD-001
    └── supports ──► BAT-V2-DEC-1393-001 (ICE opening hardening)

BAT-V2-EVID-PROD-EA7696B6-001
    └── supports ──► BAT-V2-DEC-1383-001 (observation-independent opening)

BAT-V2-EVID-PROD-4D2BEF5F-001 + tests
    └── supports ──► BAT-V2-DEC-1445-001 (Stage 1 pipeline defect closure)
```

## Not yet reconstructed

- Full HV recharge / PHEV authority chain
- Publication and readiness consumer mapping
- Complete legacy `battery_features` → canonical migration story
- All timestamp fallback paths in LV live ingestion
- Redis lock fail-open rationale (if applicable to Battery V2 paths)

Mark new discoveries with `BAT-V2-GAP-*` rather than inventing detail.
