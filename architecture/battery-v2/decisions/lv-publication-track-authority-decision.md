# D4 — LV Publication Assessment-Track Authority

**Decision ID:** `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001`  
**Package:** `BAT-V2-RUNTIME-PKG-02` (spec closure only — no runtime implementation)  
**Depends on:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (D1), `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` (D2), `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` (D3)  
**Refines:** `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` (PROPOSED — not elevated to validated dependency)  
**Status:** `VALIDATED` (architecture / selection authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-02 (final closure: publication authority epoch + UNKNOWN→known transitions)

## BEFORE

Phase 4 left PKG-02 `IMPLEMENTATION_SPEC_REQUIRED` with two architecture blockers: **D4** assessment-track publication authority and **D5** authoritative `publicationVersion`. AUTO recompute may persist both `WORKSHOP_OVERRIDE` and `TELEMETRY` assessments, but no deterministic rule governed which assessment may enter the LV publication pipeline. Initial D4 closure documented track precedence and current-recompute boundary but left ambiguous retry/reconciliation epoch semantics and cross-track publication stabilization behavior.

## PROBLEM

- Multi-track recompute persists two assessments with distinct `assessmentTrack` values but no publication handoff selector exists today  
- Without explicit track authority, implementers might use `computedAt DESC`, array position, or enqueue every `persistedAssessmentId` — all incorrect  
- Workshop evidence can become stale via existing freshness policy; authority must not be permanent lifetime override  
- Telemetry volume must not outrank a fresh qualified workshop measurement  
- `BatteryPublicationService` evaluates policy for one assessment — track arbitration must precede publication enqueue  
- Same-recompute fallback from rejected `WORKSHOP_OVERRIDE` to `TELEMETRY` would bypass publication-policy authority  
- Retry after crash must not be conflated with frozen arbitration across recomputes when evidence eligibility changes  
- Track transitions (`TELEMETRY` ↔ `WORKSHOP_OVERRIDE`) must not reuse cross-track EWMA/hysteresis baselines  
- Current `LvPublicationPreviousState` does not expose previous `assessmentTrack` — policy cannot distinguish same-track vs cross-track continuity today  
- Equal-value cross-track transition: current `shouldPersistPublication` depends only on `firstPublication || valueChanged` — track change not represented; TELEMETRY 72 → WORKSHOP 72 may leave old TELEMETRY publication active

## CURRENT_CODE

| Mechanism | Current behavior (main at decision time) |
|-----------|------------------------------------------|
| AUTO track generation | `lv-estimated-health-assessment.policy.ts` — if `canonicalSelection.selectedEvidence` contains workshop type → `['WORKSHOP_OVERRIDE', 'TELEMETRY']`; else `['TELEMETRY']` |
| `WORKSHOP_OVERRIDE` evidence | Same file — filters to workshop types only; `BatteryEvidenceStrength.OVERRIDE` |
| Freshness upstream | `lv-evidence-selection.policy.ts` — stale workshop rejected with `STALE_MEASUREMENT`; rejected evidence cannot enter `selectedEvidence` |
| Recompute input | `battery-assessment.service.ts` — `recomputeLvEstimatedHealth()` loads current `listForOrganization` measurements and runs `computeLvEstimatedHealthAssessment()` — **not** frozen to trigger measurement snapshot (D1: `inputVersion` = trigger identity only) |
| Persistence | `battery-assessment.service.ts` — loops `computed.assessments`, pushes each to `persistedAssessmentIds[]` |
| `findLatestLvEstimatedHealth` | `battery-assessment.repository.ts` — `orderBy: { computedAt: 'desc' }`, no `assessmentTrack` filter or ordering |
| Publication reason payload | `battery-publication.repository.ts` — `persistLvPublication()` stores `assessmentTrack` and `assessmentMode` in reason JSON |
| Previous publication state | `battery-publication.repository.ts` `toPreviousState()` → `LvPublicationPreviousState` — carries `publishedEstimatedHealth`, `stabilizedEstimatedHealth`, maturity, timestamps — **no `assessmentTrack`** |
| Publication EWMA/hysteresis | `lv-publication.policy.ts` — `stabilize(input.previous?.stabilizedEstimatedHealth, ...)` and hysteresis compare against `input.previous` values — **no track-change awareness** |
| Publication persistence gate | `lv-publication.policy.ts` — `shouldPersistPublication = maturityAllowsFirstPublish && (firstPublication \|\| valueChanged)` — **no `trackChanged` / `publicationAuthorityEpochChanged`** |
| Equal-value cross-track gap | Current runtime: existing TELEMETRY publication at **72** + new publication-qualified `WORKSHOP_OVERRIDE` at **72** → `valueChanged = false` → `shouldPersistPublication = false` → old TELEMETRY row remains active despite D4 authority change — **CURRENT CODE; not solved** |
| Publication policy | `battery-publication.service.ts` / `evaluateLvPublicationPolicy()` — receives specific `assessmentId`; no track precedence or cross-track epoch boundary |
| Backfill precedent | `battery-snapshot-rest-backfill.service.ts` — `persistedAssessmentIds[length - 1]` for publication candidate |

**No runtime publication handoff or track selector exists.** Gaps `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` and `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` remain open.

## OPTIONS

| Option | Summary |
|--------|---------|
| **A** | Latest-wins / `computedAt` ordering |
| **B** | Publish every persisted assessment track |
| **C** | Permanent workshop override (historical workshop always wins) |
| **D** | Telemetry wins by volume / sample count |
| **E** | `BatteryPublicationService` selects track authority |
| **F** | Same-recompute telemetry fallback after workshop policy SKIP |
| **G** | Cross-track EWMA/hysteresis continuity |
| **H** | **Freshness-conditional deterministic track precedence within current recompute + authority epochs** |

## SELECTED

**H — Freshness-conditional deterministic track precedence** (unchanged core selection)

Canonical precedence:

```
WORKSHOP_OVERRIDE > TELEMETRY
```

**Only** within assessments produced by the **current D4 authority epoch** from **currently selected eligible evidence**.

This is **not** a permanent lifetime override. It is **not** “if any historical workshop assessment exists, workshop always wins.”

## D4_AUTHORITY_EPOCH

**Default authority epoch:** one actual `recomputeLvEstimatedHealth()` invocation and the canonical assessment set produced by that invocation.

**Reason:** D1 states `inputVersion` is **trigger identity**, not a frozen calculation snapshot. A later retry/re-enqueue may execute `recomputeLvEstimatedHealth()` again against a **newer eligible evidence set**. D4 must **not** require a later recompute to preserve the track winner from an earlier computation attempt unless that earlier arbitration has been **durably persisted** as resumable handoff evidence.

### Example — new recompute after crash (required)

**Attempt A (T0):** fresh workshop + fresh telemetry

- Assessments: `WORKSHOP_OVERRIDE`, `TELEMETRY`  
- D4 winner: `WORKSHOP_OVERRIDE`  
- Crash before publication handoff

**Attempt B (T1):** workshop now stale + fresh telemetry

- Fresh recompute produces: `TELEMETRY` only  
- D4 winner for Attempt B: **`TELEMETRY`**

**This is correct.** Not a D4 authority violation. The system remains freshness-driven.

## RETRY_RECONCILIATION_CONTRACT

### A) New assessment recompute during recovery

If retry/reconciliation executes a **new** `recomputeLvEstimatedHealth()`:

- That recompute creates a **new D4 authority epoch**  
- D4 arbitrates its **current** resulting assessment set  
- Current eligibility/freshness applies  
- A different track winner is **allowed** when evidence eligibility changed

### B) Resume already-completed arbitration without recomputing

If future runtime resumes an **already-completed** prior D4 arbitration **without** recomputing:

- Requires **explicit durable correlation / arbitration evidence** (implementation detail for PKG-02)  
- Must **not** reconstruct the winner using historical heuristics

**Forbidden reconstruction methods:**

- `findLatestLvEstimatedHealth()`  
- `computedAt` proximity  
- latest-wins  
- array position / persistence ordering  
- nearest timestamps  
- arbitrary historical active assessment lookup

Do **not** mandate a new DB model in D4. Exact durable receipt/carrier is PKG-02 implementation detail if resume-without-recompute is chosen.

### Distinction (required)

| Recovery mode | Authority |
|---------------|-----------|
| **Retry of same publication handoff** (same selected `assessmentId`, no new recompute) | Preserve same selected assessment authority; no lower-track fallback |
| **New assessment recompute during recovery** | New D4 authority epoch; fresh D4 arbitration result is authoritative |

## TRACK_PRECEDENCE

| Condition | Authoritative track for publication handoff |
|-----------|-------------------------------------------|
| Current epoch includes both `WORKSHOP_OVERRIDE` and `TELEMETRY` | `WORKSHOP_OVERRIDE` |
| Current epoch includes `WORKSHOP_OVERRIDE` only | `WORKSHOP_OVERRIDE` |
| Current epoch includes `TELEMETRY` only | `TELEMETRY` |
| No qualifying canonical assessment | No publication handoff |
| `SHADOW` assessment present | **Never** selected for customer publication authority |

**Persist both ≠ publish both.** Both tracks may remain persisted for diagnostics, comparison, model evaluation, drift analysis, and auditability. D4 governs only which assessment may be handed to the LV publication pipeline.

## FRESHNESS_CONDITIONAL_AUTHORITY

`WORKSHOP_OVERRIDE` outranks `TELEMETRY` **only while** the workshop evidence that caused `WORKSHOP_OVERRIDE` to exist in the **current** epoch remains:

- supported  
- quality-valid  
- provenance-valid  
- freshness-valid  
- otherwise eligible under existing `lv-evidence-selection.policy.ts`

D4 **consumes** existing evidence eligibility/freshness authority. **Do not invent a new workshop TTL in D4.**

### Example (required transition)

**T0:** fresh workshop evidence + fresh telemetry → `WORKSHOP_OVERRIDE` + `TELEMETRY` → authority: `WORKSHOP_OVERRIDE`

**T1:** same workshop evidence now stale + new fresh telemetry → `TELEMETRY` only → authority: `TELEMETRY`

### Volume rejection

**Reject:** “more telemetry samples automatically outrank one fresh workshop measurement.”

Track authority is based on **evidence class + current eligibility + freshness**, **not** raw observation count.

## CURRENT_RECOMPUTE_BOUNDARY

Track arbitration **must** operate on assessments produced/persisted by the **current D4 authority epoch** (`recomputeLvEstimatedHealth()` invocation).

It **must not** choose publication authority by querying arbitrary historical active assessments and applying `ORDER BY computedAt DESC` or “latest assessment wins.”

`findLatestLvEstimatedHealth()` **must not** become the canonical PKG-02 publication-track selector.

An old persisted `WORKSHOP_OVERRIDE` from a previous epoch **must not** continue blocking a current `TELEMETRY`-only recompute after workshop evidence has gone stale.

## SELECTION_ALGORITHM

For **current canonical epoch assessments** (explicit `assessmentTrack` carrier — never array order, persistence order, or `computedAt`):

| Case | Condition | Selected track |
|------|-----------|----------------|
| **A** | `WORKSHOP_OVERRIDE` present + `TELEMETRY` present | `WORKSHOP_OVERRIDE` only |
| **B** | `WORKSHOP_OVERRIDE` present + no `TELEMETRY` | `WORKSHOP_OVERRIDE` |
| **C** | no `WORKSHOP_OVERRIDE` + `TELEMETRY` present | `TELEMETRY` |
| **D** | no qualifying canonical assessment | no publication handoff |

The selector returns **at most one** authoritative assessment per epoch.

## CROSS_TRACK_PUBLICATION_AUTHORITY_EPOCH

**Invariant:** assessment track change = **new publication authority / stabilization epoch**.

Track transitions include:

- `TELEMETRY` → `WORKSHOP_OVERRIDE`  
- `WORKSHOP_OVERRIDE` → `TELEMETRY`

These transitions **must not** automatically reuse prior-track stabilization state as if both tracks were the same evidence authority.

### Same-track vs cross-track stabilization (PKG-02 requirement)

| Transition | Stabilization / hysteresis |
|------------|---------------------------|
| `TELEMETRY` → `TELEMETRY` | Normal publication-policy stabilization / hysteresis may apply |
| `WORKSHOP_OVERRIDE` → `WORKSHOP_OVERRIDE` | Normal track-continuous publication-policy semantics may apply |
| `TELEMETRY` → `WORKSHOP_OVERRIDE` | **New** authority/stabilization epoch — no cross-track EWMA/hysteresis baseline |
| `WORKSHOP_OVERRIDE` → `TELEMETRY` | **New** authority/stabilization epoch — no cross-track EWMA/hysteresis baseline |

Prior publication values from the **other** track must **not** be used as authoritative baseline for EWMA stabilization or hysteresis comparison.

**Not implemented in this docs pass.** Documented as required PKG-02 implementation semantics.

### Rejected: `CROSS_TRACK_EWMA_CONTINUITY`

**Example:** existing TELEMETRY publication stabilized at **72**; new fresh `WORKSHOP_OVERRIDE` assessment **85**. Workshop value must **not** be dragged toward 72 merely because TELEMETRY was the previous publication authority.

Similarly: previous `WORKSHOP_OVERRIDE` → workshop stale → `TELEMETRY` becomes authority. New TELEMETRY epoch must **not** inherit workshop-track stabilization as continuous same-track signal.

Evidence authority changes are **semantic boundaries**.

## EQUAL_VALUE_TRACK_TRANSITION

**D4 invariant:** a qualifying cross-track authority transition is **publication-significant even when the displayed numeric value is unchanged**.

`BatteryPublication` is not merely a numeric value carrier. It also carries:

- `assessmentId`  
- `assessmentTrack` (reason payload)  
- `assessmentMode`  
- publication maturity / history  
- audit provenance  

Therefore **72 TELEMETRY** is not epistemically identical to **72 WORKSHOP_OVERRIDE** even when the displayed score is equal. Single-authority architecture requires active publication provenance to reflect the currently successful authoritative track.

### Required equal-value example

| State | Value |
|-------|-------|
| Existing active publication | `assessmentTrack = TELEMETRY`, `publishedEstimatedHealth = 72` |
| New D4 epoch | `WORKSHOP_OVERRIDE` authoritative; publication policy otherwise permits; resolved `publishedEstimatedHealth = 72` |

**Target result (PKG-02 — not current runtime):**

- New `WORKSHOP_OVERRIDE`-backed publication persisted  
- Previous TELEMETRY publication superseded per normal history semantics  
- Customer-visible numeric value may remain **72**  
- Authority/provenance changes TELEMETRY → `WORKSHOP_OVERRIDE`  
- No cross-track EWMA or hysteresis baseline  
- Absence of numeric change **must not** suppress valid authority transition

### Current runtime edge case (documented — not solved)

```typescript
const valueChanged =
  publishedEstimatedHealth != null &&
  publishedEstimatedHealth !== currentPublished;
const firstPublication = currentPublished == null && publishedEstimatedHealth != null;
const shouldPersistPublication =
  maturityAllowsFirstPublish && (firstPublication || valueChanged);
```

When both resolve to **72**, `shouldPersistPublication = false` and old TELEMETRY publication remains active. **Do not claim runtime already solves this.**

## PUBLICATION_AUTHORITY_EPOCH

**Semantic carrier:** `publicationAuthorityEpochChanged` — not merely `knownTrackA !== knownTrackB`.

A **publication authority epoch change** exists when continuity with the previous active publication cannot validly be treated as the **same publication authority**.

| Transition | `publicationAuthorityEpochChanged` |
|------------|-----------------------------------|
| `TELEMETRY` → `WORKSHOP_OVERRIDE` | **true** |
| `WORKSHOP_OVERRIDE` → `TELEMETRY` | **true** |
| `UNKNOWN` → `TELEMETRY` | **true** |
| `UNKNOWN` → `WORKSHOP_OVERRIDE` | **true** |
| `TELEMETRY` → `TELEMETRY` (new recompute only) | **false** — not merely because recompute occurred |
| `WORKSHOP_OVERRIDE` → `WORKSHOP_OVERRIDE` (new recompute only) | **false** — not merely because recompute occurred |

### ASSESSMENT_EPOCH_VS_PUBLICATION_EPOCH

**Do not equate:**

| Concept | Meaning |
|---------|---------|
| **D4 assessment authority epoch** | Every `recomputeLvEstimatedHealth()` invocation creates a new D4 assessment epoch |
| **Publication authority epoch** | Changes only on track-authority discontinuity or `UNKNOWN` continuity — **not** on every recompute |

**Example — same-track equal-value recompute:**

- Recompute A: `TELEMETRY` 72  
- Recompute B: `TELEMETRY` 72 (no value change; normal policy/hysteresis)  
- `publicationAuthorityEpochChanged = false`  
- **No mandatory** new publication merely because a new D4 recompute epoch occurred

D4 recompute epoch **≠** publication authority epoch transition.

## PUBLICATION_SIGNIFICANCE

Conceptual future PKG-02 publication persistence significance:

```
publicationPersistSignificant =
  firstPublication
  OR numericValueChanged
  OR publicationAuthorityEpochChanged
```

**Why not `authoritativeTrackChanged` alone:** when `previousTrack = UNKNOWN`, a deterministic boolean “track changed” cannot be proven. `publicationAuthorityEpochChanged` captures discontinuity including UNKNOWN→known.

**Constraints:**

- `publicationAuthorityEpochChanged` matters **only after** the new selected assessment has passed normal publication policy requirements  
- Authority epoch significance **does not** bypass: `publicationEnabled`, assessment publication eligibility, evidence sufficiency, freshness, maturity, contamination policy, or other publication safety gates

A new publication may become persistence-significant when normal publication policy permits **and** one of:

- **A)** first publication  
- **B)** numeric published value changed  
- **C)** publication authority epoch changed (includes known→different-known and UNKNOWN→known)

