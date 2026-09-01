# LV Publication Chain — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001`  
**Priority:** P0_ACTIVATION_BLOCKER (Stage-2 cutover — **not** proven active production outage while flags default OFF)  
**Readiness:** IMPLEMENTATION_SPEC_REQUIRED (identity + version semantics unresolved)  
**Proposed decision:** `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` (PROPOSED — gaps remain open)

## CURRENT STATE

Canonical REST measurement persists to `BatteryMeasurement` but does not enqueue `BATTERY_ASSESSMENT_RECOMPUTE`. Assessment completion does not enqueue `BATTERY_PUBLICATION_UPDATE`. Stage 2+ disables legacy snapshot capture → **cutover trap**. `reconcilePendingAssessments()` scans stale `batteryFeatures`, not canonical measurements.

`BATTERY_V2_REST_SHADOW_ENABLED` and `BATTERY_V2_PUBLICATION_ENABLED` default **OFF** — missing handoffs are activation blockers, not demonstrated live-customer publication outages.

## EVIDENCE

- `battery-rest-target-evaluate.handler.ts` — persists measurement; no assessment enqueue
- `battery-assessment-recompute.handler.ts` — returns `persistedAssessmentIds`; no publication enqueue
- `battery-publication-update.handler.ts` → `BatteryPublicationService.updateLvPublication()` → `evaluateLvPublicationPolicy()`
- `battery-v2-reconciliation.service.ts` — legacy `batteryFeatures` selection for assessment reconcile
- `battery-v2-snapshot-ingestion.service.ts` — legacy `enqueueLvAssessmentRecompute()` pattern
- `BAT-V2-EVID-AUDIT-PUBLICATION-ENQUEUE-ABSENCE-001`
- Phase 3 reachability matrix

## CODE REACHABILITY

CONFIRMED broken handoffs when `BATTERY_V2_REST_SHADOW_ENABLED` + `BATTERY_V2_PUBLICATION_ENABLED` ON.

## USER / SYSTEM IMPACT

- No automatic LV publication maturity progression from canonical REST **when flags enabled**
- Operators may believe Stage 2 is live when only ingestion works
- Readiness remains decoupled until Stage 3
- **No proven current-customer Stage-2 publication outage** while flags remain OFF

## TARGET STATE

End-to-end deterministic path:

```
REST target COMPLETED + measurement persisted
  → BATTERY_ASSESSMENT_RECOMPUTE (canonical idempotency key)
  → assessment persisted (BatteryAssessmentService)
  → BATTERY_PUBLICATION_UPDATE per persistedAssessmentId
  → BatteryPublicationService.evaluateLvPublicationPolicy()
  → battery_publications row when policy passes
  → canonical.lv reflects publication maturity
```

Plus reconciliation safety net for crash boundaries.

**Publication policy is NOT evaluated in the assessment handler.** The assessment handler must not gate on `publicationEligible`; policy authority remains in `BatteryPublicationService` / `evaluateLvPublicationPolicy()`.

## OPTIONS — Assessment handoff

| Option | Summary | Idempotency | Crash boundary | BullMQ | Verdict |
|--------|---------|-------------|----------------|--------|---------|
| **A** Direct enqueue from REST handler | Simplest | `buildAssessmentJobIdempotencyKey` | Handler commit → enqueue gap | Standard retry | Good normal path |
| **B** Domain event on measurement create | Decoupled | Event outbox pattern | Needs outbox or txn | Consumer workers | Higher complexity |
| **C** Reconciliation-only | No direct enqueue | Reconcile scans measurements | Delayed | Batch | Too slow alone |
| **D Hybrid** A + C | Direct + nightly reconcile | Both paths idempotent | Reconcile repairs misses | Mixed | **RECOMMENDED** |

## OPTIONS — Publication handoff

| Option | Summary | Verdict |
|--------|---------|---------|
| **A** Enqueue `BATTERY_PUBLICATION_UPDATE` post-assessment persist | One job per `persistedAssessmentId`; policy in publication service | **RECOMMENDED primary** |
| **B** Publication reconciliation | Scan assessments without recent publication job | **RECOMMENDED safety net** |
| **C** Hybrid A+B | Normal + repair | **RECOMMENDED** |

