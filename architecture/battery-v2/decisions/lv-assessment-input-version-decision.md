# D1 — Canonical LV REST → Assessment `inputVersion` Authority

**Decision ID:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001`  
**Package:** `BAT-V2-RUNTIME-PKG-01` (spec closure only — handoff not implemented)  
**Status:** `VALIDATED` (architecture / code-authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-01

## BEFORE

Phase 4 left PKG-01 `inputVersion` as **SPEC REQUIRED** with three candidates (`measurement.id`, `measurement.observedAt`, composite rest-window binding). Canonical assessment job identity uses `buildAssessmentJobIdempotencyKey` with an unresolved `inputVersion` anchor for canonical REST handoff.

## OPTIONS

| Option | Summary |
|--------|---------|
| **A** | `persisted BatteryMeasurement.id` |
| **B** | `measurement.observedAt` (epoch ms) |
| **C** | `tripId` / `sessionId` / `restWindowId` alone |
| **D** | Composite `restWindowId + target + measurementId` |

## SELECTED

**`inputVersion = persisted BatteryMeasurement.id`**

Canonical assessment job identity:

```typescript
buildAssessmentJobIdempotencyKey({
  vehicleId,
  assessmentType: 'LV_HEALTH',
  inputVersion: measurement.id,
})
// → assess:{vehicleId}:LV_HEALTH:{measurementId}
```

**Semantic contract:** `inputVersion` is **not** algorithm/model version, timestamp provenance, trip identity, or rest-window identity. For canonical LV REST → assessment handoff it means:

> The stable identity of the concrete persisted `BatteryMeasurement` whose successful creation triggered this assessment recompute.

The persisted measurement is the **trigger authority**.

## REJECTED

| Option | Why rejected |
|--------|--------------|
| **`measurement.observedAt`** | Timestamp provenance remains unresolved (PKG-03); observation time is epistemic, not ideal persistence identity; separate measurements must not depend on timestamp uniqueness |
| **`tripId` / `sessionId` / `restWindowId` alone** | One trip/rest window may produce multiple valid measurement inputs (e.g. REST_60M and REST_6H) |
| **Composite `restWindowId + target + measurementId`** | Redundant — `BatteryMeasurement.id` is already stable and unique; rest/session/target context belongs in payload, correlation metadata, observability, and logs — not minimal job identity |

## WHY (measurement.id)

| Criterion | Rationale |
|-----------|-----------|
| **A — Unique / stable** | `BatteryMeasurement.id` uniquely identifies the persisted input |
| **B — Retry safe** | Normal path and retry/reconciliation derive the same assessment job identity for the same measurement |
| **C — Multi-replica safe** | Workers observing the same persisted measurement derive the same idempotency key |
| **D — Timestamp-independent** | Job identity does not depend on `observedAt` — timestamp provenance remains independent PKG-03 decision |
| **E — Multiple REST targets** | REST_60M and REST_6H may produce distinct measurements; each gets its own assessment trigger |
| **F — No migration** | Stable measurement primary key already exists |

## CURRENT RUNTIME COMPATIBILITY

**Builder (unchanged):** `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-idempotency.policy.ts`

```typescript
export function buildAssessmentJobIdempotencyKey(input: {
  vehicleId: string;
  assessmentType: string;
  inputVersion: string | number;
}): string {
  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.assessment,
    input.vehicleId,
    input.assessmentType,
    String(input.inputVersion),
  ].join(':');
}
```

**Handoff boundary (measurement id available, enqueue not implemented):** `battery-rest-target-evaluate.handler.ts` logs `result.measurementId` after successful `evaluateAndPersist(...)`.

## LEGACY COMPATIBILITY

Legacy snapshot rest capture may continue using `capture.capturedAt.getTime()` for its **existing** job identity. D1 defines authority for **canonical LV REST → assessment handoff** only.

No backfill. No job re-keying.

## EXPECTED_EFFECT

PKG-01 `inputVersion` blocker closed. Runtime agents implementing canonical handoff use `measurement.id` without inventing alternate anchors. `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` remains open until enqueue is implemented.

## VALIDATION

- Code authority: `buildAssessmentJobIdempotencyKey` contract unchanged
- `BatteryRestTargetEvaluateHandler` exposes `result.measurementId` at persist boundary
- `bash architecture/battery-v2/scripts/validate-graph.sh`

## NON_EFFECTS

- No runtime implementation
- No assessment enqueue added
- No feature flags changed
- No database migration
- No production mutation
- No backfill
- No deploy
- PKG-01 not yet `IMPLEMENTATION_READY` (crash-boundary + configuration invariant remain)

## RISKS

| Risk | Mitigation |
|------|------------|
| Reconciliation scan must use same `inputVersion` rule when repairing missed handoffs | Document in PKG-01 implementation; reconcile must key on measurement id |
| Crash boundary before enqueue | Separate PKG-01 blocker — not resolved by D1 |

## STATUS

`decision_status: VALIDATED` — architecture decision validated from existing runtime contracts. **Not** production behavioral validation.