### Track / authority change vs policy SKIP

| Case | Existing | New authoritative | Policy | Result |
|------|----------|-------------------|--------|--------|
| **A — passes** | TELEMETRY 72 | `WORKSHOP_OVERRIDE` 72 | PUBLISH / publication-qualified | New WORKSHOP publication **must** be persistable despite equal numeric value; prior TELEMETRY may be superseded |
| **B — fails** | TELEMETRY 72 | `WORKSHOP_OVERRIDE` 72 | SKIP / CALIBRATING / not publishable | No new WORKSHOP publication; no TELEMETRY fallback; existing TELEMETRY continues under retention/freshness lifecycle only |
| **C — UNKNOWN passes** | UNKNOWN 72 | `TELEMETRY` 72 | PUBLISH / publication-qualified | `publicationAuthorityEpochChanged = true`; new TELEMETRY publication persistable; prior UNKNOWN may be superseded |
| **D — UNKNOWN fails** | UNKNOWN 72 | `TELEMETRY` 72 | SKIP / not publishable | No new publication; no forced supersession; old UNKNOWN follows retention/freshness only |

Authority epoch significance matters **only after** the current candidate passes normal publication policy.

### Same-track vs authority-epoch transitions (target semantics)

| Transition | Publication significance |
|------------|-------------------------|
| `TELEMETRY` → `TELEMETRY` (same track, equal value, new recompute) | Normal same-track policy only — **no** mandatory persistence from recompute alone |
| `WORKSHOP_OVERRIDE` → `WORKSHOP_OVERRIDE` (same track, equal value, new recompute) | Same |
| `TELEMETRY` → `WORKSHOP_OVERRIDE` | If policy permits: `publicationAuthorityEpochChanged` — equal value may persist and supersede |
| `WORKSHOP_OVERRIDE` → `TELEMETRY` | Same |
| `UNKNOWN` → `TELEMETRY` or `UNKNOWN` → `WORKSHOP_OVERRIDE` | If policy permits: `publicationAuthorityEpochChanged` — equal value may persist and supersede |

