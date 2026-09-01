# D2 — Canonical LV REST → Assessment Crash-Boundary Recovery Authority

**Decision ID:** `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001`  
**Package:** `BAT-V2-RUNTIME-PKG-01` (spec closure only — handoff not implemented)  
**Depends on:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (D1 — `inputVersion = BatteryMeasurement.id`)  
**Status:** `VALIDATED` (architecture / code-authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-01

## BEFORE

Phase 4 documented a crash boundary: `BatteryRestTargetEvaluateHandler` may persist a canonical REST measurement then return early on retry when `hasMeasurement === true` **without** ensuring assessment handoff. Reconciliation (`reconcilePendingAssessments`) scans stale `batteryFeatures`, not canonical `BatteryMeasurement` REST rows. Crash-boundary handling remained **SPEC REQUIRED** for PKG-01.

## FAILURE MODE

1. Canonical REST `BatteryMeasurement` persisted successfully  
2. Process crashes before assessment enqueue  
3. `BATTERY_REST_TARGET_EVALUATE` retries  
4. `hasMeasurement === true` → handler marks target COMPLETED and returns  
5. Assessment handoff remains missing until external repair

Additional stranding paths: REST job never retries successfully, retry budget exhausted, queue/Redis interruption between DB persist and BullMQ enqueue.

## OPTIONS

| Option | Summary |
|--------|---------|
| **Direct only** | Enqueue only on first persist path |
| **Reconciliation only** | No direct enqueue; periodic scan repairs all |
| **Transactional outbox** | Atomic measurement + outbox row + dispatcher |
| **Hybrid C+** | Direct normal + direct retry repair + periodic reconciliation + durable target-scoped handoff state |

## SELECTED

**Hybrid C+ crash recovery**

1. **Direct normal handoff** — primary low-latency path after successful measurement persist  
2. **Direct retry repair** — existing-measurement branch ensures handoff before COMPLETED return  
3. **Periodic reconciliation safety net** — independent eventual repair using same D1 identity  
4. **Durable target-scoped handoff state** — mutable LV REST session/target metadata (not `BatteryMeasurement` scientific truth)

Reconciliation is **not** the primary delivery mechanism.

## REJECTED

| Option | Why rejected |
|--------|--------------|
| **Direct only** | Cannot recover when original REST job never retries successfully; queue/process failure may strand persisted measurement |
| **Reconciliation only** | Unnecessary latency; polling becomes normal delivery; higher fleet-scale background load; Phase 4 defines direct handoff as canonical path |
| **Transactional outbox** | New persistence model, dispatcher, cleanup, monitoring — disproportionate for current Battery V2; system already has deterministic jobs, reconciliation, DB idempotency |

## WHY (Hybrid C+)

- Low-latency normal path  
- Immediate retry self-heal on `hasMeasurement` replay  
- Independent eventual recovery via reconciliation  
- Distinguishes policy skip from delivery failure  
- Compatible with multi-replica execution  
- Reuses existing Battery V2 reconciliation architecture  
- No mandatory DB migration for D2 target architecture

## TARGET CONTRACT

### Normal path

After canonical REST measurement persist in `BatteryRestTargetEvaluateHandler`:

```typescript
// result.measurementId from evaluateAndPersist(...)
buildAssessmentJobIdempotencyKey({
  vehicleId,
  assessmentType: 'LV_HEALTH',
  inputVersion: measurement.id,
})
// → assess:{vehicleId}:LV_HEALTH:{measurementId}
```

Ensure assessment handoff → update target metadata handoff state → mark target COMPLETED.

### Retry path (existing measurement)

When `hasMeasurement === true`:

```
existing measurement found
  → resolve persisted measurement.id for this target
  → ensureAssessmentHandoff(measurement.id)   // same D1 identity
  → maintain/mark target COMPLETED
  → return
```

**Insufficient today:** mark COMPLETED and return without handoff ensure.

### Reconciliation safety net

Periodic reconciliation independently repairs canonical REST measurements whose handoff execution is incomplete per durable target-scoped state.

- **Same D1 identity:** `inputVersion = BatteryMeasurement.id`  
- **No** reconciliation-specific job identity  
- Cadence remains existing/independent operational policy unless separately specified  
- **No** new hard time SLA in this decision

Current code gap (pre-implementation): `reconcilePendingAssessments` scans `batteryFeatures`, not canonical REST measurements — implementation must extend per D2.

### Handoff liveness vs assessment policy outcome

**Critical rule:** absence of a `BatteryAssessment` row is **not** sufficient to signal missing handoff.

Assessment execution may legitimately yield:

- persisted assessment(s)  
- policy skipped / insufficient data  
- unsupported profile

`NO BatteryAssessment row ≠ missing handoff`

Reconciliation must **not** infinite-retry on valid policy skips.

Distinguish:

| Dimension | Meaning |
|-----------|---------|
| **HANDOFF / EXECUTION LIVENESS** | Deterministic job enqueued and handler completed policy evaluation |
| **ASSESSMENT POLICY OUTCOME** | Whether assessment row(s) persisted |

### Durable operational handoff state (target-scoped)

**Authority:** existing mutable LV REST session / target metadata — **not** `BatteryMeasurement` scientific truth. **No** new DB column required for D2 target architecture.

**Target-scoped** because REST_60M and REST_6H may each produce distinct `BatteryMeasurement` rows.

Conceptual model per REST target:

```yaml
assessmentHandoff:
  measurementId: string
  idempotencyKey: string      # assess:{vehicleId}:LV_HEALTH:{measurementId}
  status: IMPLICIT | ENQUEUED | EXECUTED
  outcome: ASSESSMENT_PERSISTED | POLICY_SKIPPED | UNSUPPORTED | null
  enqueuedAt: ISO8601 | null
  executedAt: ISO8601 | null
  lastAttemptAt: ISO8601 | null
```

Exact JSON field names are implementation detail; semantic states are authoritative.

| State | Meaning |
|-------|---------|
| **IMPLICIT / MISSING** | No successful handoff recorded |
| **ENQUEUED** | Deterministic assessment job successfully handed to queue |
| **EXECUTED** | Assessment handler completed policy evaluation (with outcome) |

`POLICY_SKIPPED` and `UNSUPPORTED` are **not** liveness failures.

### Reconciliation decision rule

| Durable state | Repair? |
|---------------|---------|
| MISSING | Eligible for repair |
| ENQUEUED + live Bull job | Do **not** duplicate enqueue |
| ENQUEUED + no live job + no EXECUTED after recovery settle/grace | Eligible per existing queue/DLQ recovery rules |
| EXECUTED + ASSESSMENT_PERSISTED | Complete |
| EXECUTED + POLICY_SKIPPED | Complete |
| EXECUTED + UNSUPPORTED | Complete |

### Exactly-once verdict

**D2 does NOT guarantee absolute exactly-once execution.**

Selected contract:

**AT-LEAST-ONCE DELIVERY** + **DETERMINISTIC JOB IDENTITY** + **IDEMPOTENT PERSISTENCE** + **DURABLE HANDOFF OUTCOME** + **RECONCILIATION**

PostgreSQL measurement persist and BullMQ enqueue are not one atomic transaction. Crash may occur after assessment execution but before durable `EXECUTED` marker — later recovery may re-execute assessment. Acceptable because assessment persistence uses deterministic assessment idempotency keys.

Do **not** claim exactly-once.

### Handler execution (unchanged from D1)

`BatteryAssessmentRecomputeHandler` triggers `recomputeLvEstimatedHealth()` — `inputVersion` is **trigger identity**, not frozen snapshot. D2 does not redesign assessment computation.

## EXPECTED_EFFECT

PKG-01 crash-boundary spec blocker closed. Runtime implementation has authoritative Hybrid C+ contract. `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` remains open until enqueue + state machine land in code.

## VALIDATION

- Code cites: `battery-rest-target-evaluate.handler.ts` (`hasMeasurement` early return), `battery-v2-reconciliation.service.ts` (`reconcilePendingAssessments`), `battery-assessment.service.ts` (policy skip), `battery-v2-job-producer.service.ts` (in-flight dedupe)  
- `bash architecture/battery-v2/scripts/validate-graph.sh`

## NON_EFFECTS

- No runtime implementation  
- No assessment enqueue added  
- No reconciliation code changed  
- No DB migration  
- No feature flags  
- No production mutation  
- No backfill  
- No deploy  
- Assessment-handoff gap remains open  
- PKG-01 remains `IMPLEMENTATION_SPEC_REQUIRED` (configuration invariant only)

## RISKS

| Risk | Mitigation |
|------|------------|
| Metadata schema drift across REST_60M / REST_6H | Target-scoped handoff block per target in session metadata |
| Reconciliation uses assessment-row absence as signal | Explicit EXECUTED + outcome in durable state |
| Over-enqueue on ENQUEUED + live job | Producer in-flight dedupe + reconciliation live-job check |

## STATUS

`decision_status: VALIDATED` — architecture decision from current code facts + Phase 4 authority. **Not** production behavioral validation.