## RECOMMENDED OPTION

**Assessment:** Option D — after successful REST measurement persist in `BatteryRestTargetEvaluateHandler`, enqueue `BATTERY_ASSESSMENT_RECOMPUTE` via existing producer infrastructure. Extend `reconcilePendingAssessments()` to include canonical REST measurements without recent assessment.

**Publication:** Option C — after assessment persist, enqueue `BATTERY_PUBLICATION_UPDATE` for **each** `persistedAssessmentId` returned by `BatteryAssessmentService.recomputeLvEstimatedHealth()`. Handler loads assessment and runs `evaluateLvPublicationPolicy()` — no duplicate policy in assessment handler.

## ASSESSMENT JOB IDENTITY (canonical — do not invent `lv-assess:`)

Runtime authority (`battery-v2-job-idempotency.policy.ts`):

```typescript
buildAssessmentJobIdempotencyKey({
  vehicleId,
  assessmentType,
  inputVersion,
})
// → assess:{vehicleId}:{assessmentType}:{inputVersion}
```

Validation requires `BATTERY_ASSESSMENT_RECOMPUTE` keys to use the `assess:` prefix.

### Existing enqueue patterns

| Path | `assessmentType` | `inputVersion` source |
|------|------------------|----------------------|
| Legacy snapshot rest (`BatteryV2SnapshotIngestionService.enqueueLvAssessmentRecompute`) | `LV_HEALTH` | `capture.capturedAt.getTime()` |
| Reconciliation (`reconcilePendingAssessments`) | `LV_HEALTH` | `batteryFeatures.updatedAt.getTime()` |

`BatteryAssessmentRecomputeHandler` does **not** consume `inputVersion` for computation — it triggers full `recomputeLvEstimatedHealth()`. `inputVersion` is the **idempotency / dedup anchor** for job identity and replay semantics.

### PROPOSED canonical REST handoff (SPEC REQUIRED)

| Field | Proposal | Status |
|-------|----------|--------|
| `assessmentType` | `LV_HEALTH` | **CONFIRMED** — matches legacy + reconciliation |
| `inputVersion` | **Candidate A:** `persistedMeasurement.id` (unique per REST completion) | **PROPOSED** — best deterministic replay per measurement |
| | **Candidate B:** `persistedMeasurement.observedAt.getTime()` | **PROPOSED** — aligns with legacy capture-time pattern; collision risk if multiple same-ms |
| | **Candidate C:** composite `{restWindowId}:{targetSuffix}:{measurement.id}` encoded as string | **PROPOSED** — explicit REST anchor binding |

**Recommendation pending spec sign-off:** Candidate A (`measurement.id`) — preserves one-job-per-canonical-REST-measurement without inventing a new prefix or assessment type. Reconciliation must use a consistent rule when scanning stale measurements.

**Why:** Assessment recomputation reads all LV measurements; `inputVersion` only names the triggering input change for idempotent enqueue. Using the persisted measurement primary key matches the atomic unit of REST completion.

## PUBLICATION JOB IDENTITY

Runtime authority:

```typescript
buildPublicationJobIdempotencyKey({
  assessmentId,
  publicationVersion,
})
// → pub:{assessmentId}:v{publicationVersion}
```

`BatteryPublicationUpdateHandler` passes `publicationVersion` from payload (optional). `BatteryPublicationRepository.persistLvPublication` defaults `publicationVersion ?? 1`.

### Multiple `persistedAssessmentIds`

`recomputeLvEstimatedHealth()` may persist multiple assessments in one run. Handoff should enqueue **one `BATTERY_PUBLICATION_UPDATE` per persisted assessment ID** — publication policy evaluates each assessment independently.

### `publicationVersion` source (SPEC REQUIRED)