## UNKNOWN_TO_KNOWN_TRANSITION

When `previousTrack = UNKNOWN` and the new authoritative assessment has a **known** `assessmentTrack`:

### Equal-value examples (required)

**UNKNOWN 72 → TELEMETRY 72** (policy permits):

- Previous continuity: **DISCONTINUOUS**  
- `publicationAuthorityEpochChanged = true`  
- No previous EWMA or hysteresis baseline  
- Equal numeric value **does not** suppress persistence  
- New TELEMETRY-backed publication may be persisted  
- Previous UNKNOWN publication may be superseded  
- User-visible score may remain **72**; active provenance becomes deterministically `TELEMETRY`

**UNKNOWN 72 → WORKSHOP_OVERRIDE 72** (policy permits): same pattern with `WORKSHOP_OVERRIDE` provenance.

### UNKNOWN policy SKIP

**UNKNOWN 72 → TELEMETRY 72** (policy SKIP):

- No new TELEMETRY publication  
- No forced supersession merely because previous track was UNKNOWN  
- Old publication continues under existing retention/freshness rules only  
- No EWMA/hysteresis continuity assumed

## CURRENT_TRACK_MUST_BE_KNOWN

**Do not** invent a normal target state where a newly created canonical publication intentionally has `assessmentTrack = UNKNOWN`.

