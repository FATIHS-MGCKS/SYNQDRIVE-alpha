# LV Publication Chain — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001`, `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001`  
**Priority:** P0_ACTIVATION_BLOCKER (Stage-2 cutover — **not** proven active production outage while flags default OFF)  
**Readiness:** PKG-01 **IMPLEMENTATION_READY** (D1/D2/D3 VALIDATED); PKG-02 **IMPLEMENTATION_SPEC_REQUIRED** — blockers: **D4** assessment-track selection, **D5** `publicationVersion` only  
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
  → assessment persisted (BatteryAssessmentService; may be multiple tracks)
  → deterministic assessment-selection authority (SPEC REQUIRED)
  → BATTERY_PUBLICATION_UPDATE for selected assessment(s)
  → BatteryPublicationService.evaluateLvPublicationPolicy()
  → battery_publications row when policy passes
  → canonical.lv reflects publication maturity
```

Plus reconciliation safety net for crash boundaries.

**Publication policy is NOT evaluated in the assessment handler.** The assessment handler must not gate on `publicationEligible`; policy authority remains in `BatteryPublicationService` / `evaluateLvPublicationPolicy()`.

**Do not treat “enqueue every `persistedAssessmentId`” as settled architecture** — see assessment-track authority below.

## OPTIONS — Assessment handoff

| Option | Summary | Idempotency | Crash boundary | BullMQ | Verdict |
|--------|---------|-------------|----------------|--------|---------|
| **A** Direct enqueue from REST handler | Simplest | `buildAssessmentJobIdempotencyKey` | Handler commit → enqueue gap | Standard retry | Good normal path |
| **B** Domain event on measurement create | Decoupled | Event outbox pattern | Needs outbox or txn | Consumer workers | Higher complexity |
| **C** Reconciliation-only | No direct enqueue | Reconcile scans measurements | Delayed | Batch | Too slow alone |
| **D Hybrid** A + C | Direct + periodic reconciliation safety net (cadence SPEC REQUIRED) | Both paths idempotent | Reconcile repairs misses | Mixed | **RECOMMENDED** |

## OPTIONS — Publication handoff

| Option | Summary | Verdict |
|--------|---------|---------|
| **A** Enqueue publication after assessment persist | Policy in publication service | **PROPOSED direction** — requires assessment-selection authority |
| **B** Publication reconciliation | Scan assessments without recent publication job | **RECOMMENDED safety net** |
| **C** Hybrid A+B | Normal + repair | **RECOMMENDED** |

## CURRENT ASSESSMENT TRACK SEMANTICS (runtime trace)

**Tracks:** `LV_ASSESSMENT_TRACKS = ['TELEMETRY', 'WORKSHOP_OVERRIDE']` (`lv-estimated-health-assessment.policy.ts`).

**AUTO selection** (`assessmentTrack` omitted or `'AUTO'`):

```typescript
track === 'AUTO'
  ? canonicalSelection.selectedEvidence.some((row) => isWorkshopType(row.type))
    ? ['WORKSHOP_OVERRIDE', 'TELEMETRY']
    : ['TELEMETRY']
  : [track];
