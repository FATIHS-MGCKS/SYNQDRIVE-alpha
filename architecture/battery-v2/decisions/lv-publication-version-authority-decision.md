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

## FUTURE_VERSION_BUMP_GOVERNANCE

`LV_PUBLICATION_CONTRACT_VERSION` may bump `1 → 2` only via **intentional publication-contract migration**:

- explicit  
- code-reviewed  
- release-controlled  
- migration/replay-aware  
- documented in Battery V2 authority

Appropriate when maintainers need a **new deterministic publication execution identity for the same `assessmentId`** because publication execution/persistence semantics changed materially.

**No automatic increment mechanism.**

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
- Runtime publication gaps remain open until implementation

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

## STATUS

`VALIDATED` — architecture / contract authority documentation only. **Not** `PRODUCTION_VALIDATED`. Runtime publication handoff, strict payload validation, and central contract usage **not implemented**.