Future PKG-02 publications must carry deterministic **current** `assessmentTrack` authority.

If implementation cannot determine the **current selected** assessment track → treat as **operational authority/correlation failure**. Do **not** persist a new canonical UNKNOWN-track publication as a normal successful D4 result.

Historical UNKNOWN is tolerated as **previous-state compatibility** only. New canonical UNKNOWN publication authority is **not** a selected target (TEST 22).

## HISTORY_VS_STABILIZATION_CONTEXT

On cross-track transition, previous active publication retains valid roles for:

- audit history  
- supersession target  
- retention behavior  
- publication lineage  

But when `publicationAuthorityEpochChanged = true`, previous publication **must not** act as prior-track stabilization authority for:

- EWMA baseline  
- hysteresis baseline  
- same-track continuity assumptions  

```
previous active publication
        |
        +-- history / supersession context = YES
        |
        +-- stabilization baseline = NO when publicationAuthorityEpochChanged
```

Example: **UNKNOWN 72 → TELEMETRY 72** — previous row: history/supersession **YES** if new publication persists; stabilization/hysteresis baseline **NO**.

Useful publication history is preserved while respecting the new authority epoch.

## PREVIOUS_TRACK_OBSERVABILITY

**Current gap:** `LvPublicationPreviousState` / `toPreviousState()` does **not** carry `assessmentTrack`, although publication reason payload **does** persist `assessmentTrack` on write.

