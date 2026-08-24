# P2.2.36 — Final Independent Re-Audit
## Operator Booking Form Sheet Localization

**Date:** 2026-08-24  
**Auditor mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Implementation PR:** [#1256](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1256)  
**Pre-flight PR:** #1255 (not merged; no ancestry)  
**Authoritative baseline:** `177347f73fb15bfaa1a9ffff9523f51d97c24192`  
**Implementation HEAD:** `bab7e2c5b33bc69bb5bf0017efe9ecbc5659d7af`  
**Current main SHA:** `c8f093c39deb76c97143887ec4091352f9d29ffe`  
**Post-baseline merge:** PR #1257 (`cf55badc`) — Card Radius & Elevation Cutover

---

## 1. Provenance Hard Gate — PASS

| Check | Result |
|-------|--------|
| PR #1256 exists | YES |
| open | YES |
| Draft | YES |
| merged | NO |
| mergeable | YES (`MERGEABLE`) |
| base SHA | `177347f73fb15bfaa1a9ffff9523f51d97c24192` |
| head SHA | `bab7e2c5b33bc69bb5bf0017efe9ecbc5659d7af` |
| `merge-base(head, baseline)` | `177347f73fb15bfaa1a9ffff9523f51d97c24192` |
| commit count | 2 |
| #1255 ancestry | NO |
| main ancestry | NO |
| local HEAD == remote HEAD | YES |

---

## 2. Two-Commit Forensics

### Commit 1 — `aa4cb24b` — P236 IMPLEMENTATION

| Field | Value |
|-------|-------|
| Parent | `177347f73fb15bfaa1a9ffff9523f51d97c24192` |
| Subject | `feat(i18n): P2.2.36 Operator Booking Form Sheet localization` |
| Production | `OperatorBookingFormSheet.tsx`, `operator-booking-form-i18n.ts` |
| Dictionaries | `operator.bookings.form.{en,de}.ts`, `en.ts`/`de.ts` imports |
| Tests | `operator-booking-form-localization.test.tsx`, `hardcoded-copy-guard.test.ts` |
| Scanner | `hardcoded-copy-inventory.json` refresh |
| Docs | architecture + implementation audit |
| Bookkeeping | `ChangesView.tsx`, `ArchitekturView.tsx` |
| Unrelated | 0 |
| Main-drift contamination | 0 |

### Commit 2 — `bab7e2c5` — P236 TEST/DOC FOLLOW-UP

| Field | Value |
|-------|-------|
| Parent | `aa4cb24b` |
| Subject | `test(i18n): register P236 operator booking form localization in i18n:check` |
| Changed paths | `frontend/scripts/i18n-check.mjs` only (+1 line) |
| Classification | P236 TEST/DOC FOLLOW-UP |

**Forensics verdict:** UNRELATED = 0, MAIN-DRIFT CONTAMINATION = 0, AUDIT CONTAMINATION = 0. Both commits P236-bounded.

---

## 3. Complete Diff Inventory (14 paths)

| Path | Class |
|------|-------|
| `frontend/src/operator/bookings/OperatorBookingFormSheet.tsx` | A |
| `frontend/src/operator/lib/operator-booking-form-i18n.ts` | B |
| `frontend/src/i18n/translations/operator.bookings.form.en.ts` | C |
| `frontend/src/i18n/translations/operator.bookings.form.de.ts` | C |
| `frontend/src/i18n/translations/en.ts` | C |
| `frontend/src/i18n/translations/de.ts` | C |
| `frontend/src/operator/bookings/operator-booking-form-localization.test.tsx` | D |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | E |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | E |
| `frontend/scripts/i18n-check.mjs` | E |
| `frontend/src/master/components/ChangesView.tsx` | G |
| `frontend/src/master/components/ArchitekturView.tsx` | G |
| `architecture/I18N_OPERATOR_BOOKING_FORM_SHEET_P2_2_36_2026-08-24.md` | F |
| `docs/audits/i18n-p2-2-36-operator-booking-form-sheet-implementation-2026-08-24.md` | F |

**H (business semantic) = 0, I (unrelated) = 0, new compatibility consumers = 0.**

---

## 4. Production Scope

### `OperatorBookingFormSheet.tsx`
- **Baseline:** Fixed German presentation strings inline; business logic for create/edit, validation, payload, mutations unchanged.
- **Implementation:** `useLanguage().locale` + adapter helpers replace hardcoded copy only.
- **Changed hunks:** imports, error message presentation, labels/placeholders, status option labels, price quote chrome, submit label, sheet title/subtitle prop spread (scanner false-positive fix).
- **Business responsibility:** unchanged — same mode predicates, state, validation order, `buildBookingCreatePayload`, `updateBooking` patch construction.
- **Safe:** YES

### `operator-booking-form-i18n.ts` (new)
- **Responsibility:** Presentation-only adapter (title, submit, status labels, price quote template, validation error keys).
- **Business logic:** NONE (classes F–L = 0).
- **Classification:** CANONICAL

### Unchanged production dependencies
- `operatorBooking.utils.ts` — no diff
- `operatorBookingSheetShell.tsx` — no diff
- `StationSelectFields` — no diff
- Quick View surfaces — no diff

---

## 5. Runtime Path

```
Operator shell action (booking-create | booking-edit)
  → OperatorBookingFormSheet
  → mode = isEdit ? 'edit' : 'create'
  → state init from action prefill / edit detail fetch
  → customer/vehicle/station/pricing hooks (unchanged)
  → validation predicates (unchanged)
  → buildBookingCreatePayload / OperatorBookingUpdatePayload patch (unchanged)
  → createBooking / updateBooking (unchanged)
  → handleSuccess → action.onSuccess + closeSheet (unchanged)
```

Localization occurs only at presentation edges (labels, placeholders, helper text, error display strings, status option labels).

---

## 6. Create / Edit Mode Freeze — PASS

| Aspect | Create | Edit |
|--------|--------|------|
| Machine mode | `action.type === 'booking-create'` | `action.type === 'booking-edit'` |
| Title key | `operator.bookings.form.createTitle` | `bookings.edit.title` |
| Submit key | `operator.bookings.form.createSubmit` | `bookings.edit.saveChanges` |
| Mutation | `createBooking(payload)` | `updateBooking(bookingId, patch, ...)` |
| Customer UI | searchable select | read-only detail display |
| Status field | editable `PENDING`/`CONFIRMED` | hidden (edit) |
| Pricing sim | active | hidden |

Only visible labels changed. Mode predicates and mutation paths identical.

---

## 7–11. Identity / Status / Option Freeze — PASS

- **bookingId:** raw `action.bookingId` / `bookingId` in mutations — unchanged
- **Customer:** `customerId`, `customerDisplayName(c)`, API detail fields — raw dynamic data
- **Vehicle:** `vehicleId`, `vehicleDisplayLabel(v)` — raw dynamic data
- **Select options:** `<option value={c.id}>` / `<option value={v.id}>` — machine values unchanged; labels localized separately
- **Status:** machine values `PENDING` / `CONFIRMED` unchanged; labels via `bookings.planner.pending` / `bookings.confirmed`

---

## 12–16. Date/Time / Availability / Station — PASS

- `datetime-local` inputs, `localDateTimeToIso`, `splitLocalDateTime` — unchanged
- Validation: invalid pickup/return, return-after-pickup, station required — predicates identical
- `usePricingSimulation` params and timing — unchanged
- Station IDs/names from API — dynamic, not translated

---

## 17–21. Freeform / Pricing / Currency — PASS

- Notes textarea value — raw user/API content
- `formatMoneyCents(priceSim.totalGrossCents, priceSim.currency)` — unchanged; only surrounding label localized
- No currency conversion introduced
- No pricing calculation changes in diff

---

## 22–27. Validation / Payload — PASS

All validation predicates byte-identical; only `setFormError(...)` messages localized via stable error keys.

Create payload fields via `buildBookingCreatePayload`: customerId, vehicleId, pickupDate/Time, returnDate/Time, pickupStationId, returnStationId, notes, status, includedKm, quoteId — unchanged construction.

Edit patch: startDate, endDate, notes, kmIncluded, vehicle.connect, pickupStationId, returnStationId — unchanged logic.

---

## 28–33. Callbacks / Permissions / Layout — PASS

- `handleSuccess`, `closeSheet`, `handleSubmit` callbacks — unchanged semantics
- No permission checks added/removed
- Field/section order preserved: Customer → Vehicle → Period → Stations → Notes → Submit
- DOM hierarchy, input types, classes — no material redesign

---

## 34–36. Locale Switch / State Preservation

| Scenario | Grade |
|----------|-------|
| Create mode same-mount DE↔EN | **PASS** (tested) |
| Dynamic customer name preserved | **PASS** (tested: `Muster Kunde GmbH`) |
| Edit mode notes preserved on render | **PASS** (tested) |
| Edit mode dirty state on locale switch | **UNTESTED** — `locale` added to edit detail-fetch `useEffect` deps; locale switch re-fetches detail and may reset unsaved edits |

**Observation (non-blocking):** Adding `locale` to `[isEdit, orgId, bookingId, locale]` can trigger detail re-fetch on locale change in edit mode, potentially discarding unsaved dirty edits. Create-mode same-mount test passes. No `key={locale}` remount detected.

---

## 37–38. Adapter Audit — CANONICAL

| Helper | Class |
|--------|-------|
| `resolveOperatorBookingFormLocale` | A |
| `obf` | A |
| `operatorBookingFormTitle` | A |
| `operatorBookingFormSubmitLabel` | A |
| `operatorBookingFormStatusLabel` | B |
| `operatorBookingFormPriceQuoteTotal` | D |
| `operatorBookingFormErrorMessage` | C |

F/G/H/I/J/K/L = 0. Classification: **CANONICAL**.

---

## 39. +35 Key Audit — ALL JUSTIFIED

35 new `operator.bookings.form.*` keys (verified by `rg` count). All host-owned presentation: section titles, field labels, placeholders, helper text, validation messages, create-specific title/submit/saving. No machine values localized. No orphans.

---

## 40–41. Existing Key Reuse — 0 INCORRECT

| Key | Classification | Notes |
|-----|----------------|-------|
| `bookings.edit.title` | EXACT | edit mode only |
| `bookings.edit.saveChanges` | EXACT | edit submit only |
| `bookings.customer` | EXACT | section title |
| `bookings.vehicle` | EXACT | section title |
| `bookings.planner.pending` | EXACT | PENDING label |
| `bookings.confirmed` | EXACT | CONFIRMED label |
| `common.search` | EXACT | search field label |
| `common.status` | EXACT | status field label |

Create mode uses `operator.bookings.form.createTitle` / `createSubmit` — no incorrect edit copy in create mode.

---

## 42. Dictionary Accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8491 | 8526 |
| DE | 8491 | 8526 |
| New keys | — | 35 |
| Removed | 0 | 0 |
| Changed existing | 0 | 0 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

---

## 43. Translation Quality — STYLE only

DE strings faithfully mirror baseline German copy. EN strings are operationally correct. Minor style: DE uses "Quote" in price strings (inherited from baseline terminology) — NON-BLOCKING.

---

## 44–47. Fixed-Locale / Accessibility / Leakage — PASS

- No `de-DE`/`en-US`/`toLocale*`/`Intl.*` in P236 scope
- P236 scoped inventory findings: baseline **16** → final **0**
- Tests assert no raw `operator.bookings.form` keys or `PENDING` machine codes in DOM

---

## 48. P236 Enforce-Clean — PASS

```
P236_ENFORCE_CLEAN_EXACT:
  operator/bookings/OperatorBookingFormSheet.tsx
  operator/lib/operator-booking-form-i18n.ts
```

P236 = 0. No ignores/allowlists/exemptions/scanner weakening.

---

## 49–51. Test Quality — ACCEPTABLE

**7 P236 tests** (`operator-booking-form-localization.test.tsx`):

| Coverage | Tested |
|----------|--------|
| enforce-clean inventory | YES |
| create EN | YES |
| create DE | YES |
| edit EN (title, booking number, notes) | YES |
| same-mount locale switch (create) | YES |
| status machine-value mapping | YES |
| raw-key / machine-code leakage | YES |
| submit payload EN/DE | NO (indirect via unchanged payload code path) |
| edit locale switch dirty state | NO |
| validation trigger | NO |

Grade: **ACCEPTABLE** — core presentation + freeze paths covered; payload/validation not directly asserted.

**hardcoded-copy-guard:** 104/104 PASS (includes P236 guard)  
**operatorBooking.utils:** 9/9 PASS, file unchanged

---

## 52–55. Global i18n / QV / Category E / Shim

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS |
| Suite count | **346** tests |
| P236 | 0 |
| P235–P216 | 0 (guards pass) |
| Global enforce-clean | 0 |
| Quick View touched | NO |
| Category E | 0 |
| Shim | 29 (unchanged) |
| New compatibility consumers | 0 |

---

## 56–57. PR #1257 Post-Baseline Collision

### Implementation contamination from #1257
**NO** — #1256 branch does not contain #1257 commits.

### #1257 overlap with P236 paths

| Path | #1257 touched? |
|------|----------------|
| `OperatorBookingFormSheet.tsx` | **NO** |
| `operator-booking-form-i18n.ts` | N/A (new in #1256) |
| `OperatorGlassCard.tsx` | **YES** (indirect — P236 uses but does not modify) |
| `ChangesView.tsx` | **YES** (both #1256 and #1257) |
| `ArchitekturView.tsx` | NO |

### Future merge collision classification
**LOW** — `ChangesView.tsx` will require textual reconciliation when #1256 eventually merges to `main` (both add top-of-list changelog entries). `OperatorBookingFormSheet.tsx` has zero drift vs `main`. `OperatorGlassCard` radius changes from #1257 apply automatically via shared component — no P236 reintroduction of old geometry.

### UI token regression risk
**SAFE MERGE** for form sheet geometry (P236 does not set card radius/shadow classes). Indirect benefit from updated `OperatorGlassCard` on merge to main.

---

## 58. Main Drift

| Path | Baseline vs HEAD | HEAD vs main |
|------|------------------|--------------|
| `OperatorBookingFormSheet.tsx` | localized | **no diff** |
| `operator-booking-form-i18n.ts` | new | new (not on main) |
| `ChangesView.tsx` | P236 entry added | diverged (main has CC entries) |

Selected-path drift vs baseline: **NONE** (expected).  
Selected-path drift vs current main: **LOW** (bookkeeping only; production form path clean).

---

## 59. Dual Status

| Dimension | Result |
|-----------|--------|
| **IMPLEMENTATION CORRECTNESS** | **PASS** |
| **CURRENT MERGE SAFETY (to main)** | **RECONCILIATION REQUIRED** |

---

## 60. Active PR Collision — LOW/NONE

No unresolved HIGH/DIRECT collision with other open Operator/Booking i18n PRs.

---

## 61–63. Build / Diff-Check / CI

| Check | Result |
|-------|--------|
| `npm run build` | PASS (local + CI Production build) |
| `git diff --check` | PASS |
| CI overall | 4 failed / 18 passed (Vehicle Detail + Legal Docs workflows) |
| Failure cause | Backend TS errors in `billing.controller.security.characterization.spec.ts`, `vehicles-security-negative.spec.ts`, `vehicles.controller.status-patch.spec.ts` — **pre-existing, unrelated to P236** |
| P236-caused required CI failures | **0** |

---

## 64. Claim Reconciliation

| Claim | PR claim | Independent | PASS |
|-------|----------|-------------|------|
| base SHA | 177347f | 177347f | PASS |
| HEAD | bab7e2c5 | bab7e2c5 | PASS |
| 2 commits P236-only | yes | yes | PASS |
| no #1255 ancestry | yes | yes | PASS |
| scope bounded | yes | yes | PASS |
| create/edit semantics | unchanged | unchanged | PASS |
| IDs/dynamic data | unchanged | unchanged | PASS |
| validation/availability/pricing | unchanged | unchanged | PASS |
| submit payload | unchanged | unchanged | PASS |
| +35 keys / 8526 | yes | yes | PASS |
| P236=0 | yes | yes | PASS |
| 7 P236 tests | 7 PASS | 7 PASS | PASS |
| 104 guard / 9 utils | PASS | PASS | PASS |
| 346 i18n tests | yes | yes | PASS |
| Category E | 0 | 0 | PASS |
| build / diff-check | PASS | PASS | PASS |
| shim | 29 | 29 | PASS |
| #1257 contamination | none | none | PASS |
| merge safety to main | — | reconciliation required | N/A |

---

## 65–66. Corrections Required

**P236 semantic fixes:** none  
**Post-baseline merge reconciliation:** `frontend/src/master/components/ChangesView.tsx` — preserve P236 changelog entry above current main entries when merging to main. Non-semantic, easy textual merge.

---

## 70. Final Verdict

# **B — IMPLEMENTATION VERIFIED — POST-BASELINE MERGE RECONCILIATION REQUIRED**

P2.2.36 presentation semantics are independently verified. Booking form machine behavior, payloads, validation, and dynamic data remain frozen.

**Do not merge PR #1256 yet.** P2.2.36 semantics are verified, but the small post-baseline merge reconciliation described above (`ChangesView.tsx` when targeting `main`; indirect `OperatorGlassCard` benefit is safe) must be applied and independently rechecked first.
