# D2 — Canonical LV REST → Assessment Crash-Boundary Recovery Authority

**Decision ID:** `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001`  
**Package:** `BAT-V2-RUNTIME-PKG-01` (spec closure only — handoff not implemented)  
**Depends on:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (D1 — `inputVersion = BatteryMeasurement.id`)  
**Status:** `VALIDATED` (architecture / code-authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-01  
**Precision pass:** 2026-09-01 — handoff eligibility, terminal retry semantics, `sourceEntityId` correlation, monotonic state, concurrency-safe metadata, enqueue/EXECUTED ack semantics

## BEFORE

Phase 4 documented a crash boundary: `BatteryRestTargetEvaluateHandler` may persist a canonical REST measurement then return early on retry when `hasMeasurement === true` **without** ensuring assessment handoff. Reconciliation (`reconcilePendingAssessments`) scans stale `batteryFeatures`, not canonical `BatteryMeasurement` REST rows. Crash-boundary handling remained **SPEC REQUIRED** for PKG-01.

Initial D2 (Hybrid C+) closed architecture selection but left implementation-contract holes: any-measurement retry handoff, terminal-outcome preservation on replay, canonical assessment acknowledgement correlation, monotonic/concurrency-safe handoff metadata, and precise enqueue/EXECUTED ack semantics.

## FAILURE MODE

1. Canonical REST `BatteryMeasurement` persisted successfully (handoff-eligible selected-observation path)  
2. Process crashes before assessment enqueue  
3. `BATTERY_REST_TARGET_EVALUATE` retries  
4. `hasMeasurement === true` → handler marks target COMPLETED and returns  
5. Assessment handoff remains missing until external repair

**Additional current-code risks at replay boundary:**

- `hasTargetMeasurement()` returns true for **any** `BatteryMeasurement` of the target type — including synthetic terminal rows (`persistMissedMeasurement`, `persistStatusMeasurement`) that the normal path would **not** hand off  
- Replay may silently convert terminal outcomes (`MISSED`, `FAILED`) → `COMPLETED`  
- Ordinary read-modify-write over loaded `session.metadata` snapshot is not multi-replica lost-update safe without target guard

Additional stranding paths: REST job never retries successfully, retry budget exhausted, queue/Redis interruption between DB persist and BullMQ enqueue.

## OPTIONS

| Option | Summary |
|--------|---------|
| **Direct only** | Enqueue only on first persist path |
| **Reconciliation only** | No direct enqueue; periodic scan repairs all |
| **Transactional outbox** | Atomic measurement + outbox row + dispatcher |
| **Hybrid C+** | Direct normal + direct retry repair + periodic reconciliation + durable target-scoped handoff state |

## SELECTED

**Hybrid C+ crash recovery** (unchanged — not reopened)

1. **Direct normal handoff** — primary low-latency path after successful handoff-eligible measurement persist  
2. **Direct retry repair** — existing-measurement branch ensures handoff only for eligible measurements; preserves terminal outcomes otherwise  
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
- Immediate retry self-heal on eligible-measurement replay  
- Independent eventual recovery via reconciliation  
- Distinguishes policy skip from delivery failure  
- Target-scoped durable state compatible with multi-replica execution **when** concurrency-safe monotonic merge is implemented  
- Reuses existing Battery V2 reconciliation architecture  
- No mandatory DB migration for D2 target architecture

## TARGET CONTRACT

### Normal path

After **handoff-eligible** canonical REST measurement persist in `BatteryRestTargetEvaluateHandler`:

```typescript
buildAssessmentJobIdempotencyKey({
  vehicleId,
  assessmentType: 'LV_HEALTH',
  inputVersion: measurement.id,
})
// → assess:{vehicleId}:LV_HEALTH:{measurementId}
```

Canonical handoff payload (existing `BatteryV2JobPayloadBase` fields — no new payload field):

```typescript
{
  inputVersion: measurement.id,      // D1 — deterministic trigger / job identity
  sourceEntityId: measurement.id,    // D2 — operational source entity for handoff ack
  // ... organizationId, vehicleId, idempotencyKey, etc.
}
```

Semantics differ:

| Field | Role |
|-------|------|
| `inputVersion` | Deterministic trigger / job identity (D1) |
| `sourceEntityId` | Operational source entity used to acknowledge the correct REST measurement handoff (D2) |

Ensure assessment handoff → update target metadata handoff state (monotonic) → mark target COMPLETED (normal success path only).

### HANDOFF_ELIGIBILITY — `CANONICAL_ASSESSMENT_HANDOFF_ELIGIBLE_MEASUREMENT`

**Not every persisted `BatteryMeasurement` requires assessment handoff.**

Retry and reconciliation must **load the existing row** — not rely on a boolean `hasMeasurement` check alone.

A measurement is handoff-eligible when it represents a **selected-observation `evaluateAndPersist` result** for which the normal path would execute assessment handoff.

**Current-code discriminator (provenance, not quality alone):**

| Persistence path | `result.ok` | `measurementId` | `provenance.sourceObservationId` | Handoff eligible? |
|------------------|-------------|-----------------|----------------------------------|-------------------|
| Selected observation (`evaluateAndPersist` success path) | `true` | yes | **present** | **YES** |
| `persistMissedMeasurement` (synthetic terminal) | `false` | yes | **absent** | **NO** |
| `persistStatusMeasurement` (unsupported profile) | `false` | yes | **absent** | **NO** |

**Quality nuance:** `evaluateClassifiedRestTargetOutcome()` may return `ok: true` with `quality: MISSED` when a selected observation exists after grace. Such rows **include** `sourceObservationId` and **are** handoff-eligible. `quality === MISSED` alone does **not** prove synthetic terminal measurement — use persistence provenance.

Exact helper name (e.g. `isCanonicalAssessmentHandoffEligibleMeasurement`) is implementation detail; semantic rule is authoritative.

### Retry path (existing measurement)

When an existing target measurement row is found on replay:

```
load BatteryMeasurement row for session + target type
  → if CANONICAL_ASSESSMENT_HANDOFF_ELIGIBLE_MEASUREMENT:
       ensureAssessmentHandoff(measurement.id)   // same D1 identity + sourceEntityId correlation
       → mark target COMPLETED
       → return
  → else if synthetic missed (persistMissedMeasurement provenance):
       preserve / restore target MISSED semantics
       → no assessment handoff
       → return
  → else if synthetic unsupported (persistStatusMeasurement provenance):
       preserve terminal FAILED semantics (current REST handler path)
       → no assessment handoff
       → return
```

**Current code risk (pre-implementation):** `hasTargetMeasurement()` bool + unconditional `COMPLETED` on replay — may mis-handle terminal measurements and skip handoff for eligible rows. Production frequency **UNKNOWN**; documented as replay-boundary risk within existing assessment-handoff gap — **no new gap ID**.

**Insufficient today:** mark COMPLETED and return without row inspection or handoff ensure.

### Reconciliation safety net

Periodic reconciliation independently repairs canonical REST measurements whose handoff execution is incomplete per durable target-scoped state — **only for handoff-eligible measurements**.

- **Same D1 identity:** `inputVersion = BatteryMeasurement.id`  
- **Same correlation:** `sourceEntityId = BatteryMeasurement.id` when enqueueing repair jobs  
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

### Monotonic state invariant

**Ordering:** `MISSING < ENQUEUED < EXECUTED`

`EXECUTED` is **terminal** for handoff liveness. **Never** permit:

- `EXECUTED → ENQUEUED`
- `EXECUTED → MISSING`
- `ENQUEUED → MISSING`

A later or stale writer may enrich timestamps or diagnostics only if doing so does **not** regress semantic state.

**Race:** assessment worker may write `EXECUTED` immediately after BullMQ enqueue, before REST producer writes `ENQUEUED`. **Late `ENQUEUED` acknowledgement must be a no-op** when current state is already `EXECUTED`.

### Concurrency-safe session metadata authority

Current runtime pattern loads `session.metadata` snapshot → `mergeLvRestTargetJobMetadata(snapshot, …)` → Prisma update. This ordinary read-modify-write does **not** by itself prove multi-replica lost-update safety.

Hybrid C+ multi-replica compatibility requires:

**`assessmentHandoff` persistence MUST use a concurrency-safe, target-scoped, monotonic merge.**

Required invariants:

- never regress `EXECUTED`
- preserve REST_60M sibling state while updating REST_6H (and vice versa)
- preserve unrelated LV REST session metadata
- stale `session.metadata` snapshots must not overwrite newer handoff state
- concurrent handler / reconciliation writers must converge

Exact mechanism is implementation detail (atomic JSONB path update with state guard, transaction + concurrency control, compare-and-set / optimistic update, or evidence-backed equivalent). **No DB migration required** to define this invariant.

### Canonical assessment acknowledgement correlation

Target `BatteryAssessmentRecomputeHandler` acknowledgement for canonical REST jobs:

```
payload.sourceEntityId
  → load BatteryMeasurement by id
  → verify organizationId + vehicleId
  → resolve sessionId from measurement.sessionId
  → resolve REST target from measurement.type (REST_60M | REST_6H)
  → update that target's assessmentHandoff → EXECUTED + outcome
```

**Legacy** assessment jobs without canonical measurement `sourceEntityId` must **not** accidentally mutate canonical REST handoff metadata.

Do **not** infer canonical source solely from `correlationId` string parsing.

### ENQUEUE acknowledgement semantics

`ENQUEUED` may be written **only after** a successful canonical producer result.

**Successful** means the deterministic assessment job is actually accepted **or** an existing in-flight deterministic job is returned/confirmed (producer duplicate-in-queue path returns `jobId`).

Do **not** write `ENQUEUED` when:

- producer returns `null` (workers disabled, dead-letter suppression, etc.)
- enqueue throws before success
- suppression means no live handoff was established

Failure/attempt metadata may be recorded separately; it must not masquerade as successful `ENQUEUED` state.

Queue/DLQ recovery remains governed by existing recovery rules. No invented SLA.

### EXECUTED acknowledgement semantics

Assessment handler writes `EXECUTED` only after `recomputeLvEstimatedHealth()` returns its policy result.

Map current `RecomputeLvEstimatedHealthAssessmentResult` semantics:

| Condition | `EXECUTED` outcome |
|-----------|-------------------|
| `ok: true` (with or without persisted rows — current success path persists ≥1 assessment) | `ASSESSMENT_PERSISTED` |
| `ok: false` + `unsupportedProfile: true` | `UNSUPPORTED` |
| `ok: false` + `unsupportedProfile: false` | `POLICY_SKIPPED` |

`EXECUTED` marks liveness completion even when no `BatteryAssessment` row exists (`POLICY_SKIPPED`, `UNSUPPORTED`).

Current code does not yet write handoff metadata from assessment handler — PKG-01 implementation target.

### Reconciliation decision rule

| Durable state | Repair? |
|---------------|---------|
| MISSING (eligible measurement) | Eligible for repair |
| ENQUEUED + live Bull job | Do **not** duplicate enqueue |
| ENQUEUED + no live job + no EXECUTED after recovery settle/grace | Eligible per existing queue/DLQ recovery rules |
| EXECUTED + ASSESSMENT_PERSISTED | Complete |
| EXECUTED + POLICY_SKIPPED | Complete |
| EXECUTED + UNSUPPORTED | Complete |
| Ineligible / synthetic terminal measurement | No handoff repair |

### Exactly-once verdict

**D2 does NOT guarantee absolute exactly-once execution.**

Selected contract:

**AT-LEAST-ONCE DELIVERY** + **DETERMINISTIC JOB IDENTITY** + **IDEMPOTENT PERSISTENCE** + **DURABLE HANDOFF OUTCOME** + **RECONCILIATION**

PostgreSQL measurement persist and BullMQ enqueue are not one atomic transaction. Crash may occur after assessment execution but before durable `EXECUTED` marker — later recovery may re-execute assessment. Acceptable because assessment persistence uses deterministic assessment idempotency keys.

Do **not** claim exactly-once.

### Handler execution (unchanged from D1)

`BatteryAssessmentRecomputeHandler` triggers `recomputeLvEstimatedHealth()` — `inputVersion` is **trigger identity**, not frozen snapshot. D2 does not redesign assessment computation.

## EXPECTED_EFFECT

PKG-01 crash-boundary spec blocker closed with implementation-grade contracts. Runtime agents have authoritative Hybrid C+ contract including eligibility, correlation, monotonic state, and concurrency requirements. `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` remains open until enqueue + state machine land in code.

## VALIDATION

- Code cites: `battery-rest-target-evaluate.handler.ts` (`hasTargetMeasurement`, replay `COMPLETED`), `battery-rest-target-evaluation.service.ts` (selected vs synthetic persistence), `battery-v2-job-producer.service.ts` (enqueue success vs null), `battery-assessment.service.ts` / `battery-assessment-recompute.handler.ts` (policy outcomes), `battery-v2-job.types.ts` (`sourceEntityId`)  
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
| Any-measurement replay marks COMPLETED | Eligibility gate + terminal outcome preservation |
| Lost-update on concurrent metadata writers | Concurrency-safe monotonic target-scoped merge |

## STATUS

`decision_status: VALIDATED` — architecture decision from current code facts + Phase 4 authority. **Not** production behavioral validation.