Therefore current `evaluateLvPublicationPolicy()` cannot distinguish:

- `TELEMETRY` → `TELEMETRY` (same-track continuity)  
- `TELEMETRY` → `WORKSHOP_OVERRIDE` (cross-track epoch)  
- `WORKSHOP_OVERRIDE` → `TELEMETRY` (cross-track epoch)

**PKG-02 implementation requirement:** evidence-backed way to know the previous active publication's `assessmentTrack` when applying D4 cross-track epoch semantics.

Acceptable approaches (implementation detail):

- expose `assessmentTrack` in `LvPublicationPreviousState`  
- resolve previous publication `assessmentId` and load explicit track  
- another deterministic equivalent

Do **not** require schema migration if existing persisted reason payload is sufficient. Do **not** infer track from timestamps, ordering, or heuristics.

## UNKNOWN_PREVIOUS_TRACK

If previous active publication exists but `assessmentTrack` cannot be determined reliably:

```
previousTrack = UNKNOWN
```

**Fail-safe target behavior:** treat continuity as **DISCONTINUOUS / NEW AUTHORITY-STABILIZATION EPOCH**.

| Context | UNKNOWN behavior |
|---------|------------------|
| EWMA baseline | **Do not** reuse `previous.stabilizedEstimatedHealth` |
| Hysteresis baseline | **Do not** reuse `previous.publishedEstimatedHealth` |
| Same-track assumption | **Do not** silently assume same-track continuity |
| History / supersession | Previous publication may still be used as history/supersession target |

