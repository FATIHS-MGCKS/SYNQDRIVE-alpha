# D4 — LV Publication Assessment-Track Authority

**Decision ID:** `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001`  
**Package:** `BAT-V2-RUNTIME-PKG-02` (spec closure only — no runtime implementation)  
**Depends on:** `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (D1), `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` (D2), `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` (D3), `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` (refines)  
**Status:** `VALIDATED` (architecture / selection authority — **not** `PRODUCTION_VALIDATED`)  
**Date:** 2026-09-02

## BEFORE

Phase 4 left PKG-02 `IMPLEMENTATION_SPEC_REQUIRED` with two architecture blockers: **D4** assessment-track publication authority and **D5** authoritative `publicationVersion`. AUTO recompute may persist both `WORKSHOP_OVERRIDE` and `TELEMETRY` assessments, but no deterministic rule governed which assessment may enter the LV publication pipeline. `findLatestLvEstimatedHealth()` orders by `computedAt` only — not track authority. Backfill precedent used `persistedAssessmentIds[length - 1]` — implicit array ordering, not evidence policy.

## PROBLEM

- Multi-track recompute persists two assessments with distinct `assessmentTrack` values but no publication handoff selector exists today  
- Without explicit track authority, implementers might use `computedAt DESC`, array position, or enqueue every `persistedAssessmentId` — all incorrect  
- Workshop evidence can become stale via existing freshness policy; authority must not be permanent lifetime override  
- Telemetry volume must not outrank a fresh qualified workshop measurement  
- `BatteryPublicationService` evaluates policy for one assessment — track arbitration must precede publication enqueue  
- Same-recompute fallback from rejected `WORKSHOP_OVERRIDE` to `TELEMETRY` would bypass publication-policy authority

## CURRENT_CODE

| Mechanism | Current behavior (main at decision time) |
|-----------|------------------------------------------|
| AUTO track generation | `lv-estimated-health-assessment.policy.ts` — if `canonicalSelection.selectedEvidence` contains workshop type → `['WORKSHOP_OVERRIDE', 'TELEMETRY']`; else `['TELEMETRY']` |
| `WORKSHOP_OVERRIDE` evidence | Same file — filters to workshop types only; `BatteryEvidenceStrength.OVERRIDE` |
| Freshness upstream | `lv-evidence-selection.policy.ts` — stale workshop rejected with `STALE_MEASUREMENT`; rejected evidence cannot enter `selectedEvidence` |
| Persistence | `battery-assessment.service.ts` — loops `computed.assessments`, pushes each to `persistedAssessmentIds[]` |
| `findLatestLvEstimatedHealth` | `battery-assessment.repository.ts` — `orderBy: { computedAt: 'desc' }`, no `assessmentTrack` filter or ordering |
| Publication policy | `battery-publication.service.ts` / `evaluateLvPublicationPolicy()` — receives specific `assessmentId`; no track precedence |
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
| **G** | **Freshness-conditional deterministic track precedence within current recompute** |

## SELECTED

**G — Freshness-conditional deterministic track precedence**

Canonical precedence:

```
WORKSHOP_OVERRIDE > TELEMETRY
```

**Only** within assessments produced by the **current** recompute invocation from **currently selected eligible evidence**.

This is **not** a permanent lifetime override. It is **not** “if any historical workshop assessment exists, workshop always wins.”

## TRACK_PRECEDENCE

| Condition | Authoritative track for publication handoff |
|-----------|-------------------------------------------|
| Current recompute includes both `WORKSHOP_OVERRIDE` and `TELEMETRY` | `WORKSHOP_OVERRIDE` |
| Current recompute includes `WORKSHOP_OVERRIDE` only | `WORKSHOP_OVERRIDE` |
| Current recompute includes `TELEMETRY` only | `TELEMETRY` |
| No qualifying canonical assessment | No publication handoff |
| `SHADOW` assessment present | **Never** selected for customer publication authority |

**Persist both ≠ publish both.** Both tracks may remain persisted for diagnostics, comparison, model evaluation, drift analysis, and auditability. D4 governs only which assessment may be handed to the LV publication pipeline.

## FRESHNESS_CONDITIONAL_AUTHORITY

`WORKSHOP_OVERRIDE` outranks `TELEMETRY` **only while** the workshop evidence that caused `WORKSHOP_OVERRIDE` to exist in the **current** recompute remains:

- supported  
- quality-valid  
- provenance-valid  
- freshness-valid  
- otherwise eligible under existing `lv-evidence-selection.policy.ts`

D4 **consumes** existing evidence eligibility/freshness authority. **Do not invent a new workshop TTL in D4.**

### Example (required transition)

**T0:** fresh workshop evidence + fresh telemetry

- AUTO produces: `WORKSHOP_OVERRIDE`, `TELEMETRY`  
- Publication-track authority: `WORKSHOP_OVERRIDE`

**T1:** same workshop evidence now stale + new fresh telemetry

- Evidence selection rejects workshop as `STALE_MEASUREMENT`  
- AUTO no longer produces current `WORKSHOP_OVERRIDE`  
- Current recompute produces: `TELEMETRY` only  
- Publication-track authority: `TELEMETRY`

This transition is **required**.

### Volume rejection

**Reject:** “more telemetry samples automatically outrank one fresh workshop measurement.”

Track authority is based on **evidence class + current eligibility + freshness**, **not** raw observation count. A fresh qualified `WORKSHOP_OVERRIDE` remains authoritative even when many new telemetry observations exist. Telemetry takes authority when workshop evidence **ceases to qualify**, not merely because telemetry volume grows.

## CURRENT_RECOMPUTE_BOUNDARY

Track arbitration **must** operate on assessments produced/persisted by the **current** `recomputeLvEstimatedHealth()` invocation.

It **must not** choose publication authority by querying arbitrary historical active assessments and applying:

- `ORDER BY computedAt DESC`, or  
- “latest assessment wins”

`findLatestLvEstimatedHealth()` **must not** become the canonical PKG-02 publication-track selector.

An old persisted `WORKSHOP_OVERRIDE` from a previous recompute **must not** continue blocking a current `TELEMETRY`-only recompute after its workshop evidence has gone stale.

### Example

| Recompute | Persisted tracks | Authority |
|-----------|------------------|-----------|
| Previous | `WORKSHOP_OVERRIDE(old)`, `TELEMETRY(old)` | — |
| Current (workshop stale) | `TELEMETRY(new)` | **`TELEMETRY(new)`** — not `WORKSHOP_OVERRIDE(old)` |

## SELECTION_ALGORITHM

For **current canonical recompute assessments** (explicit `assessmentTrack` carrier — never array order, persistence order, or `computedAt`):

| Case | Condition | Selected track |
|------|-----------|----------------|
| **A** | `WORKSHOP_OVERRIDE` present + `TELEMETRY` present | `WORKSHOP_OVERRIDE` only |
| **B** | `WORKSHOP_OVERRIDE` present + no `TELEMETRY` | `WORKSHOP_OVERRIDE` |
| **C** | no `WORKSHOP_OVERRIDE` + `TELEMETRY` present | `TELEMETRY` |
| **D** | no qualifying canonical assessment | no publication handoff |

**SHADOW-mode** assessment must never become publication-track authority.

The selector returns **at most one** authoritative assessment per recompute.

### Explicit track carrier (implementation detail for PKG-02)

Future PKG-02 must establish explicit current-recompute association (`assessmentId`, `assessmentTrack`, `assessmentMode`) for each persisted result. Acceptable approaches:

- structured persisted assessment refs returned from recompute  
- resolve just-persisted IDs and read explicit `assessmentTrack`  
- another deterministic evidence-backed mechanism

Authority **must** use explicit `assessmentTrack`. **Never** array position, persistence order, `computedAt`, “first assessment”, or “last assessment”.

## NO_POLICY_BYPASS

If current recompute produces `WORKSHOP_OVERRIDE` + `TELEMETRY`, D4 selects `WORKSHOP_OVERRIDE`. Then `BatteryPublicationService` may return `PUBLISH` or `SKIP`.

If it returns **SKIP**:

- **Do not** automatically enqueue `TELEMETRY` as a second chance during the same recompute  
- Lower-authority track must not bypass publication-policy rejection of higher-authority current track  
- `TELEMETRY` remains persisted for diagnostic/internal purposes

At a **later** recompute, if workshop evidence no longer qualifies and AUTO produces `TELEMETRY` only, `TELEMETRY` becomes authoritative normally.

| Transition | Verdict |
|------------|---------|
| **A)** Track authority transition due to workshop evidence becoming stale | **ALLOWED / REQUIRED** |
| **B)** Same-recompute fallback from rejected `WORKSHOP_OVERRIDE` to `TELEMETRY` | **REJECTED** |

Do not collapse D4 into `assessment.publicationEligible`. Track authority is evidence precedence; publication eligibility/policy remains downstream.

## PUBLICATION_SERVICE_BOUNDARY

D4 answers only: **“Which current assessment is allowed to enter publication evaluation?”**

D4 does **not** answer: **“Should this assessment actually publish?”**

`BatteryPublicationService` remains sole authority for:

- publication enabled gate  
- publication policy  
- maturity  
- evidence sufficiency  
- hysteresis  
- previous publication state  
- `shouldPersistPublication`  
- supersession  
- `PUBLISH` / `SKIP` decision

Do **not** duplicate `evaluateLvPublicationPolicy()` logic in `BatteryAssessmentRecomputeHandler`, a future track selector, reconciliation, or producer wrapper.

### Target canonical flow (PKG-02 — not implemented by D4)

```
recompute
  → persist assessment track(s)
  → deterministic D4 arbitration
  → exactly one selected assessmentId at most
  → BATTERY_PUBLICATION_UPDATE
  → BatteryPublicationService