```

When workshop evidence is present, `computeLvEstimatedHealthAssessment()` may persist **two** assessments in one recompute:

| Track | Evidence filter | `publicationEligible` (CANONICAL mode) |
|-------|-----------------|----------------------------------------|
| `WORKSHOP_OVERRIDE` | Workshop types only | `true` when score + confidence sufficient |
| `TELEMETRY` | Non-workshop evidence | `true` when score + confidence sufficient |

**Persistence order:** `for (const assessmentTrack of tracks)` — WORKSHOP_OVERRIDE first, then TELEMETRY when both generated.

**Assessment idempotency (assessment row):** `buildLvEstimatedHealthAssessmentIdempotencyKey({ vehicleId, assessmentTrack, assessmentMode, evidenceFingerprint })` — distinct per track.

**`findLatestLvEstimatedHealth`:** `orderBy: { computedAt: 'desc' }` — **no track filter**. Latest row by time wins; may be TELEMETRY even when WORKSHOP_OVERRIDE exists.

**Publication policy (`evaluateLvPublicationPolicy`):** evaluates the **single assessment passed in** — checks `publicationEligible`, evidence counts, hysteresis, supersession. **No `WORKSHOP_OVERRIDE > TELEMETRY` track ordering.**

**Publication supersession:** `findLatestActiveLvPublication` + `supersedePublicationId` in decision — per-publication-row, not per-track namespace.

**Canonical primary truth (`lv-canonical-battery.resolver.ts`):** `WORKSHOP_MANUAL_EVIDENCE` (direct workshop input) **precedes** `V2_PUBLICATION_STABLE` / `V2_PUBLICATION_PROVISIONAL`. This is **primary truth authority** — separate from publication row / history authority.

**Backfill precedent:** `battery-snapshot-rest-backfill.service.ts` picks `persistedAssessmentIds[length - 1]` (last persisted) for publication — implicit ordering, not documented track policy.

### PRIMARY TRUTH vs PUBLICATION AUTHORITY

| Layer | Current behavior |
|-------|------------------|
| **Primary truth** | Workshop manual evidence > V2 publication > shadow > live > legacy |
| **Publication chain** | One assessment per `BATTERY_PUBLICATION_UPDATE` job; policy on that assessment only |
| **Gap** | Multi-track recompute + multi-enqueue without selection authority → outcome may depend on job order / which assessment is published last |

This is **not** a confirmed current production defect — automatic handoff is absent. It is a **target-architecture spec gap** for PKG-02.

## OPTIONS — Assessment-track selection for publication (SPEC REQUIRED)

| Option | Summary | Verdict |
|--------|---------|---------|
| **A** Select exactly one authoritative assessment before publication enqueue | Explicit track ordering (e.g. WORKSHOP_OVERRIDE over TELEMETRY) requires evidence | **Candidate** — needs authority sign-off |
| **B** Enqueue all assessments; `BatteryPublicationService` resolves track authority before supersession | Policy layer owns ordering | **Candidate** — requires policy extension |
| **C** Separate publication tracks / namespaces | Workshop and telemetry cannot overwrite each other | **Candidate** — schema/history impact |
| **D** Other evidence-backed architecture | — | Open |

**Status: DECISION_NOT_READY** — do not silently choose ordering.

Evaluate against: evidence strength, publication semantics, hysteresis, supersession, deterministic execution, BullMQ ordering independence, multi-replica behavior, canonical primaryTruth semantics, auditability, backwards compatibility.

## RECOMMENDED OPTION (handoff architecture — partial)

**Assessment:** Option D — after successful REST measurement persist in `BatteryRestTargetEvaluateHandler`, enqueue `BATTERY_ASSESSMENT_RECOMPUTE` via existing producer infrastructure. Extend `reconcilePendingAssessments()` to include canonical REST measurements without recent assessment.

**Publication:** Option C hybrid — after assessment persist, enqueue publication job(s) per **deterministic assessment-selection authority** (SPEC REQUIRED). `BatteryPublicationService` evaluates policy per job. Reconciliation safety net for missed handoffs.

**Not settled:** which assessment(s) receive publication enqueue when recompute yields multiple tracks.

## REST HANDLER CRASH BOUNDARY (PKG-01 — VALIDATED D2)

**Decision:** `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` — **Hybrid C+ crash recovery** (not `PRODUCTION_VALIDATED`)

Current handler behavior (insufficient):

```typescript
if (hasMeasurement) {  // bool — any BatteryMeasurement of target type
  await this.updateTargetMetadata(session, restTargetType, { status: COMPLETED, ... });
  return; // no row load, no handoff ensure, may overwrite MISSED/FAILED
}
```

**Failure mode:** handoff-eligible measurement persisted → crash before enqueue → retry → bool true → COMPLETED without handoff.

**Current code risk:** synthetic terminal measurements (`persistMissedMeasurement`, `persistStatusMeasurement`) also satisfy `hasMeasurement` — replay must not hand off or convert MISSED/FAILED → COMPLETED. Production frequency UNKNOWN.

### SELECTED architecture (Hybrid C+)

1. **Direct normal handoff** — primary path after **handoff-eligible** measurement persist  
2. **Direct retry repair** — load row; handoff only if `CANONICAL_ASSESSMENT_HANDOFF_ELIGIBLE_MEASUREMENT` (`provenance.sourceObservationId` present)  
3. **Periodic reconciliation safety net** — same D1 identity + `sourceEntityId` correlation  
4. **Durable target-scoped handoff state** — monotonic `MISSING < ENQUEUED < EXECUTED`; concurrency-safe merge

### Handoff eligibility

| Path | `sourceObservationId` | Handoff? |
|------|----------------------|----------|
| Selected-observation `evaluateAndPersist` | present | YES |
| `persistMissedMeasurement` | absent | NO → preserve MISSED |
| `persistStatusMeasurement` (unsupported) | absent | NO → preserve FAILED |

`quality === MISSED` alone does not prove synthetic terminal — use provenance.

### Retry path contract

```
load BatteryMeasurement row
  → if handoff-eligible: ensureAssessmentHandoff(measurement.id) → COMPLETED
  → if synthetic missed: preserve MISSED, no handoff
  → if synthetic unsupported: preserve FAILED, no handoff
