# Tires Health — Knowledge Graph Overview

Human-readable map of the machine graph in [`graph/`](graph/). Validate with `bash architecture/tires/scripts/validate-graph.sh`.

## Domain boundary and flows

```mermaid
flowchart LR
  subgraph di [Driving Intelligence — not owned]
    HF[HF trip behaviour enrichment]
    TDI[(trip_driving_impact)]
    VDI[(vehicle_driving_impact_current)]
    DS4[DS4 motion-core shadow runs]
    RD[TripMapReadService.readForTrip]
    HF --> TDI --> VDI
    DS4 --> RD
  end

  subgraph tires [Tires Health]
    LED[(tire_trip_usage_ledger)]
    V2[TireWearModelService tire-wear-v2]
    HS[TireHealthService]
    SNAP[(tire_health_snapshots)]
    AL[(tire_health_alerts)]
    MEAS[(tread measurements = ground truth)]
    API[/vehicles/:id/tires/*]
    SH[future tire shadow adapter + store]
    TDI --> LED
    VDI --> V2 --> HS --> SNAP
    HS --> AL
    HS --> API
    MEAS -.validates.-> V2
    RD -.future, read-only.-> SH
    MEAS -.validates.-> SH
  end

  subgraph rh [Rental Health — consumer]
    POL[tire-rental-health.policy]
    HS --> POL
  end
  SH -. must not influence .-> POL
  SH -. must not influence .-> SNAP
```

## Stable IDs by stage

| Stage | Nodes |
|-------|-------|
| Domain | TIRE-DOM-TIRES-HEALTH-001 |
| Persistence | TIRE-PERSIST-SETUP-001, TIRE-PERSIST-TREAD-MEASUREMENT-001, TIRE-PERSIST-HEALTH-SNAPSHOT-001, TIRE-PERSIST-TRIP-USAGE-LEDGER-001, TIRE-PERSIST-HEALTH-ALERT-001 |
| Model / orchestration | TIRE-ORCH-WEAR-MODEL-V2-001, TIRE-ORCH-HEALTH-SERVICE-001, TIRE-PIPE-TRIP-USAGE-ATTRIBUTION-001 |
| Execution | TIRE-WORK-RECALCULATION-SCHEDULER-001, TIRE-QUEUE-RECALCULATION-001, TIRE-WORK-RECALCULATION-PROCESSOR-001 |
| Authorities / policies | TIRE-AUTH-LIFECYCLE-001, TIRE-AUTH-GROUND-TRUTH-001, TIRE-POL-SNAPSHOT-FINGERPRINT-DEDUPE-001, TIRE-POL-LEDGER-IDEMPOTENCY-001, TIRE-POL-RENTAL-HEALTH-001 |
| API / consumers | TIRE-API-VEHICLE-TIRES-001, TIRE-CONS-RENTAL-HEALTH-001, TIRE-CONS-FRONTEND-001 |
| External inputs (DI) | TIRE-EXT-DI-VEHICLE-IMPACT-CURRENT-001, TIRE-EXT-DI-TRIP-IMPACT-001, TIRE-EXT-TRIP-HARSH-COUNTERS-001, TIRE-EXT-TRIP-AMBIENT-PRESSURE-001 |
| External inputs (DS4) | TIRE-EXT-DS4-MOTION-EVENTS-001, TIRE-EXT-DS4-SPEED-AUTHORITY-001, TIRE-EXT-DS4-SHADOW-CONTROL-PLANE-001, TIRE-EXT-DS4-TRIP-MAP-READ-001 |

## Decision register (summary)

| ID | Title | Status |
|----|-------|--------|
| TIRE-DEC-PRESERVE-EXISTING-STACK-001 | Preserve existing tire stack | PROPOSED |
| TIRE-DEC-V2-FROZEN-TO-BE-SUPERSEDED-001 | V2 frozen, to be superseded in a controlled way | PROPOSED |
| TIRE-DEC-DS4-FUTURE-LOAD-BASIS-SHADOW-ONLY-001 | DS4 future load basis, shadow only | PROPOSED |
| TIRE-DEC-DS4-CONSERVATIVE-ADMISSION-POLICY-001 | Quality-gated DS4 admission | PROPOSED |
| TIRE-DEC-NO-DOUBLE-COUNTING-001 | One source per factor | PROPOSED |
| TIRE-REJECT-IMMEDIATE-V2-REPLACEMENT-001 | Immediate V2 replacement | REJECTED |
| TIRE-REJECT-DS4-INTO-V2-BEHAVIOR-FACTOR-001 | DS4 into V2 behaviour factor | REJECTED |

## Invariants

Confirmed: TIRE-INV-SINGLE-ACTIVE-SETUP-001, TIRE-INV-MEASUREMENTS-ARE-GROUND-TRUTH-001, TIRE-INV-LEDGER-IDEMPOTENT-001, TIRE-INV-SNAPSHOT-VERSION-STAMPED-001, TIRE-INV-TENANT-SCOPE-API-001, TIRE-INV-DS4-QUALITY-IS-NOT-PLAUSIBILITY-001, TIRE-INV-DS4-ARTEFACT-SUSPECT-EXCLUDED-001.
Candidate: TIRE-INV-SHADOW-NO-PRODUCTIVE-INFLUENCE-001, TIRE-INV-NO-DOUBLE-COUNTING-001, TIRE-INV-NEUTRAL-FALLBACK-001.

## Gaps, contradictions, hypotheses

See [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md), [`contradictions/OPEN_CONTRADICTIONS.md`](contradictions/OPEN_CONTRADICTIONS.md), [`research/OPEN_HYPOTHESES.md`](research/OPEN_HYPOTHESES.md).
