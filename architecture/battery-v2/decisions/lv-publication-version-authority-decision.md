# D5 — LV Publication Version Authority

**Decision ID:** `BAT-V2-DEC-LV-PUBLICATION-VERSION-AUTHORITY-001`  
**Package:** `BAT-V2-RUNTIME-PKG-02` (spec closure only — no runtime implementation)  
**Depends on:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (D1), `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` (D2), `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` (D3), `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001` (D4)  
**Refines:** `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` (PROPOSED — not elevated to validated dependency)  
**Status:** `VALIDATED` (architecture / contract authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-02

## BEFORE

Phase 4 left PKG-02 `IMPLEMENTATION_SPEC_REQUIRED` with **D5** `publicationVersion` unresolved. `buildPublicationJobIdempotencyKey` accepts `publicationVersion`, but no central canonical source existed. `BatteryPublicationRepository.persistLvPublication` defaulted `publicationVersion ?? 1`. `LV_PUBLICATION_POLICY_VERSION = '1.0.0'` (semver string) coexisted with `BatteryPublication.version Int @default(1)` without explicit separation. Central `validateBatteryV2JobPayload()` did not preserve `BATTERY_PUBLICATION_UPDATE`-specific fields.

## PROBLEM

- Canonical publication job identity requires deterministic `publicationVersion` before enqueue  
- Repository default `?? 1` is too late to invent BullMQ identity  
- Risk of conflating policy semver, assessment model version, job envelope version, and publication contract generation  
- Risk of mutable counters, retry increments, or D4 track transitions driving version bumps  
- Confirmed payload validation strips `assessmentId` / `publicationVersion` at producer boundary today

## CURRENT_CODE

| Mechanism | Current behavior (main at decision time) |
|-----------|------------------------------------------|
| Job idempotency key | `buildPublicationJobIdempotencyKey({ assessmentId, publicationVersion })` → `pub:{assessmentId}:v{publicationVersion}` |
| Payload type | `BatteryPublicationUpdatePayload` — optional `assessmentId`, optional `publicationVersion` |
| Producer | `BatteryV2JobProducerService.enqueue()` → `validateBatteryV2JobPayload()` → `queue.add(payload)` |
| Validation switch | Handles OBSERVATION_CLASSIFY, LV_REST_SESSION_OPEN, REST_TARGET_EVALUATE, START_PROXY_EXTRACT; **default returns base only** — strips publication fields |
| Handler | `BatteryPublicationUpdateHandler` — missing `assessmentId` → skip; `Number(publicationVersion)` when present |
| Repository | `const version = input.publicationVersion ?? 1`; persists `BatteryPublication.version` + `idempotencyKey` via same builder |
| Prisma | `BatteryPublication.version Int @default(1)`; `@@unique([organizationId, vehicleId, idempotencyKey])` |
| Policy provenance | `LV_PUBLICATION_POLICY_VERSION = '1.0.0'`; comment: "Bump when publication gates or hysteresis change"; stored in `decision.policyVersion` / reason payload |
| Job envelope | `BATTERY_V2_JOB_MODEL_VERSION_DEFAULT = '1.0.0'` — separate from publication contract |
| Validation tests | `battery-v2-job.validation.spec.ts` — non-special job types tested for **base fields only**; no assertion on publication-specific fields |
| Automatic enqueue | Absent — production impact/frequency **UNKNOWN**; not a demonstrated live outage |

**No canonical automatic publication handoff exists.** Runtime gaps remain open.

## VERSION_TAXONOMY

Four distinct version axes — **must remain separate**:

| Axis | Authority | Current example | Meaning |
|------|-----------|-----------------|---------|
| **A — Battery V2 job model version** | `BATTERY_V2_JOB_MODEL_VERSION_DEFAULT` | `'1.0.0'` | Job envelope / payload contract version |
| **B — Assessment model version** | `BatteryAssessment` / `LvEstimatedHealthAssessment.modelVersion` | per assessment row | Assessment calculation semantics — new assessment → new `assessmentId` |
| **C — LV publication policy version** | `LV_PUBLICATION_POLICY_VERSION` | `'1.0.0'` | Semantic policy provenance (`decision.policyVersion`, reason payload) |
| **D — LV publication contract version** | **`LV_PUBLICATION_CONTRACT_VERSION` (D5)** | **`1` (integer)** | Publication execution / idempotency generation for a given assessment |

**Do not map** `LV_PUBLICATION_POLICY_VERSION` into `publicationVersion`. `Number('1.0.0')` is not a valid integer contract. Policy provenance already has `decision.policyVersion` → `reason.policyVersion`.

## OPTIONS

| Option | Summary |
|--------|---------|
| **A** | Assessment model version |
| **B** | `LV_PUBLICATION_POLICY_VERSION` semver |
| **C** | Monotonic vehicle publication counter |
| **D** | Supersession count |
| **E** | Retry / reconciliation attempt number |
| **F** | Timestamp / `requestedAt` |
| **G** | D4 authority epoch number |
| **H** | Repository `?? 1` as canonical source |
| **I** | **Central numeric publication contract generation** |

## SELECTED

**I — Central numeric LV publication contract generation**

```
LV_PUBLICATION_CONTRACT_VERSION = 1   // integer
```

Canonical publication job identity:

```
pub:{assessmentId}:v1
```

Example: `assessmentId = abc` → `pub:abc:v1`

## SEMANTIC_CONTRACT

`publicationVersion` identifies the **version/generation of the canonical LV publication execution / idempotency contract** for a **specific assessment**.

Purpose: same `assessmentId` + same publication contract generation → same deterministic publication identity.

Direct handoff, retry, and reconciliation for the same assessment under the same contract **must converge** on the same key.

`publicationVersion` is **not**:

- vehicle publication sequence  
- count of previous publications  
- supersession number  
- retry attempt  
- reconciliation attempt  
- BullMQ attempt number  
- timestamp  
- publication maturity transition  
- assessment track transition  
- D4 authority epoch number  
- random/nonce value

Normal evolution:

```
assessment A → pub:A:v1
assessment B → pub:B:v1
```

Does **not** require `v1 → v2` across assessments.

## CANONICAL_VALUE

```
LV_PUBLICATION_CONTRACT_VERSION = 1
```

Intentionally stable for ordinary assessments, publications, retries, reconciliation, supersession, and D4 authority transitions.

## JOB_IDENTITY

Future PKG-02 canonical producers **must explicitly** use:

```typescript
const publicationVersion = LV_PUBLICATION_CONTRACT_VERSION;

const idempotencyKey = buildPublicationJobIdempotencyKey({
  assessmentId,
  publicationVersion,
});

enqueue('BATTERY_PUBLICATION_UPDATE', {
  ...
  assessmentId,
  publicationVersion,
  idempotencyKey,
});
```

Same authority for:

- direct assessment → publication handoff  
- publication reconciliation  
- same-assessment retry / repair

No producer may independently calculate a different version.

**Do not rely on omission/defaulting** when building canonical jobs.

## REPOSITORY_CONTRACT

Current:

```typescript
const version = input.publicationVersion ?? 1;
```

Compatible with D5 initial value `1`.

**But:** repository `?? 1` is a **compatibility fallback** for direct service calls — **not** the canonical BullMQ identity source. Job idempotency identity must be known **before** enqueue.

Repository persists:

- `BatteryPublication.version`  
- `idempotencyKey` from `buildPublicationJobIdempotencyKey`

## RETRY_RECONCILIATION

Same selected `assessmentId` + same contract generation:

| Path | Identity |
|------|----------|
| direct | `pub:A:v1` |
| retry | `pub:A:v1` |
| reconcile | `pub:A:v1` |

Retry **must not** produce `pub:A:v2` merely because it is attempt 2.

Reconciliation **must not** increment version.

D5 does **not** claim exactly-once execution. Contract: at-least-once execution + deterministic job identity + DB idempotency.

## D4_INTERACTION

D4 track authority and D5 `publicationVersion` are **orthogonal**.

```
WORKSHOP_OVERRIDE selected, assessmentId = W  → pub:W:v1
later TELEMETRY selected, assessmentId = T    → pub:T:v1
```

Do **not** increment `publicationVersion` because:

- assessment track changed  
- publication authority epoch changed  
- equal-value provenance transition occurred  
- UNKNOWN → known transition occurred

Changed `assessmentId` carries the new publication carrier. D5 remains publication **contract generation**.

## PUBLICATION_IDENTITY_VS_LIFECYCLE

**Invariant:** publication **contract identity** ≠ publication **lifecycle state**.

`publicationVersion` versions the execution / persistence / idempotency **contract generation** for a given assessment. It does **not** version:

- publication maturity (PROVISIONAL, STABLE, STALE, SUPERSEDED, …)  
- lifecycle revision  
- stale transition  
- supersession metadata state  
- publication status update  
- number of reevaluations  

Therefore:

```
same assessmentId + same LV_PUBLICATION_CONTRACT_VERSION
→ same publication contract identity
```

Example: `assessmentId = A`, contract version `1` → identity **`pub:A:v1`**.

That identity does **not** become `pub:A:v2` merely because lifecycle state changes.

## SAME_IDENTITY_STATE_TRANSITION

### Timeline example (same assessment, same contract generation)

| Time | Assessment | Contract | Lifecycle maturity | Contract identity |
|------|------------|----------|-------------------|-------------------|
| T0 | A | 1 | PROVISIONAL | `pub:A:v1` |
| T1 | A | 1 | STABLE | `pub:A:v1` |
| T2 | A | 1 | STALE | `pub:A:v1` |

No version increment is allowed solely because maturity/lifecycle changed.

If a lifecycle transition for the **same** assessment identity is intended to be persisted, it must use **same identity + lifecycle materialization** semantics — **not** a `publicationVersion` increment.

**PROVISIONAL → STABLE nuance:** Do **not** assert current runtime necessarily performs a separate persisted PROVISIONAL→STABLE mutation for the exact same assessment unless code evidence proves that path. Use STALE and SUPERSEDED as concrete current-code evidence where available.

## CREATE_IDEMPOTENCY_VS_STATE_IDEMPOTENCY

Two distinct idempotency concerns:

| Concern | Meaning | Valid convergence |
|---------|---------|-------------------|
| **A — Idempotent artifact creation retry** | CREATE for `pub:A:v1` when row already exists with required state | P2002 → return existing row **when desired state already materialized** |
| **B — Lifecycle state transition** | Same `pub:A:v1` identity; requested maturity/state differs from stored row | Must **update/materialize** lifecycle on existing identity |

**Rule:** For the **same** publication contract identity, P2002 → find existing row is sufficient for idempotent CREATE retry **only when** the desired publication artifact already represents the required state.

P2002 **must not** automatically be interpreted as: *"the requested lifecycle transition was persisted."*

**Example:**

```
existing:  pub:A:v1, maturity = STABLE
requested: pub:A:v1, maturity = STALE
CREATE → P2002 → returns existing STABLE row
```

That does **not** prove STALE was persisted.

**IDENTITY idempotency does not eliminate STATE-TRANSITION idempotency.**

Retry/recovery: if intended state is already materially present, existing-row convergence is valid. If intended state differs, retry/recovery must ensure lifecycle transition is durably applied.

## STALE_LIFECYCLE

**STALE** is a publication **lifecycle state**, not a new publication contract generation.

```
STABLE pub:A:v1  →  STALE pub:A:v1   ✓
STABLE pub:A:v1  →  pub:A:v2         ✗  (solely for staleness)
```

### Current-code evidence (CONFIRMED)

`evaluateLvPublicationPolicy()` — when `evaluateStalePrevious(previous, now)` is true:

- returns `maturity: 'STALE'`  
- returns `shouldPersistPublication: true`  

`BatteryPublicationService.updateLvPublication()` — when `shouldPersistPublication === true`:

- calls `persistLvPublication({ assessmentId, publicationVersion, decision, ... })`

`BatteryPublicationRepository.persistLvPublication()`:

- builds `idempotencyKey = pub:{assessmentId}:v{publicationVersion}`  
- performs **CREATE**  
- on P2002 → `findFirstOrThrow` existing row by idempotency key  

**Lifecycle-persistence gap:** If `pub:A:v1` already exists (e.g. STABLE) and policy later requests STALE persistence for the same assessment/version, the create-on-conflict path may return the **existing row without materializing** the new lifecycle state.

**Production impact/frequency:** UNKNOWN.

PKG-02 must ensure STALE (and other same-identity lifecycle transitions) become durably observable on the existing publication identity or through an equivalent deterministic lifecycle-state mechanism.

## SUPERSEDED_PRECEDENT

Current `markPublicationSuperseded()`:

- **updates** the existing `BatteryPublication` row `reason` payload  
- sets `maturity: 'SUPERSEDED'` in reason JSON  
- does **not** increment `publicationVersion`  

This demonstrates publication lifecycle metadata can change while contract identity/version remains stable.

**Precedent only** — not a claim that all lifecycle transitions must use this exact method.

### D4 interaction (lifecycle vs new assessment)

**Case A — new authoritative assessment (D4):**

```
old: assessment T → pub:T:v1
new: assessment W → pub:W:v1
```

New publication identity because `assessmentId` changed. D4 may supersede old publication. No `publicationVersion` increment required.

**Case B — same assessment lifecycle change:**

```
assessment A, pub:A:v1 STABLE
later: same assessment A, pub:A:v1 STALE
```

Same contract identity + lifecycle transition. **Not** new D4 track authority, not new assessment, not new publication contract generation.

## TARGET_PERSISTENCE_MODEL

Conceptual PKG-02 target (exact repository API is implementation detail):

| Scenario | Action |
|----------|--------|
| New publication contract artifact (new `assessmentId` or approved new contract generation) | Create / idempotent-create publication identity (`pub:A:v1`, `pub:B:v1`, `pub:A:v2` after approved replay) |
| Same-identity lifecycle transition (`pub:A:v1` STABLE → STALE) | Update/materialize lifecycle state on **existing** publication identity |
| Create conflict on same identity | **Not** sufficient proof of lifecycle transition success |

Do **not** prescribe DB migration unless implementation evidence proves one is required.

## PREVIOUS_LIFECYCLE_IDENTITY_ISOLATION

**Invariant:** A publication lifecycle decision must apply to the publication identity that the decision describes.

```
STALE(previous publication A)  →  pub:A:v1
NOT  →  pub:B:v1  merely because B is the current assessment being evaluated
```

### Current-code defect (CONFIRMED)

`BatteryPublicationService.updateLvPublication()`:

1. loads **current** assessment by `input.assessmentId`  
2. loads **previous** active LV publication  
3. maps previous to `LvPublicationPreviousState`  
4. calls `evaluateLvPublicationPolicy({ assessment: CURRENT, previous: PREVIOUS })`  
5. on `shouldPersistPublication`, calls `persistLvPublication({ assessmentId: input.assessmentId, ... })`

When previous publication is stale, `evaluateLvPublicationPolicy()` may early-return:

- `maturity: 'STALE'`  
- `shouldPersistPublication: true`  
- `publishedEstimatedHealth: previous.publishedEstimatedHealth`

This decision is semantically about the **previous** publication — but persistence uses `input.assessmentId` (current assessment). **Previous lifecycle decision + current assessment identity can be mixed.**

**Production impact/frequency:** UNKNOWN (automatic handoff absent; publication flag defaults OFF).

### Two logically distinct operations

| Operation | Target | Examples |
|-----------|--------|----------|
| **A — Previous publication lifecycle maintenance** | Previous publication's own identity/row | mark previous STALE; mark previous SUPERSEDED |
| **B — Current candidate publication evaluation** | `pub:{currentAssessmentId}:v1` | normal D4/D5 publication of selected assessment |

These may occur in the same workflow, but identities **must not** be conflated.

**Required semantics (STALE previous + current B):**

1. expire/materialize lifecycle of `pub:A:v1`  
2. evaluate B independently as current candidate  
3. if B passes policy → create/update `pub:B:v1` per D4/D5  

**Forbidden:** STALE decision derived from A → persisted under `assessmentId` B.

## CURRENT_CANDIDATE_AFTER_EXPIRY

**Target contract:** Previous publication expiry must **not** permanently suppress evaluation of the current authoritative assessment.

### Current-code loop risk (CODE-CONDITIONAL)

1. previous publication A becomes STALE  
2. policy early-returns STALE with `shouldPersistPublication: true`  
3. service persists using current assessment B's `assessmentId`  
4. latest active publication may remain/become STALE  
5. future evaluation encounters STALE previous again  

This can loop-block the current candidate from reaching normal publication evaluation.

**Target:** After previous lifecycle maintenance, current candidate remains eligible for its own publication-policy evaluation.

```
expire previous A  →  THEN  evaluate current B
```

(or equivalent deterministic two-phase result). Exact sequencing/API is implementation detail.

### STALE active-row semantics (CURRENT_CODE)

`findLatestActiveLvPublication()` excludes `SUPERSEDED` and superseded IDs, but **does not exclude STALE**. Therefore STALE may remain the "previous active publication."

**D5 target:** STALE may remain useful as historical/lifecycle context, but must **not** behave as an indefinitely authoritative baseline that prevents a newer valid assessment from being evaluated. No stale-authority lock; no provenance rebinding; no cross-track/stale EWMA contamination contrary to D4.

## THREE_LAYER_IDEMPOTENCY_MODEL

D5 distinguishes **three** related but non-interchangeable idempotency layers:

| Layer | Concern | Contract |
|-------|---------|----------|
| **1 — Job / contract identity** | Same `assessmentId` + `publicationVersion` | Same `pub:{assessmentId}:v{n}` identity |
| **2 — Execution idempotency** | Re-running same pub identity | Must **not** re-apply same assessment as new EWMA/hysteresis evidence |
| **3 — Lifecycle state idempotency** | Same pub identity, different maturity | Lifecycle repair (e.g. STABLE → STALE) without version bump |

Layer 1 does not imply layer 2 or 3. Create idempotency (P2002) addresses layer 1 only when desired artifact state is already materialized.

## EXECUTION_IDEMPOTENCY

**Invariant:** Retrying the same publication contract identity must **not** re-apply the same assessment as a new stabilization sample.

Same `assessmentId = A` + `publicationVersion = 1` → same execution identity `pub:A:v1`.

If `pub:A:v1` was already produced from assessment A, retry/reconciliation must **not** treat A again as fresh evidence for:

- EWMA (`stabilize(previous.stabilized, currentScore)`)  
- outlier damping  
- hysteresis evolution (`shouldPublish`)  
- threshold crossing  
- maturity progression caused solely by repeated execution  

### Current-code risk (CONFIRMED)

`BatteryPublicationService` loads latest active publication as `previous` **without** determining whether `previous` row's `assessmentId` equals current `input.assessmentId`.

`LvPublicationPreviousState` omits `assessmentId` (and `assessmentTrack` — see D4).

`evaluateLvPublicationPolicy()` uses `previous.stabilizedEstimatedHealth` in `stabilize(...)` and `previous.publishedEstimatedHealth` in hysteresis — so same-assessment retry can re-feed the same score as a new observation.

**Production frequency:** UNKNOWN.

## SAME_ASSESSMENT_RETRY

### Deterministic distinction

| Case | Signal | Behavior |
|------|--------|----------|
| **NEW ASSESSMENT** | `assessmentId` changes | New `pub:` identity; may enter stabilization/hysteresis per D4 track-epoch rules |
| **SAME-ASSESSMENT RETRY** | same `assessmentId` + same `publicationVersion` | Same pub identity; **no** reapplication as new evidence |

Distinction must use **explicit identity** — not timestamp proximity, job attempt number, latest-row heuristics, or score equality alone.

### Target same-identity retry behavior

If current `assessmentId = A`, contract `v1`, and previous active publication already represents `pub:A:v1`:

- do not re-apply assessment A as new EWMA input  
- do not generate new hysteresis evolution from repeated execution  
- converge on already-materialized result if correct  
- apply only missing lifecycle-state repair if required  

```
same identity + same desired state  →  idempotent no-op/convergence
same identity + missing lifecycle   →  lifecycle repair
NOT:  same identity retry  →  new stabilization sample
```

## SELF_SUPERSESSION_PROHIBITION

**Hard invariant:** A `BatteryPublication` must **never** supersede itself.

Forbidden:

```
supersedePublicationId === persistedPublicationId
```

or: previous publication contract identity === current publication contract identity, followed by self-supersession.

Same-identity retry → supersession is **not** the correct operation. Converge idempotently or repair lifecycle state.

### Current-code self-supersession risk (CODE-CONDITIONAL)

Possible path:

1. existing `pub:A:v1` loaded as `previous`  
2. current assessment is also A  
3. policy produces `shouldPersistPublication: true` and `supersedePublicationId = previous.publicationId` (same row)  
4. `persistLvPublication` CREATE `pub:A:v1` → P2002 → returns existing `pub:A:v1`  
5. `markPublicationSuperseded({ publicationId: previous pub:A:v1, supersededByPublicationId: persisted pub:A:v1 })`  

Result: publication may be marked SUPERSEDED by itself.

**Production frequency:** UNKNOWN. **Not** claimed to have occurred in production.

### Valid supersession contract

Supersession requires **two distinct** publication identities:

```
old: assessment T → pub:T:v1
new: assessment W → pub:W:v1
→ pub:T:v1 SUPERSEDED BY pub:W:v1
```

Required: `oldPublication.id != newPublication.id` (and preferably distinct contract identities). Same `pub:A:v1` must never supersede itself.

### D4 interaction (execution vs authority)

| Case | Semantics |
|------|-----------|
| **A — new assessment / authority** | `pub:T:v1` → `pub:W:v1`; D4 may supersede; supersession may apply |
| **B — same assessment retry** | `pub:A:v1` retry; **not** D4 authority transition; no new stabilization sample; no self-supersession |
| **C — previous stale + new assessment** | STALE applies to A; B evaluated independently |

### Previous assessmentId observability (PKG-02 requirement)

Runtime must have deterministic access to:

- `previousPublicationId`, `previousAssessmentId`, `previousAssessmentTrack`  
- `currentAssessmentId`, `currentAssessmentTrack`  
- `publicationVersion` / contract identity  

To distinguish: same-identity retry vs new assessment (same/different track) vs previous lifecycle maintenance.

Heuristic reconstruction is **forbidden**. Carrier may extend `LvPublicationPreviousState`, use `BatteryPublication.assessmentId` before policy, or equivalent — implementation detail.

### Policy responsibility boundary

`BatteryPublicationService` / `evaluateLvPublicationPolicy` remain sole publication-policy authority. Implementation must supply sufficient identity/lifecycle context for safe distinction of stale-previous maintenance, current-candidate evaluation, same-identity retry, new candidate, and track authority change. Do **not** duplicate publication policy into assessment handler or D4 track arbitration into repository.

## FUTURE_VERSION_BUMP_GOVERNANCE

`LV_PUBLICATION_CONTRACT_VERSION` may bump `1 → 2` only via **intentional publication-contract migration**:

- explicit  
- code-reviewed  
- release-controlled  
- migration/replay-aware  
- documented in Battery V2 authority

Appropriate when maintainers need a **new deterministic publication execution identity for the same `assessmentId`** because publication execution/persistence semantics changed materially.

**No automatic increment mechanism.**

**NOT** appropriate for contract bump:

- STALE, STABLE, PROVISIONAL, SUPERSEDED lifecycle transitions  
- retry, reconciliation  
- D4 track change  
- equal-value authority transition  
- UNKNOWN→known transition  

### Policy version vs contract version

`LV_PUBLICATION_POLICY_VERSION` may change for policy semantics.

`publicationVersion` changes only when a new idempotency/execution generation for the same assessment must intentionally be possible.

```
policyVersion bump  DOES NOT AUTOMATICALLY IMPLY  publicationVersion bump
```

If changed publication semantics require reprocessing an already-processed assessment into a distinct canonical execution, release governance must **deliberately consider** bumping `LV_PUBLICATION_CONTRACT_VERSION`.

### Intentional contract replay (future only)

```
NORMAL RETRY:     assessment A, contract v1 → pub:A:v1  (same identity)
CONTRACT REPLAY:  assessment A, old v1 → pub:A:v1; approved v2 → pub:A:v2
```

No automatic replay/backfill authorized by D5.

## PAYLOAD_VALIDATION_FINDING

**CONFIRMED CURRENT_CODE defect / missing validation contract:**

`validateBatteryV2JobPayload()` has no `BATTERY_PUBLICATION_UPDATE` case. `default:` returns `base` only → **`assessmentId` and `publicationVersion` stripped** before `queue.add`.

`BatteryPublicationUpdateHandler` then sees missing `assessmentId` → skip.

**Production impact/frequency:** UNKNOWN (automatic handoff absent; publication flag defaults OFF). **Not** a demonstrated live production outage.

### Target PKG-02 payload contract (not implemented here)

Canonical `BATTERY_PUBLICATION_UPDATE` jobs:

- `assessmentId` — **required**  
- `publicationVersion` — **required** positive integer contract generation (currently `1`)

Reject at validation: null, missing, NaN, zero, negative, fractional, semver strings (`'1.0.0'`), arbitrary text.

### Validation test blind spot

`battery-v2-job.validation.spec.ts` tests non-special types for base fields only — does not assert preservation of publication-specific fields. PKG-02 **must** add job-specific publication validation tests.

## SOURCE_ENTITY_CORRELATION

Recommended for PKG-02 (implementation detail, not D5 blocker):

- `assessmentId` = selected assessment domain carrier  
- `sourceEntityId` = same selected `assessmentId` where compatible with existing `BatteryV2JobPayloadBase` correlation patterns (D1/D2 precedent)

Exact shape follows existing PKG-02 handoff authority if evidence dictates otherwise.

## REJECTED

| ID | Alternative | Why rejected |
|----|-------------|--------------|
| **A** | Assessment model version | Wrong layer; `assessmentId` already identifies assessment row |
| **B** | `LV_PUBLICATION_POLICY_VERSION` semver | Policy provenance separate; `'1.0.0'` conflicts with DB Int and `Number()` contract |
| **C** | Monotonic vehicle publication counter | Mutable shared state; race conditions; retry/reconcile divergence |
| **D** | Supersession count | History is not job idempotency generation |
| **E** | Retry attempt | Retry must converge on same identity |
| **F** | Timestamp / `requestedAt` | Destroys deterministic replay identity |
| **G** | D4 authority epoch number | Track/provenance via `assessmentId` + D4 semantics |
| **H** | Repository default as canonical source | Repository runs after enqueue; identity must be pre-enqueue |

## WHY

Deterministic direct/retry/reconciliation identity without mutable counters or semantic-layer coupling. Integer contract generation aligns with `BatteryPublication.version Int` and `buildPublicationJobIdempotencyKey`. Policy semver remains independent provenance.

## EXPECTED_EFFECT

- PKG-02 promoted to `IMPLEMENTATION_READY` (architecture spec complete — **not** implemented/deployed/enabled)  
- Implementers have single central `LV_PUBLICATION_CONTRACT_VERSION` authority  
- Payload validation gap documented for PKG-02 implementation  
- Same-identity lifecycle vs contract identity distinguished; create/P2002 lifecycle gap documented  
- Runtime publication gaps remain open until implementation

### PKG-02 implementation contract (architecture — not runtime authorization)

PKG-02 runtime must include:

**D4:** deterministic track arbitration; previous-track observability; `publicationAuthorityEpochChanged`; cross-track stabilization reset; equal-value authority transitions; UNKNOWN→known; retention ≠ fallback.

**D5:** central `LV_PUBLICATION_CONTRACT_VERSION = 1`; explicit version on canonical publication jobs; strict `assessmentId`/`publicationVersion` validation; publication fields preserved at producer boundary; same-assessment retries converge on same `pub:` identity; same-identity lifecycle transitions do **not** increment version; create-idempotency, execution-idempotency, and lifecycle-state-idempotency distinguished; previous lifecycle isolated from current candidate identity; STALE previous cannot loop-block new candidate; same-assessment retry must not re-apply EWMA/hysteresis as new evidence; previous `assessmentId` observability required; self-supersession forbidden; STALE transition durably materialized; SUPERSEDED remains same contract generation.

`IMPLEMENTATION_READY` = architecture/spec complete — **not** implementation exists, stale isolation fixed, retry execution idempotency fixed, self-supersession fixed, current P2002 lifecycle behavior correct, runtime gap closed, publication enabled, deploy authorized, M4 authorized, or production validated.

## NON_EFFECTS

- No runtime implementation  
- No publication enqueue  
- No validation runtime fix  
- No DB migration  
- No feature flag change  
- No production mutation  
- No backfill  
- No deploy  
- No M4 cutover  
- No publication enablement  
- No `PRODUCTION_VALIDATED`  
- `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` remains open  
- `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` remains open  
- `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` remains open

## RISKS

| Risk | Mitigation |
|------|------------|
| Conflating policy semver with contract version | VERSION_TAXONOMY + TEST 7/14 |
| Retry increments version | RETRY_RECONCILIATION + TEST 2/5 |
| Repository default used at enqueue | CANONICAL producer contract + TEST 8 |
| Payload fields stripped at producer | PAYLOAD_VALIDATION_FINDING + TEST 11/12 |
| D4 track change bumps version | D4_INTERACTION + TEST 4 |
| Lifecycle transition bumps version | PUBLICATION_IDENTITY_VS_LIFECYCLE + TEST 15/16 |
| P2002 masks lifecycle transition failure | CREATE_IDEMPOTENCY_VS_STATE_IDEMPOTENCY + TEST 19 |
| Stale previous rebound to current assessmentId | PREVIOUS_LIFECYCLE_IDENTITY_ISOLATION + TEST 21 |
| Same-assessment retry re-applies EWMA | EXECUTION_IDEMPOTENCY + TEST 23/29 |
| Self-supersession on same identity | SELF_SUPERSESSION_PROHIBITION + TEST 25 |

## TEST_CONTRACT

Future PKG-02 tests (minimum):

| Test | Scenario | Expected |
|------|----------|----------|
| **1** | assessment A + contract 1 | `pub:A:v1` |
| **2** | same assessment A: direct + retry + reconciliation | same `pub:A:v1` |
| **3** | new assessment B under same contract | `pub:B:v1`; version does not increment |
| **4** | D4 TELEMETRY → WORKSHOP with new assessment | both `v1`; track change does not increment `publicationVersion` |
| **5** | retry attempt 2 | `publicationVersion` remains `1` |
| **6** | repository persists `BatteryPublication.version = 1` | idempotency key matches job identity version |
| **7** | `policyVersion = '1.0.0'` | retained in reason payload; not converted to `publicationVersion` |
| **8** | canonical producer omits `publicationVersion` | validation rejects |
| **9** | `publicationVersion = '1.0.0'` | validation rejects |
| **10** | `publicationVersion = 0 / -1 / 1.5 / NaN` | validation rejects |
| **11** | `BATTERY_PUBLICATION_UPDATE` with `assessmentId` + `publicationVersion` through central producer validation | both fields preserved |
| **12** | `BATTERY_PUBLICATION_UPDATE` missing `assessmentId` | validation failure before enqueue |
| **13** | same assessment A under deliberately approved future contract v2 | `pub:A:v2` distinct from `pub:A:v1` |
| **14** | policy semver changes without explicit contract generation bump | no implicit `publicationVersion` change |
| **15** | same assessment A STABLE → STALE, `shouldPersistPublication = true` | `publicationVersion` remains `1`; identity `pub:A:v1`; STALE durably materialized; create conflict alone cannot falsely acknowledge transition |
| **16** | `pub:A:v1` STABLE → STALE | no `pub:A:v2` |
| **17** | existing publication marked SUPERSEDED | contract version unchanged |
| **18** | idempotent CREATE retry when desired state already exists on `pub:A:v1` | same `pub:A:v1`; existing state accepted; no duplicate artifact |
| **19** | existing `pub:A:v1` state X; desired lifecycle state Y | existing row identity reused; Y durably applied; returning X unchanged is **not** success |
| **20** | new assessment B | `pub:B:v1`; no lifecycle revision counter; no v2 |
| **21** | STALE previous A + current assessment B | STALE applies to `pub:A:v1`; no STALE(A) under `pub:B:v1`; B eligible for independent evaluation |
| **22** | previous A stale; current B valid/publishable | A lifecycle handled; B can proceed; stale previous cannot indefinitely short-circuit B |
| **23** | same assessment A retry after `pub:A:v1` exists | same identity; A not re-applied as new EWMA sample; no hysteresis evolution from retry alone; no duplicate publication |
| **24** | `pub:A:v1` STABLE → STALE same identity | no new EWMA; no v2; lifecycle repaired to STALE |
| **25** | same `pub:A:v1` execution | `supersedePublicationId` must not equal current/persisted publication; self-supersession impossible |
| **26** | `pub:A:v1` → `pub:B:v1` | A may be superseded by B; `A.id != B.id` |
| **27** | previous row assessment A; current B | deterministic A vs B identity; no heuristic inference |
| **28** | same track; assessment A → B | B is NEW candidate not retry; distinction by assessment identity |
| **29** | repeat same assessment A multiple times | stabilized value does not drift solely from repeated execution |

## STATUS

`VALIDATED` — architecture / contract authority documentation only. **Not** `PRODUCTION_VALIDATED`. Runtime publication handoff, strict payload validation, and central contract usage **not implemented**.