**Forbidden inference for previousTrack:**

- timestamp proximity  
- `computedAt`  
- publication order  
- score similarity  
- nearest assessment  
- “latest assessment”  
- historical heuristics  

**UNKNOWN nuance:** UNKNOWN does **not** mean “always supersede immediately.” It means continuity cannot be proven → `publicationAuthorityEpochChanged = true` when transitioning to a known authoritative track **and** policy permits. If SKIP → old publication follows existing retention/staleness behavior.

If previous active publication track cannot be determined reliably → fail safe per above (TEST 13, TEST 17–20).

## NO_POLICY_BYPASS

If current epoch produces `WORKSHOP_OVERRIDE` + `TELEMETRY`, D4 selects `WORKSHOP_OVERRIDE`. Then `BatteryPublicationService` may return `PUBLISH` or `SKIP`.

If it returns **SKIP**:

- **Do not** automatically enqueue `TELEMETRY` as a second chance during the same epoch  
- Lower-authority track must not bypass publication-policy rejection of higher-authority current track

| Transition | Verdict |
|------------|---------|
| Track authority transition due to workshop evidence becoming stale (new epoch) | **ALLOWED / REQUIRED** |
| Same-epoch fallback from rejected `WORKSHOP_OVERRIDE` to `TELEMETRY` | **REJECTED** |

## RETENTION_VS_FALLBACK

### Scenario — higher-track SKIP with existing lower-track publication

- Existing active publication: **TELEMETRY**  
- New current epoch: `WORKSHOP_OVERRIDE` + `TELEMETRY`  
- D4 selects: `WORKSHOP_OVERRIDE`  
- `BatteryPublicationService` evaluates selected `WORKSHOP_OVERRIDE` → **SKIP** / CALIBRATING / no new persisted publication

**Selected behavior:**

- **Do not** create a new TELEMETRY publication as fallback (same-epoch fallback forbidden)  
- **Do not** automatically invalidate/delete the existing TELEMETRY publication solely because `WORKSHOP_OVERRIDE` became current assessment authority  

The existing publication may continue under its **existing** freshness/staleness lifecycle until:

- it naturally becomes stale, OR  
- a new authoritative publication successfully supersedes it, OR  
- another existing publication-policy rule explicitly changes it

This is **old publication retention** — **not** lower-track fallback.

| Concept | Meaning |
|---------|---------|
| **Retention** | No new lower-authority publication decision is created; prior row ages under existing rules |
| **Fallback** | Actively bypass higher-authority publication-policy outcome — **forbidden** |

### Successful cross-track publication

When existing publication track = `TELEMETRY`, new authoritative track = `WORKSHOP_OVERRIDE`, and publication policy permits publish:

- New publication becomes authoritative and may supersede prior active publication per normal history semantics  
- New track uses **new** stabilization/authority epoch — no cross-track EWMA/hysteresis continuity  

Similarly for `WORKSHOP_OVERRIDE` → `TELEMETRY` after workshop goes stale.

## PUBLICATION_SERVICE_BOUNDARY

D4 may define:

- selected current assessment track (must be known for successful canonical publication)  
- `publicationAuthorityEpochChanged` vs previous active publication  
- authority/stabilization epoch boundary signal for `BatteryPublicationService`

`BatteryPublicationService` / `evaluateLvPublicationPolicy()` remains sole authority for:

- `publicationEnabled`  
- publication eligibility  
- evidence sufficiency  
- maturity  
- hysteresis  
- stabilization (including same-track vs cross-track application)  
- `shouldPersistPublication`  
- supersession  
- stale handling  
- `PUBLISH` / `SKIP`

Future implementation should supply enough track context for policy to apply same-track vs cross-track behavior correctly. Do **not** duplicate publication policy in assessment handler or track selector.

### Target canonical flow (PKG-02 — not implemented)