```

### Canonical correlation (D1 + D2)

```typescript
inputVersion: measurement.id      // job identity (D1)
sourceEntityId: measurement.id  // handoff ack correlation (D2)
```

Assessment handler: `sourceEntityId` → load measurement → verify org/vehicle → resolve session + REST target → write EXECUTED outcome. Legacy jobs without measurement `sourceEntityId` must not mutate canonical handoff metadata.

### Monotonic state + concurrency

- `EXECUTED` terminal — never regress to ENQUEUED/MISSING  
- Late ENQUEUED no-op when already EXECUTED (worker may beat producer)  
- Target-scoped concurrency-safe metadata merge required for multi-replica safety

### ENQUEUED / EXECUTED ack

- **ENQUEUED:** only after producer success or confirmed in-flight duplicate (`jobId` returned — not `null`)  
- **EXECUTED:** after `recomputeLvEstimatedHealth()` — `ASSESSMENT_PERSISTED` | `POLICY_SKIPPED` | `UNSUPPORTED`

See `decisions/lv-assessment-crash-boundary-decision.md`.

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

### Canonical REST handoff — inputVersion (VALIDATED)

**Decision:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` — `inputVersion = persisted BatteryMeasurement.id`

| Field | Value | Status |
|-------|-------|--------|
| `assessmentType` | `LV_HEALTH` | **CONFIRMED** — matches legacy + reconciliation |
| `inputVersion` | `persistedMeasurement.id` | **VALIDATED** (D1) — one job per canonical REST measurement |

**Semantic contract:** `inputVersion` is the stable identity of the concrete persisted `BatteryMeasurement` whose successful creation triggered assessment recompute — **not** model version, timestamp provenance, trip identity, or rest-window identity.

**Rejected for job identity:** `measurement.observedAt`; `tripId` / `sessionId` / `restWindowId` alone; composite `restWindowId + target + measurementId`.

**Legacy path:** snapshot ingestion may continue `capture.capturedAt.getTime()` for existing identities — no re-keying.

**Runtime availability:** `BatteryRestTargetEvaluateHandler` receives `result.measurementId` from `evaluateAndPersist()` at the intended handoff boundary (enqueue not implemented).

See `decisions/lv-assessment-input-version-decision.md`.

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

`recomputeLvEstimatedHealth()` may persist **multiple** assessments (WORKSHOP_OVERRIDE + TELEMETRY) in one run. Publication handoff requires **deterministic assessment-selection authority** before enqueue — not “every persisted ID” as settled design.

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
| `battery-assessment-recompute.handler.ts` | Candidate publication handoff after deterministic assessment-selection authority (SPEC REQUIRED; new) |
| `battery-v2-reconciliation.service.ts` | Canonical measurement scan + publication reconcile |
| `BatteryV2JobProducerService` | Shared enqueue (`enqueue('BATTERY_ASSESSMENT_RECOMPUTE' \| 'BATTERY_PUBLICATION_UPDATE', ...)`) |
| `BatteryV2SnapshotIngestionService.enqueueLvAssessmentRecompute()` | Reference pattern for assessment enqueue (private) |
| `battery-v2-rest-target.producer.ts`, `battery-v2-lv-rest-session.producer.ts` | Existing scoped producer wrappers — assessment may add similar wrapper or inline via `BatteryV2JobProducerService` |

