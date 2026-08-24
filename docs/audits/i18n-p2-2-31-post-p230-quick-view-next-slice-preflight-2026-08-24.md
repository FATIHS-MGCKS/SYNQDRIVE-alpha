# P2.2.31 — Post-P230 Vehicle Quick View Next-Slice Pre-Flight

**Date:** 2026-08-24  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Authoritative baseline:** `3a5941862387b53b2d581287ce5edd4d68a291c9` (merge commit of PR #1222 / P2.2.30 QV Tool & Footer Actions)  
**Audit branch:** `cursor/p2231-post-p230-quick-view-next-slice-preflight-3c10`

---

## 0. Baseline / topology hard gate

| Check | Result |
|-------|--------|
| PR #1222 merged | **YES** (`gh pr view 1222` → `state: MERGED`, `mergedAt: 2026-08-24T08:46:32Z`) |
| Exact merge SHA | `3a5941862387b53b2d581287ce5edd4d68a291c9` |
| Commit exists locally | **YES** |
| Commit exists remotely | **YES** (fetched via `git fetch origin 3a594186…`) |
| `merge-base(HEAD, baseline)` | `3a5941862387b53b2d581287ce5edd4d68a291c9` ✓ |
| Pre-audit commits on baseline | **0** ✓ |
| Working tree clean (pre-audit) | **YES** |

### Ancestry (verified via `git log` on baseline)

| Slice | Commit on baseline ancestry |
|-------|----------------------------|
| P230 (QV Tool/Footer) | `3a594186` |
| P229 (QV Quick Actions) | `8498f044` |
| P228 (QV Header/Status) | `59e3395e` |
| P227 (QV Open Tasks) | `314f20aa` |
| P226 (Tire Measure) | `9f87c3d7` |
| P225 (Pickup Verification) | `bbb4f574` |
| P224 (Damage Capture) | `bf0a5a57` |
| P223 (Invoice Documents) | `96dadcb3` |
| P222 (Send Invoice Dialog) | `80dbba83` |
| P221 (Create Invoice Dialog) | `59b01928` |
| P220 (Parts & Accessories) | `6413a3dd` |
| P219 (Insurances View) | `9b714458` |
| P218 (Data Authorization) | `d645343f` |
| P217 (Booking Vehicle Picker) | `6e578fd9` |
| P216C2B | `f7095205` |

**Topology verdict:** VALID — proceed.

---

## 1. Post-P230 freeze verification

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** |
| i18n test count | **330** tests (23 files) |
| EN keys | **8454** |
| DE keys | **8454** |
| Parity | **100%** |
| Orphans | **0** |
| Shim inventory | **29** (prod 18, test 11) |
| New compatibility consumers | **0** |
| Global active enforce-clean debt | **0** |

### Per-slice enforce-clean debt

| Slice | Debt |
|-------|------|
| P230 | **0** |
| P229 | **0** |
| P228 | **0** |
| P227 | **0** |
| P226 | **0** |
| P225 | **0** |
| P224 | **0** |
| P223 | **0** |
| P222 | **0** |
| P221 | **0** |
| P220 | **0** |
| P219 | **0** |
| P218 | **0** |
| P217 | **0** |
| P216C2B | **0** |
| P216C2A | **0** |
| P216C1 | **0** |
| P216B2 | **0** |
| P216B1 | **0** |
| P216A | **0** |

### Frozen QV slice sanity (E = 0)

| Frozen slice | Regression class E |
|--------------|-------------------|
| Open Tasks (`OperatorVehicleQuickViewTasks.tsx`) | **0** |
| Header/Primary Status (`OperatorVehicleQuickViewHeader.tsx`) | **0** |
| Quick Actions (`OperatorVehicleQuickViewQuickActions.tsx`) | **0** |
| Tool/Footer (`OperatorVehicleQuickViewToolActions.tsx`) | **0** |

No raw machine/action ID leakage observed in frozen slices. No fixed-locale regression in frozen components.

### CompanySections prior freeze

`CompanySectionTabBar` uses `getCompanySections(locale)` with canonical i18n; no new enforce-clean debt in company settings surfaces.

**Freeze verdict:** PASS — no post-P230 baseline regression.

---

## 2. Purpose

Select exactly **one** bounded production localization slice for **P2.2.31**, prioritizing remaining Operator Vehicle Quick View residual after P227–P230.

---

## 3. Fresh global residual inventory

| Domain | Scanner-visible | Hidden presentation | Fixed-locale | Active enforce-clean |
|--------|-----------------|---------------------|--------------|---------------------|
| GLOBAL | 1565 | — | 8 FORMAT_LOCALE | **0** |
| Operator | 118 | hook/utils labels | `formatOperatorDateTime` de-DE | **0** |
| Vehicle Quick View parent | 8 | ~12+ (hook labels, InfoTile, module maps) | date formatter | **0** |
| Rental | 372 | — | various | **0** |
| Master | 1049 | — | — | **0** |
| Shared/Shell | 26 | — | — | **0** |

**GLOBAL ACTIVE I18N ENFORCE-CLEAN DEBT = 0** ✓

---

## 4–5. Frozen QV exclusion & sanity

Excluded from candidate selection:

- `OperatorVehicleQuickViewTasks.tsx` (P227)
- `OperatorVehicleQuickViewHeader.tsx` (P228)
- `OperatorVehicleQuickViewQuickActions.tsx` (P229)
- `OperatorVehicleQuickViewToolActions.tsx` (P230)
- Their dictionary namespaces and `operator-vehicle-quick-view-i18n.ts` helpers for those slices

**Frozen sanity classification:** E = **0**

---

## 6. Remaining Quick View residual inventory (`OperatorVehicleQuickView.tsx` parent)

| # | Sub-surface | Path/lines | Visible copy (samples) | Hidden copy | Fixed locale | Machine inputs | Callbacks |
|---|-------------|------------|------------------------|-------------|--------------|----------------|-----------|
| A | Booking/Customer Context | L116–128 | `Buchung` | hook labels: `Abholung heute`, `Rückgabe heute`, `Aktive Buchung`, `Nächste Reservierung` | `formatOperatorDateTime` de-DE | `kind`, `bookingId`, `status`, timestamps | none |
| B | Blockers & Hinweise | L130–151 | title, `Rental Health nicht geladen:` | utils contradiction strings | — | `rental_blocked`, `blocking_reasons`, contradictions | none |
| C | Rental Health modules | L153–186 | `Rental Health`, empty state, `stale` | `HEALTH_MODULE_LABELS`, `RENTAL_HEALTH_STATE_LABELS`, `formatModuleRow` fallbacks | — | module keys, `RentalHealthState` | none |
| D | Active damages summary | L188–213 | `Aktive Schäden`, empty | `formatDamageType` English casing | — | `damageType`, `severity`, `rentalImpact` | none |
| E | Tire profile summary | L237–288 | `Reifenprofil`, `Messung eintragen`, 5 InfoTile labels | tire-health formatters | date via utils | tread values, `displayMode` | `openSheet(tire-measure)` |
| F | AI uploads/documents | L290–310 | `AI Uploads / Dokumente` | — | date via utils | `documentType`, `status` | none |
| G | Shared chrome | `SectionCard`, `InfoTile` | uppercase label styling | — | — | — | — |

**Parent scanner-visible findings:** 8 (TITLE/TEXT categories).

---

## 7–13. Booking / Customer Context deep audit

### Actual block location

`OperatorVehicleQuickView.tsx` L116–128 (`SectionCard title="Buchung"`).

Data from `useOperatorVehicleQuickViewData().bookingContext` (hook L162–217).

### Field inventory

| Field | Type | Source | Presentation | Business logic | Must remain unchanged |
|-------|------|--------|--------------|----------------|----------------------|
| `kind` | machine enum | hook derivation | maps to label key | booking selection | **YES** |
| `label` | German string | hook hardcoded | display headline | none (presentation leak) | replace with kind→i18n |
| `customerName` | dynamic | API/row | display | identity | **YES** (do not translate) |
| `when` | ISO timestamp | API/row | formatted display | sorting/predicates | **YES** raw instant |
| `station` | dynamic | API/row | display suffix | routing | **YES** |
| `bookingId` | machine ID | API | not shown in block | callbacks elsewhere | **YES** |
| `status` | machine | normalized enum | not shown in block | business rules | **YES** |

### Status presentation

Block does **not** render booking/rental status badges — only kind headline + customer + datetime/station. Status machine values are carried but not displayed in this slice.

### Date/time audit

| Surface | Class |
|---------|-------|
| `formatOperatorDateTime` in `operatorVehicleQuickView.utils.ts` | **B — fixed-locale** (`toLocaleString('de-DE', …)`) |
| `operator-handover-i18n.formatOperatorDateTime(locale, iso)` | **A — locale-aware pattern to reuse** |

### Actions in booking block

**None** — read-only context card. No callback/route/permission surface in this block.

### Boundedness test (Booking/Customer)

| Criterion | Result |
|-----------|--------|
| Production files | ≤4 ✓ (parent block, hook label presentation, adapter, dictionaries) |
| Presentation concepts | ~8 ✓ |
| Likely new keys | ~8 ✓ |
| Date/time presentation-only | ✓ (adapter formatter) |
| Status machine separation | ✓ (kind enum) |
| Callback freeze easy | ✓ (no actions) |
| Category E realistic | ✓ |

**Booking/Customer verdict:** **ONE SAFE SLICE**

---

## 14–22. Health / Tire / Damage audits (summary)

### Rental Health + Blockers

- Module labels duplicate canonical `health.module.*` keys — reuse opportunity.
- State labels duplicate `health.state.*` — header adapter already maps these.
- `formatModuleRow` in utils emits German `RENTAL_HEALTH_STATE_LABELS` — presentation coupling.
- Blocker contradictions generated as German prose in `detectOperatorStatusContradictions` — **TOO COUPLED** for single slice without utils adapter boundary.

**Classification:** SAFE WITH HARD MACHINE FREEZE (health modules only); blockers better deferred or chrome-only.

### Active Damages

- `formatDamageType` English Title Case; `severity`/`rentalImpact` raw machine strings displayed.
- No actions in block.

**Classification:** SAFE WITH HARD MACHINE FREEZE

### Tire Profile

- Inline `Messung eintragen` duplicates P230 tire-measure action semantics.
- Five InfoTile labels + tire formatter outputs.
- Couples to `openSheet({ type: 'tire-measure', … })`.

**Classification:** SAFE WITH HARD MACHINE FREEZE but **collision risk with P226/P230** terminology.

### Documents

- Single section title; machine `documentType`/`status` raw.

**Classification:** LOW VALUE standalone

---

## 23–27. Structural decomposition & scores

### Remaining QV sub-slices

| Sub-slice | Files | Concepts | Est. keys | Op Lev | Machine Sep | Bus Risk | Bounded | Test | Collision | Residual Quality | Recommendation |
|-----------|-------|----------|-----------|--------|-------------|----------|---------|------|-----------|------------------|----------------|
| **Booking & Customer Context** | parent + hook + adapter | 8 | 8 | 5 | 5 | 2 | 5 | 5 | 5 | 4 | **SAFE BOUNDED** |
| Rental Health modules | parent + adapter (+ optional extract) | 15 | 12 | 5 | 4 | 2 | 4 | 4 | 5 | 5 | SAFE WITH EXTRA FREEZE |
| Blockers & Hinweise | parent (+ utils adapter) | 8 | 8 | 4 | 3 | 3 | 4 | 4 | 5 | 3 | TOO COUPLED (utils prose) |
| Active damages | parent | 10 | 10 | 4 | 3 | 2 | 4 | 4 | 5 | 4 | SAFE WITH EXTRA FREEZE |
| Tire profile | parent | 14 | 14 | 4 | 3 | 3 | 4 | 4 | 4 | 4 | SAFE WITH EXTRA FREEZE |
| Documents | parent | 3 | 3 | 2 | 4 | 1 | 5 | 4 | 5 | 2 | LOW VALUE |

### QV ranking (top 6)

| Rank | Sub-slice | Recommendation |
|------|-----------|----------------|
| 1 | Booking & Customer Context | **SELECT P231** |
| 2 | Rental Health modules | Next slice candidate |
| 3 | Active damages summary | Follow-on |
| 4 | Tire profile summary | Follow-on (watch P226 overlap) |
| 5 | Blockers & Hinweise | Defer / chrome-only first |
| 6 | Documents | Low value / bundle later |

---

## 36–39. Non-QV alternatives & top 12

### Top 3 Operator alternatives (outside QV)

| Rank | Surface | Files | Visible debt | Notes |
|------|---------|-------|--------------|-------|
| 1 | Booking detail sheet | `OperatorBookingDetailSheet.tsx` | high | 27+ scanner findings in bookings area |
| 2 | Booking form sheet | `OperatorBookingFormSheet.tsx` | high | workflow-heavy, higher risk |
| 3 | Today view | `OperatorTodayView.tsx` | medium-high | broad surface |

### Vehicle/Fleet runner-up

Fleet/health control surfaces outside QV (`rental-health-ui`, fleet health modules) — broader than QV parent block.

### Rental/Master runner-up

Rental Finance/Billing module (~90 scanner findings) — outside Operator campaign.

### Top 12 cross-domain ranking (abbreviated)

| Rank | Domain | Surface | Recommendation |
|------|--------|---------|----------------|
| 1 | Operator | QV Booking & Customer Context | **GO P231** |
| 2 | Operator | QV Rental Health modules | Next QV slice |
| 3 | Operator | Booking detail sheet | Defer (higher risk) |
| 4 | Operator | QV Active damages | Next QV slice |
| 5 | Operator | Booking form sheet | Defer |
| 6 | Operator | QV Tire profile | Next QV slice |
| 7 | Operator | Today view | Defer |
| 8 | Operator | AI upload flow | Defer |
| 9 | Rental | Finance/Billing residual | Cross-domain pause |
| 10 | Operator | QV Documents | Low value |
| 11 | Operator | QV Blockers | Defer (coupled) |
| 12 | Master | Support/ops residual | Cross-domain pause |

---

## 40–43. Winner & campaign decision

| Comparison | Result |
|------------|--------|
| Best remaining QV candidate | **Booking & Customer Context** |
| Best non-QV Operator candidate | Booking detail sheet |
| Best non-Operator candidate | Rental Finance/Billing |

**Winner:** **QUICK VIEW WINS**

**Campaign decision:** **CONTINUE OPERATOR — VEHICLE QUICK VIEW**

**Selected P2.2.31 target:** **P2.2.31 — Operator Vehicle Quick View Booking & Customer Context Localization**

**Split decision:** **ONE SLICE**

---

## 44–52. Exact P231 production scope

| Path | Role | Why required |
|------|------|--------------|
| `frontend/src/operator/components/OperatorVehicleQuickView.tsx` | Host booking `SectionCard` block | Contains `title="Buchung"` and renders `bookingContext` |
| `frontend/src/operator/hooks/useOperatorVehicleQuickViewData.ts` | Booking context provider | Emits `kind` + hardcoded German `label` strings — presentation should map from `kind` in UI/adapter |
| `frontend/src/operator/lib/operator-vehicle-quick-view-i18n.ts` | Presentation adapter | Extend with booking context helpers + locale-aware datetime formatter |
| `frontend/src/i18n/translations/operator.vehicleQuickView.booking.en.ts` | EN dictionary slice | New bounded keys |
| `frontend/src/i18n/translations/operator.vehicleQuickView.booking.de.ts` | DE dictionary slice | Parity |

Optional (only if needed for enforce-clean boundary): extract `OperatorVehicleQuickViewBookingContext.tsx` — **not required** for boundedness.

**No speculative paths.**

---

## 45. Selected presentation inventory (~8 concepts)

| Concept | Current | Future key area |
|---------|---------|-----------------|
| Section title | `Buchung` | `operator.vehicleQuickView.booking.sectionTitle` |
| Pickup headline | `Abholung heute` | `…booking.kind.pickup` |
| Return headline | `Rückgabe heute` | `…booking.kind.return` |
| Active headline | `Aktive Buchung` | `…booking.kind.active` |
| Reserved headline | `Nächste Reservierung` | `…booking.kind.reserved` |
| Date/time display | fixed de-DE | adapter `formatOperatorVehicleQuickViewDateTime(locale, iso)` |
| Station separator | ` · ` | punctuation-only (no key) |
| Missing fallback | `—` | reuse `common` if available |

Dynamic data frozen: `customerName`, `station`, raw timestamps, `bookingId`, `status`.

---

## 46–52. Freeze contracts (selected target)

### Machine/domain freeze

| Machine value | Used by | Presentation map? | Unchanged |
|---------------|---------|-------------------|-----------|
| `bookingContext.kind` | label selection | **YES** → TranslationKey | enum values |
| `bookingId` | callbacks elsewhere | no | **YES** |
| `status` | business rules | no display in block | **YES** |
| ISO `when` | display + business time | formatter only | raw instant **YES** |
| `customerName`, `station` | display | no | **YES** |

### Callback/route/permission freeze

No actions in booking block — **N/A (none to change)**.

### Date/time freeze

Preserve raw ISO strings and business comparisons in hook; only replace `formatOperatorDateTime` usage in booking block with locale-aware adapter formatter.

### Number/unit freeze

Not applicable in this slice.

### Dynamic business data freeze

Do not translate customer name, station names, booking numbers, or user text.

### State preservation

Booking block is stateless display — same-mount locale switch preserves booking context object; only presentation strings change.

---

## 53–57. Adapter & keys

### Adapter strategy

**EXTEND EXISTING** `operator-vehicle-quick-view-i18n.ts`

Add:

- `operatorVehicleQuickViewBookingSectionTitle(locale)`
- `operatorVehicleQuickViewBookingKindLabel(locale, kind)`
- `formatOperatorVehicleQuickViewDateTime(locale, iso)` (presentation-only; mirror handover pattern)

Do **not** turn adapter into generic dump — booking namespace is cohesive with existing `operator.vehicleQuickView.*` slices.

### Key reuse analysis

| Key | Reuse |
|-----|-------|
| `operator.vehicleQuickView.booking.*` | **new (~6–8)** |
| `common.close` / em-dash | possible reuse for `—` |
| `bookings.*` | semantic overlap but no exact headline matches — prefer dedicated QV booking keys |
| `vehicle.bookings.*` | pickup/return verbs exist but not “today” headlines |

**Estimated new keys:** **8** (well under 70 gate)

### P231 enforce-clean boundary (proposed)

```text
P231_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickView.tsx', // booking block lines only — prefer extraction if enforce scope too wide
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
]
```

**Recommendation:** Optional extract `OperatorVehicleQuickViewBookingContext.tsx` to keep parent enforce boundary narrow (same pattern as P227–P230).

---

## 58–61. Guards, tests, Category E

### Blind-spot guards (future)

- booking kind map completeness (pickup/return/active/reserved)
- no raw `bookingContext.label` in component
- locale-aware datetime formatter used
- dynamic customer/station unchanged
- frozen slices untouched

### Future runtime test contract

- EN/DE render of booking block
- same-mount EN↔DE preserves `bookingContext` object identity fields
- `kind` unchanged across locale switch
- `customerName`, `station`, raw ISO unchanged
- formatted date changes with locale
- no raw TranslationKey / machine kind leakage

### Category E contract

Baseline: `3a5941862387b53b2d581287ce5edd4d68a291c9`

Required: business/runtime semantic modifications = **0**; Category E = **0**

Achievable by mapping `kind`→TranslationKey in presentation layer only.

---

## 62–65. Global freeze, shim, collision, main drift

### Global freeze contract

Future P231 must preserve all P230–P216 enforce-clean = 0 and `npm run i18n:check` PASS.

### Shim / compatibility

Current baseline: **29** shims, **0** new compat consumers. Future: shim ≤ 29.

### Active feature collision

| Active work | Collision |
|-------------|-----------|
| Communication Center C13.x (#1232 retention) | **LOW** (no QV paths) |
| Dashboard notifications (#1230/#1231) | **LOW** |
| Communication authority hotfix (#1225) | **LOW** for QV booking block |

**No HIGH/DIRECT collision** on selected P231 files.

### Main drift

| Item | Value |
|------|-------|
| Current `main` SHA | `9aab353bd3103848bfc3480aac3a710e75f5971c` |
| Commits after P230 baseline | **97** |
| `OperatorVehicleQuickView.tsx` drift vs baseline | **330 insertions / 277 deletions** (main has diverged heavily) |
| `operator-vehicle-quick-view-i18n.ts` on main | **removed** (main lacks P227–P230 stack) |

**Collision classification:** **LOW** for P231 implementation branching from `3a594186` (authoritative). **HIGH** note for eventual merge-to-main reconciliation — do not absorb moving main.

---

## 66. Implementation contract (if GO)

**TITLE:** P2.2.31 — Operator Vehicle Quick View Booking & Customer Context Localization

**AUTHORITATIVE BASE:** `3a5941862387b53b2d581287ce5edd4d68a291c9`

**IN SCOPE:**

- Booking context `SectionCard` presentation in QV parent (or extracted subcomponent)
- Booking kind headline mapping (`pickup` / `return` / `active` / `reserved`)
- Locale-aware datetime formatting for booking context display
- EN/DE keys under `operator.vehicleQuickView.booking.*`
- P231 tests + scanner guards

**OUT OF SCOPE:**

- P227–P230 frozen slices
- Blockers / Rental Health / Damages / Tire / Documents sections
- Booking workflow mutations, routes, permissions
- Communication Center, dashboard, global cleanup, shim cleanup

---

## 67–68. Audit artifact / PR topology

This file is the sole audit artifact.

Expected audit PR:

- Base: `3a5941862387b53b2d581287ce5edd4d68a291c9` (or `main` if repo policy requires — prefer baseline branch)
- Head: audit branch + 1 commit
- Changed files: **1**
- Production modified: **NO**

---

## 69. Final verdict

**A — GO — P2.2.31 TARGET SELECTED**

**Selected target:** P2.2.31 — Operator Vehicle Quick View Booking & Customer Context Localization

**Rationale:** Next DOM slice after frozen Quick Actions; highest machine/display separation; lowest business risk; no actions/callbacks; ≤8 new keys; daily operator visibility; clean `kind` enum already present in hook.

**Explicit confirmations:**

| Check | Value |
|-------|-------|
| production modified | **NO** |
| dictionaries modified | **NO** |
| tests modified | **NO** |
| scanner modified | **NO** |
| P2.2.31 implementation started | **NO** |
| merged | **NO** |