```
recompute (new D4 authority epoch)
  → persist assessment track(s)
  → deterministic D4 arbitration
  → exactly one selected assessmentId at most
  → BATTERY_PUBLICATION_UPDATE
  → BatteryPublicationService (with publicationAuthorityEpochChanged context)
```

## FAILURE_SEMANTICS

### Same publication-handoff retry (no new recompute)

If an already-selected current `assessmentId` is being handed to publication and correlation/load fails:

- Operational handoff failure  
- **No** lower-track fallback  
- Retry must target the **same** selected assessment authority

### New assessment recompute during recovery

If recovery intentionally performs a fresh `recomputeLvEstimatedHealth()`:

- That recompute is a **new D4 authority epoch**  
- Its own fresh D4 arbitration result is authoritative  
- Different winner when eligibility changed is **correct** — not a violation

Do **not** conflate retry of same publication handoff with new assessment recompute during recovery.

## PRIMARY_TRUTH_VS_PUBLICATION_TRACK

D4 is narrower: **BatteryAssessment track → publication handoff candidate selection**. Does not redefine canonical primary-truth hierarchy. LV estimated-health remains `ESTIMATED_HEALTH_NOT_SOH`.

## REJECTED

| ID | Alternative | Why rejected |
|----|-------------|--------------|
| **A** | `LATEST_WINS` / `computedAt` ordering | Time ordering is not evidence authority |
| **B** | `PUBLISH_EVERY_TRACK` | Competing publication truth |
| **C** | `PERMANENT_WORKSHOP_OVERRIDE` | Stale workshop must relinquish authority |
| **D** | `TELEMETRY_WINS_BY_VOLUME` | Sample count ≠ evidence class precedence |
| **E** | `PUBLICATION_SERVICE_SELECTS_TRACK` | Mixes arbitration with policy |
| **F** | `TELEMETRY_FALLBACK_AFTER_WORKSHOP_POLICY_SKIP` | Bypasses publication-policy rejection in same epoch |
| **G** | `CROSS_TRACK_EWMA_CONTINUITY` | Cross-track stabilization contaminates evidence-authority boundaries |
| **H** | `PRESERVE_FIRST_RECOMPUTE_WINNER_ACROSS_EPOCHS` | Violates freshness-driven authority when evidence eligibility changes |
| **I** | `AUTO_DELETE_LOWER_TRACK_PUBLICATION_ON_HIGHER_TRACK_SKIP` | Conflates retention with fallback; deletes without policy basis |
| **J** | `SUPPRESS_CROSS_TRACK_ON_EQUAL_VALUE` | Numeric equality must not block valid authority/provenance transition when policy permits |
| **K** | `SUPPRESS_UNKNOWN_TO_KNOWN_ON_EQUAL_VALUE` | UNKNOWN→known authority transition must be publication-significant when policy permits |
| **L** | `MANDATORY_PUBLICATION_ON_EVERY_RECOMPUTE` | D4 assessment epoch ≠ publication authority epoch; same-track equal-value recompute must not force persistence |
| **M** | `NEW_CANONICAL_UNKNOWN_TRACK_PUBLICATION` | Successful canonical publication must carry known current assessmentTrack |

## WHY

Multi-track AUTO supports diagnostics; publication requires one evidence-backed candidate per epoch. Workshop is higher-authority **while currently eligible**. Track changes are semantic boundaries for stabilization. D1 trigger identity implies recomputes are not frozen snapshots — epoch semantics must be explicit.

## EXPECTED_EFFECT

- PKG-02 implementers have epoch + cross-track publication semantics  
- Retry/reconcile wording precise: new recompute ≠ same-handoff retry  
- Cross-track EWMA/hysteresis rejection explicit  
- Retention vs fallback distinguished  
- Previous-track observability gap documented for PKG-02  
- Equal-value cross-track publication significance documented for PKG-02  
- D5 remains sole architecture blocker; D4 full runtime contract (including equal-value) must be implemented/tested in PKG-02

## NON_EFFECTS

- No runtime implementation  
- No publication behavior change  
- No assessment behavior change  
- No publication enqueue  
- No feature flag change  
- No DB migration  
- No production mutation  
- No backfill  
- No deploy  
- No M4 cutover authorization  
- No `PRODUCTION_VALIDATED`  
- Runtime publication gaps remain open  
- PKG-02 remains `IMPLEMENTATION_SPEC_REQUIRED` (D5 only) — **does not mean runtime already supports D4**

## RISKS