```

## FAILURE_SEMANTICS

If the authoritative current assessment cannot be correlated or loaded for publication handoff, treat as an **operational handoff/recovery problem**.

- **Do not** silently fall back to the lower-authority track  
- Reconciliation/retry must preserve the same deterministic D4 track authority for that recompute  
- Do not invent a new queue protocol in this docs task

## PRIMARY_TRUTH_VS_PUBLICATION_TRACK

Do not conflate D4 with canonical primary-truth precedence. Existing canonical read logic may separately prioritize direct workshop/manual evidence. D4 is narrower:

**BatteryAssessment track → publication handoff candidate selection**

D4 does **not** redefine raw workshop evidence authority, canonical read-model hierarchy, HV authority, or workshop SOH semantics. LV estimated-health remains `ESTIMATED_HEALTH_NOT_SOH`.

## REJECTED

| ID | Alternative | Why rejected |
|----|-------------|--------------|
| **A** | `LATEST_WINS` / `computedAt` ordering | Time ordering is not evidence authority; ignores track semantics and freshness transitions |
| **B** | `PUBLISH_EVERY_TRACK` | Creates competing publication truth; violates single publication candidate invariant |
| **C** | `PERMANENT_WORKSHOP_OVERRIDE` | Stale workshop evidence must relinquish authority when no longer eligible |
| **D** | `TELEMETRY_WINS_BY_VOLUME` | Sample count does not outrank fresh higher-quality workshop evidence |
| **E** | `PUBLICATION_SERVICE_SELECTS_TRACK` | Mixes track arbitration with publication policy; duplicates responsibilities |
| **F** | `TELEMETRY_FALLBACK_AFTER_WORKSHOP_POLICY_SKIP` | Allows lower-authority evidence to bypass higher-authority publication policy outcome in same recompute |

## WHY

Multi-track AUTO is intentional for diagnostics and model comparison. Publication requires exactly one evidence-backed candidate per recompute. Workshop measurements are higher-authority **while currently eligible** — not forever. Freshness is already enforced upstream; D4 must align publication authority with that eligibility boundary rather than invent parallel rules.

## EXPECTED_EFFECT

- PKG-02 implementers have deterministic track selector spec  
- `findLatestLvEstimatedHealth()` explicitly excluded as publication selector  
- Freshness-conditional `WORKSHOP_OVERRIDE > TELEMETRY` documented with required stale-workshop transition  
- Single publication candidate per recompute; no same-recompute policy bypass  
- Runtime gaps remain open until PKG-02 implementation

## NON_EFFECTS

- No runtime implementation  
- No publication enqueue  
- No feature flag change  
- No DB migration  
- No production mutation  
- No backfill  
- No deploy  
- No M4 cutover authorization  
- No `PRODUCTION_VALIDATED`  
- `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` remains open  
- `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` remains open  
- `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` remains open  
- PKG-02 remains `IMPLEMENTATION_SPEC_REQUIRED` (D5 only remains)  
- PKG-01 remains `IMPLEMENTATION_READY`

## RISKS

| Risk | Mitigation |
|------|------------|
| Implementer uses `findLatestLvEstimatedHealth` as selector | Explicit rejection in D4 + test contract TEST 4 |
| Implicit array-order selection (backfill precedent) | Explicit `assessmentTrack` carrier requirement |
| Same-recompute telemetry fallback after SKIP | Explicit rejection + TEST 6 |
| Conflating D4 with `publicationEligible` | Separate boundaries documented |

## TEST_CONTRACT

Future PKG-02 tests (minimum):

| Test | Scenario | Expected |
|------|----------|----------|
| **1** | Fresh telemetry only | `TELEMETRY` selected |
| **2** | Fresh qualified workshop + telemetry | Both persisted; `WORKSHOP_OVERRIDE` selected; one publication handoff only |
| **3** | Fresh workshop + large quantity of newer telemetry | Workshop still selected while currently eligible |
| **4** | Workshop becomes stale + fresh telemetry remains | Current recompute emits/selects `TELEMETRY`; old persisted workshop assessment does not win |
| **5** | Telemetry row persisted later than workshop in same recompute | `WORKSHOP_OVERRIDE` still wins; `computedAt`/order irrelevant |
| **6** | `BatteryPublicationService` SKIP on selected `WORKSHOP_OVERRIDE` | No same-recompute `TELEMETRY` fallback |
| **7** | No qualifying assessment | No publication enqueue |
| **8** | `SHADOW` assessment present | Never selected for customer publication authority |
| **9** | Retry/reconciliation of publication handoff | Same current-recompute track authority preserved; no lower-track fallback |

## STATUS

`VALIDATED` — architecture / selection authority documentation only. **Not** `PRODUCTION_VALIDATED`. Runtime publication handoff not implemented.