| Source | Status |
|--------|--------|
| Omit from payload → repository default `1` | **CONFIRMED** current fallback |
| Assessment row version field | **NOT CONFIRMED** — no authoritative assessment→publication version contract traced |
| Monotonic publication supersession counter | **PROPOSED** — requires spec before IMPLEMENTATION_READY |

Until `publicationVersion` source is authoritative for canonical handoff, PKG-02 remains **IMPLEMENTATION_SPEC_REQUIRED**.

## REJECTED OPTIONS

- `lv-assess:{vehicleId}:{restTargetId}` — **rejected**; conflicts with `assess:` prefix validation
- `battery-v2-lv-assessment.producer.ts` — **does not exist**; do not reference as current code
- Gating publication enqueue on `publicationEligible` in assessment handler — **rejected**; policy authority is `BatteryPublicationService`
- Reconciliation-only (C alone) — unacceptable latency for Stage 2 cutover
- Legacy snapshot re-enable — contradicts cutover model

## IMPLEMENTATION SURFACE (current code — not target-only)

| Module | Role |
|--------|------|
| `battery-rest-target-evaluate.handler.ts` | Enqueue assessment after measurement persist |
| `battery-assessment-recompute.handler.ts` | Enqueue publication per `persistedAssessmentId` (new) |
| `battery-v2-reconciliation.service.ts` | Canonical measurement scan + publication reconcile |
| `BatteryV2JobProducerService` | Shared enqueue (`enqueue('BATTERY_ASSESSMENT_RECOMPUTE' \| 'BATTERY_PUBLICATION_UPDATE', ...)`) |
| `BatteryV2SnapshotIngestionService.enqueueLvAssessmentRecompute()` | Reference pattern for assessment enqueue (private) |
| `battery-v2-rest-target.producer.ts`, `battery-v2-lv-rest-session.producer.ts` | Existing scoped producer wrappers — assessment may add similar wrapper or inline via `BatteryV2JobProducerService` |

**Target architecture (optional):** dedicated assessment/publication producer wrappers — not required; not current code.

## MIGRATION IMPACT

Optional index on `BatteryMeasurement` (type, vehicleId, createdAt) for reconcile — not strictly required if query bounded.

## FEATURE FLAG PLAN

1. `BATTERY_V2_REST_SHADOW_ENABLED` — ingestion (existing, default OFF)
2. `BATTERY_V2_PUBLICATION_ENABLED` — publication persist (existing, default OFF)
3. New optional `BATTERY_V2_LV_HANDOFF_ENABLED` — shadow handoffs before default ON (recommended)

## TEST PLAN

- Unit: enqueue called once per REST completion (idempotent replay with `assess:` key)
- Integration: REST → assess → pub with flags ON
- Negative: flag OFF → no handoff enqueue
- Reconcile: kill worker after measurement → reconcile recovers
- Publication: policy evaluated only in `BatteryPublicationService` (mock/spy)

## PRODUCTION VALIDATION PLAN

Stage 2 canary: 1–2 orgs, observe assessment + publication rows within 24h of natural REST. No backfill.

## ROLLBACK PLAN

Disable handoff flag; revert to manual/reconcile-only; publication rows unchanged (append-only).

## OBSERVABILITY

Metrics: `battery_lv_handoff_assessment_enqueued`, `battery_lv_handoff_publication_enqueued`, reconcile repair counts.

## RISKS

- Duplicate assessments if idempotency wrong → mitigated by `assess:` keys + DB constraints
- Premature publication policy in wrong layer → mitigated by keeping policy in publication service

## NON-EFFECTS

Does not enable readiness; does not fix timestamp provenance; does not fix HEV authority; does not prove current production outage.

## OPEN QUESTIONS

- Final `inputVersion` candidate selection (A vs B vs C)
- Authoritative `publicationVersion` for canonical handoff
- Exact reconcile cadence vs #1445 reconciliation load
- Whether handoff flag merges into publication flag after soak

## GRAPH IDS

Gaps remain open until runtime merged. `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` remains **PROPOSED** — not VALIDATED.