| Risk | Mitigation |
|------|------------|
| Implementer preserves first-epoch winner across fresh recompute | Authority epoch + TEST 9A |
| Cross-track EWMA drags workshop toward telemetry baseline | Cross-track epoch + TEST 10/11 |
| Same-epoch telemetry fallback after SKIP | Retention vs fallback + TEST 12 |
| Heuristic previous-track inference | Previous-track observability + TEST 13 |
| UNKNOWN→known equal-value suppressed | `publicationAuthorityEpochChanged` + TEST 18/19 |
| Mandatory publication on every recompute | Assessment vs publication epoch distinction + TEST 21 |
| `findLatestLvEstimatedHealth` as selector | Explicit rejection + TEST 4 |

## TEST_CONTRACT

Future PKG-02 tests (minimum):

| Test | Scenario | Expected |
|------|----------|----------|
| **1** | Fresh telemetry only | `TELEMETRY` selected |
| **2** | Fresh qualified workshop + telemetry | Both persisted; `WORKSHOP_OVERRIDE` selected; one publication handoff only |
| **3** | Fresh workshop + large quantity of newer telemetry | Workshop still selected while currently eligible |
| **4** | Workshop becomes stale + fresh telemetry remains | Current epoch emits/selects `TELEMETRY`; old persisted workshop assessment does not win |
| **5** | Telemetry row persisted later than workshop in same epoch | `WORKSHOP_OVERRIDE` still wins; `computedAt`/order irrelevant |
| **6** | `BatteryPublicationService` SKIP on selected `WORKSHOP_OVERRIDE` | No same-epoch `TELEMETRY` fallback |
| **7** | No qualifying assessment | No publication enqueue |
| **8** | `SHADOW` assessment present | Never selected for customer publication authority |
| **9A** | Attempt A: workshop+telemetry → `WORKSHOP_OVERRIDE` winner; crash; Attempt B after workshop stale: new recompute | New authority epoch; `TELEMETRY` winner; no requirement to preserve old workshop winner |
| **9B** | Publication retry for already selected `assessmentId` without new recompute | Same selected assessment authority preserved; no lower-track fallback |
| **10** | Existing TELEMETRY publication + new publishable `WORKSHOP_OVERRIDE` | Track change detected; new stabilization epoch; no TELEMETRY EWMA/hysteresis baseline contaminates workshop; successful publish may supersede prior TELEMETRY |
| **11** | Existing `WORKSHOP_OVERRIDE` publication + workshop stale + new authoritative `TELEMETRY` | New stabilization epoch; no cross-track workshop baseline |
| **12** | Existing TELEMETRY publication + current `WORKSHOP_OVERRIDE` selected + policy SKIP | No new TELEMETRY fallback publication; existing TELEMETRY publication not auto-deleted; continues under existing freshness/staleness rules |
| **13** | Previous active publication track cannot be determined reliably | UNKNOWN = discontinuity; no stabilization inheritance; no heuristic same-track inference |
| **14** | Equal-value TELEMETRY 72 → WORKSHOP 72; workshop passes policy | Cross-track detected; new epoch; no cross-track EWMA/hysteresis; new WORKSHOP publication persisted; prior TELEMETRY superseded; user-visible 72; provenance WORKSHOP_OVERRIDE |
| **15** | Equal-value WORKSHOP 72 → TELEMETRY 72 after workshop stale; telemetry passes policy | New TELEMETRY epoch; equal value does not suppress publication; no cross-track baseline; prior WORKSHOP superseded |
| **16** | Equal-value TELEMETRY 72; current WORKSHOP 72; workshop fails policy | No new WORKSHOP; no TELEMETRY fallback; existing TELEMETRY retention only |
| **17** | Previous publication exists; `assessmentTrack` unavailable; new assessment passes policy | UNKNOWN = discontinuity; `publicationAuthorityEpochChanged`; no EWMA/hysteresis baseline; history/supersession may remain |
| **18** | UNKNOWN 72 → TELEMETRY 72; policy permits | Discontinuity; epoch changed; new TELEMETRY persisted despite equal value; prior UNKNOWN superseded; visible 72 |
| **19** | UNKNOWN 72 → WORKSHOP 72; policy permits | New authority epoch; no stabilization inheritance; new WORKSHOP persisted; prior UNKNOWN may be superseded |
| **20** | UNKNOWN 72 → TELEMETRY 72; policy SKIP | No new publication; no forced supersession; old UNKNOWN retention only |
| **21** | TELEMETRY 72 → recompute TELEMETRY 72 (same track, equal value) | New D4 recompute epoch; `publicationAuthorityEpochChanged = false`; no mandatory persistence from recompute alone |
| **22** | Current selected assessment track unavailable | Operational failure; do not persist canonical UNKNOWN-track publication as success; no heuristic inference |

## STATUS

`VALIDATED` — architecture / selection authority documentation only. **Not** `PRODUCTION_VALIDATED`. Runtime publication handoff, `publicationAuthorityEpochChanged` semantics, and UNKNOWN→known persistence **not implemented**.