**Target architecture (optional):** dedicated assessment/publication producer wrappers — not required; not current code.

## MIGRATION IMPACT

Optional index on `BatteryMeasurement` (type, vehicleId, createdAt) for reconcile — not strictly required if query bounded.

## FEATURE FLAG PLAN

### Target architecture (D3 VALIDATED — `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001`)

| Flag / mechanism | Target status |
|------------------|---------------|
| Canonical V2 REST + assessment handoff | **Mandatory core** — not gated by separate HANDOFF flag |
| `BATTERY_V2_PUBLICATION_ENABLED` | **RETAINED** — customer/publication **effect gate** |
| `BATTERY_V2_REST_SHADOW_ENABLED` | **RETIRED at M4** — until then: **temporary migration scaffold** (current runtime only) |
| Legacy REST capture | **RETIRED at M4** — until then: **temporary migration scaffold** |
| `BATTERY_V2_LV_HANDOFF_ENABLED` | **REJECTED / NOT TO BE INTRODUCED** |

**Target steady states:**

| State | V2 REST | Handoff | Assessment | Publication (customer) |
|-------|---------|---------|------------|------------------------|
| **A** | ON | ON | ON | OFF |
| **B** | ON | ON | ON | ON |

State A = preferred pre-publication internal validation posture.

### Current runtime (facts — unchanged by D3 documentation)

1. `BATTERY_V2_REST_SHADOW_ENABLED` — gates canonical REST ingestion (default OFF; historical name “shadow”)
2. `BATTERY_V2_PUBLICATION_ENABLED` — publication persist (default OFF)
3. `BATTERY_V2_LV_HANDOFF_ENABLED` — **does not exist**

**Authority:** flags are **process.env / deployment-scoped** — not per-organization. Vehicle policy eligibility is separate.

## LV FEATURE-FLAG STATE MACHINE (current runtime)

Runtime authority (`battery-health-v2.config.ts`):

```typescript
isBatteryV2LegacyRestCaptureEnabled():
  if REST_SHADOW == false → legacy capture TRUE
  if REST_SHADOW == true  → legacy capture = !PUBLICATION_ENABLED
```

| REST_SHADOW | PUBLICATION | Legacy capture | Canonical REST ingestion | Notes |
|-------------|-------------|----------------|--------------------------|-------|
| OFF | OFF | **ON** | OFF | Default production posture |
| OFF | ON | **ON** | OFF | Publication flag alone does not enable canonical REST |
| ON | OFF | **ON** | ON | Dual authority — canonical + legacy both active |
| ON | ON | **OFF** | ON | Stage-2 cutover — legacy capture disabled |

**Separate dimensions (do not conflate):**

| Dimension | Authority |
|-----------|-----------|
| **GLOBAL ENV FLAG** | `BATTERY_V2_*` process.env on deployment/replica |
| **VEHICLE POLICY ELIGIBILITY** | `resolveForVehicle()` / drive profile / REST policy |
| **ORG-SCOPED ROLLOUT TARGETING** | **Not identified in current runtime** — no org allowlist for publication/handoff flags |

## LV FEATURE-FLAG STATE MACHINE (current runtime — not target)

Runtime authority (`battery-health-v2.config.ts`):

```typescript
isBatteryV2LegacyRestCaptureEnabled():
  if REST_SHADOW == false → legacy capture TRUE
  if REST_SHADOW == true  → legacy capture = !PUBLICATION_ENABLED
```

| REST_SHADOW | PUBLICATION | Legacy capture | Canonical REST ingestion | Notes |
|-------------|-------------|----------------|--------------------------|-------|
| OFF | OFF | **ON** | OFF | Default production posture |
| OFF | ON | **ON** | OFF | Publication flag alone does not enable canonical REST |
| ON | OFF | **ON** | ON | **Dual authority** — canonical + legacy both active |
| ON | ON | **OFF** | ON | Stage-2 cutover posture under current flags |

