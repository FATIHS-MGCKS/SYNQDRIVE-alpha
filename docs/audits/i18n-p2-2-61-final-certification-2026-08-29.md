# P2.2.61 — Vehicle Damages Final Certification Audit

**Date:** 2026-08-29  
**Mode:** STRICT READ-ONLY FINAL CERTIFICATION  
**Implementation PR:** #1406 (not modified)  
**Previous audit:** #1412 (`1701635fc`)  
**Previous audit verdict:** C — MATERIAL KEY REDUCTION STILL REQUIRED  
**Authoritative baseline:** `aa5c1f79826982fb1d4957026b0e3a5009a15c17`  
**Previous implementation HEAD:** `c1bc56aaa58a858784dd5f6126d307be86ec4a9f`  
**Certified HEAD:** `703dd11315e133a454edc4a70edaaf2de12da1bf`  
**Audit branch:** `cursor/p2261-final-certification-3c10`

---

## Executive summary

| Gate | Result |
|------|--------|
| Topology (#1406) | **PASS** |
| Final correction delta scope | **PASS** |
| #1412 exact reuse misses (22) | **PASS** — 22/22 RESOLVED |
| Key count (P261) | **FAIL** — 328 > 325 preferred gate |
| Dictionary hygiene | **PASS** |
| Same-mount DE→EN→DE | **PASS** — STRONG |
| Multi-locale formatter | **PASS** |
| Pickup contract | **PASS** |
| Category E (P261 scope) | **0** |
| Mutation evidence | **PASS** — 8/8 behavioral |
| Endpoint/payload parity | **PASS** (presentation-only) |
| Machine/filter/sort/tone | **PASS** |
| Raw ownership | **PASS** |
| Enforce-clean (23 paths) | **PASS** — 0 findings |
| Active mounted debt | **0** |
| Data Analyse | **PASS** — zero diff |
| P216–P260 freeze | **PASS** |
| Focused tests | **PASS** — 60/60 |
| Global validation | **PASS** |
| diff-check | **PASS** |
| Main collision | **LOW** — unrelated theme-token commits only |

### Final verdict

**C — KEY REDUCTION STILL REQUIRED**

### Merge recommendation

**DO NOT MERGE #1406** until P261 key count ≤325 with independent certification, or exhaustive irreducible proof (verdict B) for remaining keys above gate.

---

## 1. Topology (#1406)

| Check | Result |
|-------|--------|
| open | ✓ |
| Draft | ✓ |
| merged | false |
| mergeable | MERGEABLE |
| base | `p239-p238-merge-baseline-3c10` (parent `aa5c1f79`) |
| HEAD | `703dd11315e133a454edc4a70edaaf2de12da1bf` ✓ |
| commit count | **4** ✓ |
| #1412 / audit ancestry in #1406 | **none** ✓ |

Commits: `699300c63`, `2467f0d8e`, `c1bc56aaa`, `703dd1131`

---

## 2. Final correction delta (`c1bc56aaa` → `703dd1131`)

**15 files changed** (+73/−81 lines). Allowed scope only:

| Path | Change |
|------|--------|
| `frontend/src/i18n/translations/rental.vehicleDamages.en.ts` | −22 keys |
| `frontend/src/i18n/translations/rental.vehicleDamages.de.ts` | −22 keys |
| `frontend/src/rental/lib/rental-vehicle-damages-i18n.ts` | adapter reuse helpers |
| `frontend/src/rental/components/damages/*.tsx` (6 files) | canonical key callsites |
| `frontend/src/rental/components/damages/damage-summary-display.ts` | `tasks.view.open` |
| `frontend/src/rental/components/damages/damage-control.utils.ts` | `resolveDamageOneDayLabel` |
| `frontend/src/rental/lib/damage-insights.ts` | `resolveDamageOneDayLabel` |
| `frontend/src/rental/hooks/useVehicleDamageActions.ts` | `tasks.detail.toast.actionFailed` |
| `frontend/src/rental/components/rental-vehicle-damages-localization.test.tsx` | deterministic same-mount |
| `frontend/src/master/components/ChangesView.tsx` | bookkeeping |
| `frontend/src/master/components/ArchitekturView.tsx` | bookkeeping |

**No forbidden changes:** business semantics, endpoints, payloads, machine enums, filters/sort, pickup derivation, Data Analyse, P216–P260.

---

## 3. #1412 exact reuse misses — full classification

All 22 previously identified EN+DE exact reuse misses:

| # | P261 key removed | Canonical key | Status |
|---|------------------|---------------|--------|
| 1 | `vehicleDamages.summary.badge.open` | `tasks.view.open` | **RESOLVED** |
| 2 | `vehicleDamages.summary.oldestOneDay` | `tasks.form.duration1440` | **RESOLVED** |
| 3 | `vehicleDamages.insights.repairDuration.oneDay` | `tasks.form.duration1440` | **RESOLVED** |
| 4 | `vehicleDamages.queueFilter.open` | `tasks.view.open` | **RESOLVED** |
| 5 | `vehicleDamages.status.OPEN` | `tasks.view.open` | **RESOLVED** |
| 6 | `vehicleDamages.drawer.field.source` | `tasks.filter.sourceLabel` | **RESOLVED** |
| 7 | `vehicleDamages.drawer.section.timeline` | `health.timeline` | **RESOLVED** |
| 8 | `vehicleDamages.create.field.severity` | `health.observation.severity` | **RESOLVED** |
| 9 | `vehicleDamages.create.field.description` | `tasks.form.description` | **RESOLVED** |
| 10 | `vehicleDamages.aiIntake.field.description` | `tasks.form.description` | **RESOLVED** |
| 11 | `vehicleDamages.aiIntake.field.type` | `tasks.detail.technical.type` | **RESOLVED** |
| 12 | `vehicleDamages.repairTask.preview.title` | `tasks.form.title` | **RESOLVED** |
| 13 | `vehicleDamages.repairTask.preview.priority` | `tasks.filter.sortPriority` | **RESOLVED** |
| 14 | `vehicleDamages.repairTask.preview.vehicle` | `tasks.filter.vehicleLabel` | **RESOLVED** |
| 15 | `vehicleDamages.repairTask.priority.HIGH` | `tasks.filter.priority.HIGH` | **RESOLVED** |
| 16 | `vehicleDamages.repairTask.priority.NORMAL` | `tasks.filter.priority.NORMAL` | **RESOLVED** |
| 17 | `vehicleDamages.repairTask.priority.LOW` | `tasks.filter.priority.LOW` | **RESOLVED** |
| 18 | `vehicleDamages.rental.field.booking` | `tasks.entity.booking` | **RESOLVED** |
| 19 | `vehicleDamages.rental.field.customer` | `tasks.entity.customer` | **RESOLVED** |
| 20 | `vehicleDamages.rental.reportedByLine` | `tasks.detail.summary.completedBy` | **RESOLVED** |
| 21 | `vehicleDamages.hostError.actionFailed` | `tasks.detail.toast.actionFailed` | **RESOLVED** (dead dict entry removed) |
| 22 | `vehicleDamages.toast.actionFailed` | `tasks.detail.toast.actionFailed` | **RESOLVED** |

**Unresolved genuine misses:** 0  
**False positives:** 0

Verification: zero remaining references to all 22 removed keys in production source (dictionary + callsites).

---

## 4. Independent key accounting

| Metric | Value | Method |
|--------|-------|--------|
| Baseline EN | **9239** | `9567 − 328` (P261 module absent at `aa5c1f79`) |
| Baseline DE | **9239** | same |
| Final EN | **9567** | `npm run i18n:check` canonical registry |
| Final DE | **9567** | same |
| P261-owned final keys | **328** | `rg` count on `rental.vehicleDamages.{en,de}.ts` |
| Net reduction from 350 | **−22** | correction commit |
| Keys added in correction | **0** | |
| Keys removed in correction | **22** | |

Pre-correction at `c1bc56aaa`: 9589 EN/DE, 350 P261 keys.

---

## 5. Key certification verdict

**Preferred gate:** P261 ≤ 325  
**Actual:** **328** (+3 above gate)

### Remaining exact EN+DE byte-match candidates (independent scan)

14 P261 keys still byte-match canonical keys in both EN and DE:

| P261 key | Candidate | Notes |
|----------|-----------|-------|
| `vehicleDamages.aiIntake.reject` | `customers.manualApproval.reject` | weak context — AI intake vs customer approval |
| `vehicleDamages.drawer.archive` | `stations.action.archive` | plausible reuse |
| `vehicleDamages.evidenceStatus.COMPLETE` | `evaluations.quality.complete` | domain-distinct enum |
| `vehicleDamages.evidenceStatus.DISPUTED` | `dashboard.billing.disputed` | domain-distinct |
| `vehicleDamages.evidenceStatus.MISSING` | `customers.eligibility.missing` | domain-distinct |
| `vehicleDamages.evidenceStatus.PARTIAL` | `dashboard.label.partial` | domain-distinct |
| `vehicleDamages.insights.card.trend` | `evaluations.period.ROLLING_30_DAYS` | different semantics |
| `vehicleDamages.insights.repairDuration.days` | `newBooking.success.days` | templated `{count} days` |
| `vehicleDamages.liabilityStatus.DISPUTED` | `dashboard.billing.disputed` | enum ownership |
| `vehicleDamages.photo.clear` | `fleet.shell.clear` | plausible |
| `vehicleDamages.photo.uploading` | `docUpload.flow.uploading` | plausible |
| `vehicleDamages.queue.chip.disputed` | `dashboard.billing.disputed` | chip vs billing |
| `vehicleDamages.status.ARCHIVED` | `stations.status.ARCHIVED` | enum ownership |
| `vehicleDamages.summary.oldestDays` | `newBooking.success.days` | templated |

#1412 additionally identified ~8 type-B/D internal duplicate consolidations not yet applied.

### Key-model verdict

**C — KEY REDUCTION STILL REQUIRED**

328 exceeds the ≤325 certification gate. Exhaustive irreducible proof (verdict B) is **not** satisfied while byte-identical candidates and #1412 internal-duplicate opportunities remain.

---

## 6. Dictionary hygiene

| Check | Result |
|-------|--------|
| EN = DE | ✓ 9567/9567 |
| Parity | 100% |
| Orphans | 0 |
| Unused P261 keys | 0 |
| Unnecessary duplicate keys (post-22) | 0 in removed set; 14+ candidates remain |

---

## 7–11. Same-mount certification

**Test:** `rental-vehicle-damages-localization.test.tsx` → `preserves true same-mount DamagesView across DE→EN→DE with zero mutations`

**Result:** **PASS** (13/13 file tests pass)

| Check | Evidence |
|-------|----------|
| One persistent root | `damagesViewMountCount === 1` throughout |
| DE → EN → DE | click-driven `setLocale` via `data-testid` buttons |
| Synchronization | `act()` + synchronous click dispatch — **no `setTimeout`/sleep** |
| DE restoration | `container.textContent` contains `de['vehicleDamages.queue.title']` after final DE click |
| EN switch | contains `en['vehicleDamages.queue.title']` |
| Raw location label | `Provider Repair Shop X7` preserved across all phases |
| Mutation counters | all 0 (create, place, addPhoto, markInRepair, markRepaired, archive, updateLiability, createTask, reload) |
| Business refetch | reload counter 0 |

**Not exercised in harness:** drawer open, dialog open, form inputs, photo upload UI (N/A — not opened).

### Same-mount verdict

**STRONG** — deterministic provider-driven locale switch on one mount; observable DE copy restoration; zero mutation side effects.

---

## 12. Multi-locale formatter

`vehicleDamagesFormattingLocale()` → `getFormattingLocale(resolveVehicleDamagesLocale())`

| Locale | Expected | Verified |
|--------|----------|----------|
| de | de-DE | ✓ (test + `locales.ts`) |
| en | en-GB | ✓ |
| pl | pl-PL | ✓ (localization test) |
| fr | fr-FR | ✓ (localization test) |
| cs | cs-CZ | ✓ (`locales.ts`) |
| nl | nl-NL | ✓ (`locales.ts`) |
| es | es-ES | ✓ (`locales.ts`) |
| tr | tr-TR | ✓ (localization test) |
| it | it-IT | ✓ (`locales.ts`) |

---

## 13. Pickup contract

| Check | Result |
|-------|--------|
| `PickupContextResult.label` | **removed** — interface has `context`, `suggestedPickupDamageId`, `matchConfidence`, `reason` only |
| Raw machine codes | never rendered — adapter `resolveDamagePickupContextLabel` / `resolveDamagePickupReasonLabel` |
| Derivation semantics | unchanged (`damage-pickup-context.ts` tests 4/4 pass) |
| Category E | **0** in P261 enforce-clean scope |

---

## 14. Mutation evidence

`useVehicleDamageActions.localization.test.ts`: **8/8 PASS**

Covers create, place, status transitions, liability/cost, photo, repair task, AI no-side-effect. Payloads contain machine values only — no translated strings in API bodies.

---

## 15–18. Semantic freeze

| Area | Result |
|------|--------|
| Endpoint/payload parity | Presentation-only delta; API method signatures and payload shapes unchanged |
| Machine enums | Unchanged (status, severity, rentalImpact, evidence, liability, source, locationView, queueFilter) |
| Filter/sort/tone | Unchanged — dedicated tests pass |
| Raw ownership | `Provider Damage Description X7`, `Provider Liability Note X7`, `Provider Repair Shop X7`, `Provider Task Title X7`, `Damage_Photo_X7.jpg`, `Backend Damage Error X7` — preserved; backend error precedence test passes |

---

## 19–21. Scanner

| Scope | Count |
|-------|-------|
| Global | **1282** (unchanged from post-P261 expectation) |
| Rental | **185** (unchanged) |
| Finance/Billing | **25** |
| P261 enforce-clean (23 paths) | **0 findings** |
| Active mounted Vehicle Damages debt | **0** |

Delta from prior: **none** — correction was dictionary reuse + test repair only.

---

## 22–24. Scope boundaries

| Scope | Result |
|-------|--------|
| Data Analyse production diff | **0 lines** |
| P216–P260 semantic regression | **none detected** (P260 regression 27/27 pass) |
| Main collision | **LOW** — `main` has unrelated `V4.9.199`/`V4.9.200` theme-token commits touching damages paths; no i18n/logic overlap with #1406 |

---

## 25–27. Validation

| Command | Result |
|---------|--------|
| Focused tests (8 files) | **60/60 PASS** |
| Same-mount failures | **0** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| `tsc -b` (via build) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check aa5c1f79...703dd1131` | **PASS** (zero output) |

---

## Merge gate checklist

| Requirement | Met |
|-------------|-----|
| Topology valid | ✓ |
| #1412 reuse misses resolved | ✓ |
| Key model certified (≤325 or B) | **✗** |
| Same-mount STRONG/ACCEPTABLE | ✓ STRONG |
| All other gates | ✓ |

**READY TO MERGE:** **NO**

---

## Certification statement

P2.2.61 Vehicle Damages **correction pass is complete** but **not merge-certified** due to key count 328 > 325.

- PR #1406 must **not** be merged until key gate satisfied.
- ACTIVE MOUNTED VEHICLE DAMAGES I18N COVERAGE IS COMPLETE (presentation debt = 0).
- DATA ANALYSE REMAINS DEFERRED — PLANNED REMOVAL.
- P216–P260 REMAIN FROZEN.
- DO NOT MERGE AUDIT PRs #1408, #1412, OR THIS CERTIFICATION PR.
