# P2.2.26 — State-Preservation Delta Independent Re-Audit

**Date:** 2026-08-23  
**Mode:** STRICT READ-ONLY DELTA VERIFICATION  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Target implementation PR:** [#1198](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1198)  
**Prior full re-audit:** [#1199](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1199) (obsolete at `e9a36c33`)  
**Authoritative P225 baseline:** `bbb4f5741cad6da627dbb0d1b2b5427f46947671`  
**Prior P226 HEAD:** `e9a36c33d9a26dfdf44a1f82424b1ef7198cb8ad`  
**Current P226 HEAD:** `a9f87c78f012e166fc3eeecab4d868423485f8a0`  
**Delta range:** `e9a36c33..a9f87c78`

---

## 0. Primary delta question

**Does the micro-correction fix same-mount locale-switch state loss without introducing P226 machine/workflow/payload/i18n regression?**

**Answer:** **YES** — removing `locale` from the context-initialization effect dependency array stops locale-driven form re-seeding while preserving legitimate action/vehicle/booking reinitialization.

---

## 1. Delta topology hard gate

| Check | Required | Independent result |
|-------|----------|-------------------|
| PR #1198 open | YES | ✅ OPEN |
| Draft | YES | ✅ `isDraft: true` |
| merged | NO | ✅ `mergedAt: null` |
| Current HEAD | `a9f87c78` | ✅ match |
| Prior audited HEAD | `e9a36c33` | ✅ |
| Branch | `cursor/p2226-operator-tire-measure-i18n-recovery-3c10` | ✅ |
| `merge-base(HEAD, bbb4f574)` | `bbb4f574` | ✅ |
| `rev-list --count bbb4f574..HEAD` | `2` | ✅ |
| Unrelated commits | none | ✅ 2 scoped P226 commits only |
| Local HEAD == remote HEAD | YES | ✅ |

**Topology verdict:** ✅ **PASS**

---

## 2. Exact delta inventory (`e9a36c33..a9f87c78`)

4 changed paths (+269 / −3). Very small, focused delta.

| Path | Class | Notes |
|------|:-----:|-------|
| `frontend/src/operator/tire-measure/OperatorTireMeasureFlow.tsx` | A | Remove `locale` from init effect deps + comment |
| `frontend/src/operator/tire-measure/operator-tire-measure-localization.test.tsx` | B | +6 focused regression tests / helpers |
| `docs/audits/i18n-p2-2-26-operator-tire-measure-implementation-2026-08-23.md` | C | Micro-correction note |
| `architecture/I18N_OPERATOR_TIRE_MEASURE_P2_2_26_2026-08-23.md` | C | Locale-flow clarification |

| Category | Count |
|----------|------:|
| D — unrelated | **0** |
| E — machine/business semantic modification | **0** |

No dictionary, payload, scanner, or utils production changes in delta.

---

## 3. Exact production hunk audit

**File:** `OperatorTireMeasureFlow.tsx` — sole production change.

### Dependency array

| | Before (`e9a36c33`) | After (`a9f87c78`) |
|--|---------------------|---------------------|
| Dependencies | `action.vehicleId`, `action.prefilledTread`, `action.initialOdometerKm`, `action.sourceHint`, `action.bookingId`, `data.odometerKm`, **`locale`** | same **without `locale`** |

### Effect body (unchanged)

The effect still writes on **action/data identity change**:

- `setStep('vehicle')` — resets wizard step
- `setStepError(null)`, `setSubmitError(null)`, `setSubmitting(false)`
- `setTread({ fl, fr, rl, rr })` from `action.prefilledTread`
- `setContext({ measuredAt, odometerKm, source, workshopName, note })` where `note` uses `operatorTireMeasureHandoverNotePrefix(locale, bookingId)` **at seed time**

### Initialization trigger semantics

| Trigger | Before | After |
|---------|--------|-------|
| Locale switch alone | ❌ re-ran effect, overwrote context | ✅ effect does not run |
| `action.vehicleId` / `bookingId` / etc. change | ✅ re-seeds | ✅ re-seeds (unchanged) |
| `data.odometerKm` late load | ✅ may update odometer seed | ✅ unchanged behavior |

Added comment documents intentional `locale` omission.

---

## 4. Effect dependency audit (post-correction)

| Dependency | Why present? | Form seed identity? | Changes during same action? | Legitimately resets context? |
|------------|--------------|---------------------|----------------------------|------------------------------|
| `action.vehicleId` | new vehicle | YES | only new action | YES |
| `action.prefilledTread` | prefill seed | YES | only new action | YES |
| `action.initialOdometerKm` | odometer seed | YES | only new action | YES |
| `action.sourceHint` | source seed | YES | only new action | YES |
| `action.bookingId` | handover note seed | YES | only new action | YES |
| `data.odometerKm` | odometer fallback | YES (data) | may load async | YES (pre-existing) |
| ~~`locale`~~ | **REMOVED** | presentation only | on every switch | **was incorrectly YES** |

No other presentation-only dependency remains in this effect. `locale` still flows to `useOperatorTireMeasureData` and render paths separately.

---

## 5. Effect write-set

| Field | User editable? | Seed source | Effect rewrites on action change? | Locale switch rewrites? |
|-------|----------------|-------------|-----------------------------------|-------------------------|
| `measuredAt` | YES | `defaultMeasuredAtLocal()` | YES | **NO** ✅ |
| `odometerKm` | YES | action/data odometer | YES | **NO** ✅ |
| `source` | YES | `action.sourceHint ?? 'manual'` | YES | **NO** ✅ |
| `workshopName` | YES | `''` | YES (clears) | **NO** ✅ |
| `note` | YES | handover prefix or `''` | YES | **NO** ✅ |
| `step` | navigated | reset to `vehicle` | YES | **NO** ✅ |
| `tread.*` | YES | `action.prefilledTread` | YES | **NO** ✅ |

---

## 6–12. State preservation matrix

Verified via code audit + executed tests on `a9f87c78`:

| Concern | Code | Test evidence | Result |
|---------|------|---------------|--------|
| Current step preserved on locale switch | effect omits `locale`; `step` not reset | full-flow test stays on `context` step title | ✅ |
| `fl/fr/rl/rr` preserved | tread not in locale-triggered effect | full-flow back-nav asserts `5.1/4.9/3,8/3.7`; tread-step switch test | ✅ |
| `measuredAt` preserved | not re-seeded | full-flow EN↔DE asserts `2026-08-23T10:00` | ✅ |
| `odometerKm` preserved | not re-seeded | full-flow asserts `52100` | ✅ |
| `source` preserved (workshop) | not re-seeded | workshop field visible + `workshopName` preserved | ✅ indirect |
| `workshopName` preserved | not re-seeded | full-flow asserts `Werkstatt Nord` | ✅ |
| `note` preserved (edited) | not re-seeded | full-flow asserts exact `Operator note 42 — manually edited` | ✅ |
| Initial EN handover seed | uses `locale` at mount | dedicated EN seed test | ✅ |
| Initial DE handover seed | uses `locale` at mount | dedicated DE seed test | ✅ |
| Unedited seed on locale switch | form state not re-written | **code-true; no dedicated test** | ✅ by design |
| Action `bookingId` change re-seeds | `bookingId` still in deps | action identity test | ✅ |

---

## 13–16. Prior #1199 finding resolution

| #1199 observation | Status |
|-------------------|--------|
| `useEffect` re-applies handover note on locale change | **A — FULLY RESOLVED** |
| Same-mount test was TreadGrid-only | **A — FULLY RESOLVED WITH FULL-FLOW TEST** |

---

## 17–22. Machine / presentation freeze

Unchanged from `e9a36c33` (no production delta outside Flow effect deps):

- Step IDs, action type, `fl/fr/rl/rr`, TreadGrid mapping
- `parseTreadMm`, all threshold constants
- Validation/plausibility predicates and codes
- Payload builder / API endpoints (not in delta)
- `selectedSetupId` — separate effect keyed only to `data.setupOptions`; locale switch does not reset selection (code review; not explicitly regression-tested)

Presentation still reactive to locale via `useLanguage`, adapter helpers, and `useOperatorTireMeasureData(vehicleId, locale)`.

---

## 23–24. Payload delta

**Production payload code:** not touched in delta.

Note field remains UI-only (not sent to tire-health API). Payload regression tests unchanged and PASS.

---

## 26–27. Test source audit

**Grade: STRONG**

| Assertion | Covered? |
|-----------|----------|
| Full flow (not TreadGrid only) | ✅ parameterized EN→DE + DE→EN |
| Current step preservation | ✅ context step title before/after |
| All tread positions | ✅ 4 values via back-navigation |
| Context fields | ✅ measuredAt, odometer, workshop, note |
| Initial EN/DE seed | ✅ dedicated tests |
| Action identity reinit | ✅ `bookingId` change |
| EN→DE→EN round-trip | ⚠️ each direction tested separately (B — non-blocking) |
| `selectedSetupId` explicit | ⚠️ code-only (B — non-blocking) |
| Unedited seed policy | ⚠️ code-only (B — non-blocking) |
| Validation code on switch | ⚠️ code-only (B — non-blocking) |

---

## 28–34. Execution results

| Check | Result |
|-------|--------|
| `operator-tire-measure-localization.test.tsx` | **19 collected, 19 passed, 0 failed** |
| `operatorTireMeasure.utils.test.ts` | **6 collected, 6 passed, 0 failed** |
| `npm run i18n:check` | **PASS** (316/316) |
| P226 / P225–P216 / global enforce-clean | **0** |
| Dictionary delta | **0 keys** (8430 EN / 8430 DE, parity 100%, orphans 0) |
| `npm run build` | **PASS** |
| `git diff --check e9a36c33..a9f87c78` | **PASS** |

### CI triage (`a9f87c78`, run `32634634932`)

| Failure | Classification |
|---------|----------------|
| Typecheck `vehicles.controller.status-patch.spec.ts` | **D — pre-existing, unrelated** |
| Backend unit vehicle-detail verify | **D — same spec** |
| Playwright Vehicle Detail E2E | **D — unrelated** |

**P226-correction-caused required failures:** **0**

---

## 32. Category E delta

| Class | Present? |
|-------|----------|
| A — intended state-preservation fix | ✅ |
| B — test hardening | ✅ |
| C — documentation | ✅ |
| D — unintended business semantic change | **0** |

Preventing locale-driven loss of operator input is the intended bug fix, not Category E contamination.

---

## 41. Final reconciliation

| Metric | `e9a36c33` | `a9f87c78` | Result |
|--------|------------|------------|--------|
| `locale` in init effect deps | YES | **NO** | FIXED |
| Step preserved on locale switch | NO | **YES** | PASS |
| Selected setup preserved | YES* | **YES** | PASS (*unchanged) |
| FL/FR/RL/RR preserved | partial | **YES** | PASS |
| measuredAt / odometer / source / workshop / note | NO | **YES** | PASS |
| Initial EN/DE seed | YES | **YES** | PASS |
| Action-change seed | YES | **YES** | PASS |
| Payload shape/values | frozen | frozen | PASS |
| parseTreadMm / thresholds | frozen | frozen | PASS |
| Dictionary count | 8430 | 8430 | PASS |
| P226 | 0 | 0 | PASS |
| Global enforce-clean | 0 | 0 | PASS |
| Targeted tests | 13 loc | **19 loc** | PASS |
| i18n check | PASS | PASS | PASS |
| Build | PASS | PASS | PASS |
| Category E | 0 | 0 | PASS |

---

## 43. Final verdict

### **A — P2.2.26 DELTA VERIFIED — PR #1198 READY FOR FREEZE / MERGE**

The micro-correction is minimal, focused, and effective. Locale switches update presentation only; mutable form state survives same-mount EN↔DE switches. Action identity initialization, initial localized handover seeds, machine semantics, payload, and global i18n closure remain intact.

**PR #1198 may now be marked ready and merged.**

---

*Delta re-audit completed 2026-08-23. Read-only: no production code, tests, dictionaries, or scanner changes. PR #1198 not marked ready or merged.*