**Target (post-M4):** REST_SHADOW removed; legacy removed; V2 core always on for eligible vehicles; PUBLICATION=OFF means internal V2 without customer publication.

**Separate dimensions (do not conflate):**

| Dimension | Authority |
|-----------|-----------|
| **GLOBAL ENV FLAG** | `BATTERY_V2_*` process.env on deployment/replica |
| **VEHICLE POLICY ELIGIBILITY** | `resolveForVehicle()` / drive profile / REST policy |
| **ORG-SCOPED ROLLOUT TARGETING** | **Not identified in current runtime** |

## CONFIGURATION INVARIANT (VALIDATED D3)

**Decision:** `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` — **Battery V2 single-authority target architecture**

**SELECTED:** V2 REST + assessment handoff + assessment = mandatory core; PUBLICATION = effect gate; REST_SHADOW + legacy = temporary scaffolds until M4; **no** `BATTERY_V2_LV_HANDOFF_ENABLED`.

**REJECTED:**

| Alt | Why |
|-----|-----|
| Permanent REST_SHADOW as final gate | Misleading; canonical REST is normal V2 ingestion |
| `BATTERY_V2_LV_HANDOFF_ENABLED` steady-state gate | Creates incomplete V2 pipeline; D1/D2 define handoff as core |
| Permanent dual Legacy + V2 authority | Split-brain; incompatible with single truth |
| Immediate legacy removal | Unsafe before PKG-01/02 implemented and validated |

Phase 4 options A–D (`CONFIGURATION_INVARIANT_SPEC_REQUIRED`) are **superseded by D3** for architecture authority. See `decisions/lv-single-authority-cutover-decision.md`.

### Migration phases (M0–M4)

| Phase | Summary |
|-------|---------|
| M0 | Current — legacy + REST_SHADOW scaffold |
| M1 | PKG-01 implementation (D1/D2/D3) — no legacy/REST_SHADOW removal |
| M2 | PKG-02 after D4/D5 — publication chain; PUBLICATION OFF where needed |
| M3 | Validation/soak — no invented PRODUCTION_VALIDATED |
| M4 | Single-authority cutover — **separate authorization required** |

## HANDOFF FLAG — REJECTED (D3)

`BATTERY_V2_LV_HANDOFF_ENABLED` was proposed in Phase 4. **D3 explicitly rejects introducing this flag.**

Under current runtime, the unsafe trap was: REST_SHADOW=ON + PUBLICATION=ON without canonical handoff running. **D3 resolution:** handoff is V2 core — not independently switchable. Do not add the env var.

## TEST PLAN

- Unit: enqueue called once per REST completion (idempotent replay with `assess:` key)
- Integration: REST → assess → pub with flags ON
- Negative: flag OFF → no handoff enqueue
- Reconcile: kill worker after measurement → reconcile recovers
- Publication: policy evaluated only in `BatteryPublicationService` (mock/spy)

## PRODUCTION VALIDATION PLAN

### Canary scope (corrected)

**Do not claim 1–2-org canary** — current Battery V2 flags are deployment `process.env` values with **no org-scoped publication/handoff authority** identified.

| Mechanism | Status | Notes |
|-----------|--------|-------|
| **A — Canary environment / deployment** | **RECOMMENDED** | Separate deployment or release with flags ON; route selected fleet traffic there |
| **B — Future org allowlist / rollout targeting** | **SPEC REQUIRED** | Would need explicit org-scoped flag or routing layer — not in runtime today |
| **C — Other verified isolation** | Open | Must be evidence-backed |

### Handoff liveness vs policy outcome (PKG-01 / PKG-02)

Do **not** use assessment/publication **row existence** as the sole handoff success criterion. Policy may legitimately skip persistence.

**PKG-01 validation dimensions:**

