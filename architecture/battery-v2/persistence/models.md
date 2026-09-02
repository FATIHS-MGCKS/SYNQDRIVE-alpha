# Battery V2 — Persistence Models

**Source:** `backend/prisma/schema.prisma`  
**Reconstruction date:** 2026-09-01

## Canonical V2 tables (append-only / versioned)

| Model | Graph ID | Purpose | Key constraints |
|-------|----------|---------|-----------------|
| `BatteryMeasurementSession` | `BAT-V2-STORE-BATTERY-MEASUREMENT-SESSION-001` | Time-bounded cycle (LV REST window, etc.) | `@@unique([vehicleId, idempotencyKey])`; mutable `metadata` FSM |
| `BatteryMeasurement` | `BAT-V2-STORE-BATTERY-MEASUREMENT-001` | Immutable measurements | `@@unique([organizationId, vehicleId, idempotencyKey])`; `@@unique([vehicleId, type, observedAt])` |
| `BatteryAssessment` | `BAT-V2-STORE-BATTERY-ASSESSMENT-001` | Versioned assessments | `@@unique([vehicleId, idempotencyKey])`; `supersededById` chain |
| `BatteryPublication` | `BAT-V2-STORE-BATTERY-PUBLICATION-001` | Publication history | `@@unique([organizationId, vehicleId, idempotencyKey])` |
| `VehicleBatteryCapability` | `BAT-V2-STORE-VEHICLE-BATTERY-CAPABILITY-001` | Preflight per signal | `@@unique([vehicleId, signalKey])` |
| `VehicleBatteryReferenceCapacity` | `BAT-V2-STORE-REFERENCE-CAPACITY-001` | Verified HV reference | Active/superseded chain |
| `HvChargeSession` | `BAT-V2-STORE-HV-CHARGE-SESSION-001` | Charge sessions | `@@unique([vehicleId, segmentFingerprint])` |
| `HvCapacityObservation` | `BAT-V2-STORE-HV-CAPACITY-OBSERVATION-001` | Shadow capacity points | `@@unique([vehicleId, method, observedAt])` |
| `BatteryV2JobDeadLetter` | (execution layer) | Exhausted job ledger | `@@unique([jobType, idempotencyKey])` |

### BatteryAssessment operational envelope (PKG-02)

Scientific assessment identity and evidence fields on `BatteryAssessment` are **append-only / versioned** — scores, evidence selection, model outputs, and measurement linkage must not be mutated post-create.

The **only** post-create mutable envelope permitted by PKG-02 is:

`inputSummary.publicationHandoff`

This is **operational handoff/liveness metadata** (MISSING → ENQUEUED → EXECUTED), not scientific assessment evidence. Mutations are restricted to `LvPublicationHandoffService` through row-locked handoff mutation primitives:

- `mutateBatteryAssessmentPublicationHandoff`
- `reserveLvPublicationHandoffEnqueue`

Both must preserve:

- scientific assessment immutability
- unrelated `inputSummary` keys
- monotonic lifecycle semantics (`EXECUTED` never regresses)
- identity (`selectedAssessmentId`, `idempotencyKey`, `epochAssessmentIds`)
- row-lock serialization (`SELECT … FOR UPDATE`)

## Legacy / operational (still consumed)

| Model | Graph ID | Status |
|-------|----------|--------|
| `BatteryFeatures` | `BAT-V2-STORE-BATTERY-FEATURES-LEGACY-001` | In-place feature store; `battery-health/v2` API |
| `BatteryHealthSnapshot` | — | Legacy 12V snapshots |
| `HvBatteryHealthSnapshot` | — | HV poll snapshots |

## Layer model

```
MeasurementSession → Measurements (evidence)
                  → Assessments (scored runs)
                  → Publications (immutable publish events)
```

**Operational read path note:** Some publication state still flows through `battery_features` / `hv_battery_health_current` per architecture memos — canonical DTO is `CanonicalBatteryHealthService`.

## Trip relation

- `BatteryMeasurementSession.tripId` — optional FK; conditional invariant when authoritative finalized trip known (`BAT-V2-INV-TRIP-BIND-001`)

## Timestamp fields (measurements)

- `observedAt` — observation time used for eligibility
- `receivedAt` — ingest/receipt time
- `providerTimestamp` — provider-claimed observation time (LV tension documented in `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`)