| Dimension | Criterion |
|-----------|-----------|
| `HANDOFF_ENQUEUE` | Deterministic `BATTERY_ASSESSMENT_RECOMPUTE` job created (`assess:` idempotency key) |
| `HANDOFF_EXECUTION` | Job executed exactly / idempotently as intended |
| `ASSESSMENT_POLICY_OUTCOME` | `PERSISTED` \| `SKIPPED_INSUFFICIENT_DATA` \| `UNSUPPORTED` \| other explicit policy outcome (`recomputeLvEstimatedHealth()` may return `ok: false` with empty `persistedAssessmentIds`) |
| `ASSESSMENT_ROW` | Required **only** when assessment policy says an assessment should persist |

**PKG-02 validation dimensions:**

| Dimension | Criterion |
|-----------|-----------|
| `PUBLICATION_HANDOFF_ENQUEUE` | Deterministic `BATTERY_PUBLICATION_UPDATE` job for authoritative selected assessment (`pub:` key) |
| `PUBLICATION_HANDOFF_EXECUTION` | Job executed |
| `PUBLICATION_POLICY_OUTCOME` | `PERSIST` \| `SKIP` / `NOT_ELIGIBLE` \| supersession decision per `evaluateLvPublicationPolicy()` |
| `PUBLICATION_ROW` | Required **only** when `evaluateLvPublicationPolicy().shouldPersistPublication === true` |

`BatteryPublicationService.updateLvPublication()` may return `ok: true` with `persistedPublicationId: null` when `shouldPersistPublication === false`. **A valid policy skip is NOT a handoff-liveness failure.**

### Observation window (not SLA)

Use a descriptive **observation window** (e.g. 24h post-REST) for correlating natural REST events with downstream jobs/rows — **not** as PASS/FAIL correctness SLA unless an explicit product SLA exists. Direct handoff validation uses **job/queue liveness semantics** (enqueue + execute + idempotent replay), not invented time deadlines.

No backfill.

## ROLLBACK PLAN

### Pre-M4 (migration period — legacy scaffold still present)

1. **Disable `BATTERY_V2_PUBLICATION_ENABLED` first** → `isBatteryV2LegacyRestCaptureEnabled()` restores legacy capture when `REST_SHADOW` is ON
2. **Verify legacy path restoration** (legacy snapshot rest capture + `enqueueLvAssessmentRecompute` pattern)
3. **`BATTERY_V2_REST_SHADOW_ENABLED` may remain ON** for canonical ingestion during migration

**No `BATTERY_V2_LV_HANDOFF_ENABLED`** — rejected by D3.

### Post-M4 (after legacy + REST_SHADOW physically removed)

Rollback = **deploy previous known-good release** (or explicit release rollback mechanism) — **not** legacy env toggle.

See `decisions/lv-single-authority-cutover-decision.md`.

**Explicit:** `HANDOFF OFF` alone is **NOT** a safe Stage-2 rollback while `PUBLICATION` stays ON.

If future flag logic changes (e.g. configuration invariant Option B/C), update this sequence accordingly.

Rollback does **not** delete historical `BatteryPublication` rows — records remain audit-preserved. Supersession may **UPDATE** an existing publication row's `reason` metadata per current `markPublicationSuperseded()` repository behavior. Do **not** describe `BatteryPublication` as strictly append-only.

## OBSERVABILITY

Metrics: `battery_lv_handoff_assessment_enqueued`, `battery_lv_handoff_publication_enqueued`, reconcile repair counts.

## RISKS

- Duplicate assessments if idempotency wrong → mitigated by `assess:` keys + DB constraints
- Premature publication policy in wrong layer → mitigated by keeping policy in publication service

## NON-EFFECTS

Does not enable readiness; does not fix timestamp provenance; does not fix HEV authority; does not prove current production outage.

## OPEN QUESTIONS

- **Canonical publication assessment-track selection authority** (WORKSHOP_OVERRIDE vs TELEMETRY when both publicationEligible) — **D4**
- Authoritative `publicationVersion` for canonical handoff — **D5**
- Configuration invariant — **VALIDATED D3** (`BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001`)
- Exact reconcile cadence vs #1445 reconciliation load
- Whether handoff flag merges into publication flag after soak
- Org-scoped rollout targeting (if desired) — **SPEC REQUIRED**; not available via current flags

## GRAPH IDS

Gaps remain open until runtime merged. `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` remains **PROPOSED** — not VALIDATED.
