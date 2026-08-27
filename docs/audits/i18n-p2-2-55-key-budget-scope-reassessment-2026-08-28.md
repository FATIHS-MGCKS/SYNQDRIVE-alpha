# P2.2.55 — KEY-BUDGET / SCOPE REASSESSMENT
## Tenant Billing Tariff & Vehicles — STRICT READ-ONLY CORRECTION AUDIT

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY REASSESSMENT  
**Implementation PR under review:** #1362 (Draft, open, **DO NOT MERGE**)  
**Pre-flight PR:** #1361 (Verdict A — GO)  
**Authoritative baseline:** `314d9c63d176de4a1b30345d7f80ef13ba9b111d`  
**Implementation HEAD:** `5c770fa2859a04f341d496bde6c90869ed17bba3`  
**Reassessment branch:** `cursor/p2255-key-budget-scope-reassessment-3c10`  
**Campaign:** RENTAL  
**Frozen:** P216–P254  
**P255 status:** **UNFROZEN** — final re-audit blocked until correction

---

## Executive summary

| Item | Result |
|------|--------|
| Proven new keys | **57** (`tenantBilling.tariff.*` only) |
| Pre-flight estimate | **24–30** |
| Key-budget gate (>40) | **FAILED** |
| Irreducible combined (after legitimate reuse) | **~48–51** |
| Combined slice safe | **NO** |
| Split required | **YES** |
| Semantic / provider / tier freeze | **PASS** |
| **Final verdict** | **B — SPLIT REQUIRED — REDUCE #1362 TO P255A** |

**PR #1362 MUST NOT BE MERGED IN ITS CURRENT FORM.**  
**DO NOT START P256.**

---

## 1. Provenance

### PR #1362 verification

| Check | Result |
|-------|--------|
| Open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** |
| Base | `314d9c63d176de4a1b30345d7f80ef13ba9b111d` |
| HEAD | `5c770fa2859a04f341d496bde6c90869ed17bba3` |
| Commit count | **2** |

### Commit forensics

| # | SHA | Parent | Classification | Changed paths |
|---|-----|--------|----------------|---------------|
| 1 | `f9a7b025c` | `314d9c63` ✓ | **IMPLEMENTATION** | 18 files — adapter, 6 components, utils, en/de, tests, inventory, ChangesView, ArchitekturView, architecture artifact, implementation audit |
| 2 | `5c770fa28` | `f9a7b025c` | **DOC-ONLY COUNT CORRECTION** | 1 file — `docs/audits/i18n-p2-2-55-tenant-billing-tariff-vehicles-implementation-2026-08-28.md` (table counts 52→57; note text still says 52) |

**Second commit fully resolved count drift = NO** — architecture artifact (`+52`, 8837→8889), ChangesView, ArchitekturView, and implementation audit note line remain stale.

---

## 2. Dictionary accounting (independent recompute)

| Metric | Baseline (`314d9c63`) | Final (`5c770fa28`) |
|--------|----------------------|---------------------|
| EN keys | **8837** | **8894** |
| DE keys | **8837** | **8894** |
| New keys | — | **57** |
| Removed keys | — | **0** |
| Changed existing keys | — | **0** |
| Orphans | 0 | **0** |
| EN/DE parity | 100% | **100%** |

All 57 new keys are `tenantBilling.tariff.*`. No non-tariff dictionary additions.

---

## 3. Exact 57-key inventory (57/57)

Legend: **Sub-surface** A=Summary B=Breakdown C=Tier ladder D=Tier range E=Vehicles F=Changes G=Shared H=Change-type I=Plan-kind. **Classification** per audit taxonomy.

| # | Key | EN | Sub | Class | Runtime | Reuse candidate | Dup? | Required P255? |
|---|-----|----|----|-------|---------|-----------------|------|----------------|
| 1 | `tenantBilling.tariff.intro` | Plan, pricing, and billable vehicles… | G | F | Tab mount | — | No | Yes |
| 2 | `tenantBilling.tariff.loadErrorTitle` | Plan & vehicles could not be loaded | G | F | Tab error | `tenantBilling.overview.loadError` (semantic) | No | Yes |
| 3 | `tenantBilling.tariff.summary.title` | Plan | A | A | Summary | — | No | Yes |
| 4 | `tenantBilling.tariff.summary.empty` | No active plan on file. | A | A | Summary | — | No | Yes |
| 5 | `tenantBilling.tariff.summary.product` | Product | A | A | Summary | — | No | Yes |
| 6 | `tenantBilling.tariff.summary.planNameLabel` | Plan name | A | A | Summary | — | No | Yes |
| 7 | `tenantBilling.tariff.summary.billingInterval` | Billing interval | A | A | Summary | — | No | Yes |
| 8 | `tenantBilling.tariff.summary.priceVersion` | Price version | A | A | Summary | — | No | Yes |
| 9 | `tenantBilling.tariff.summary.contractStart` | Contract start | A | A | Summary | — | No | Yes |
| 10 | `tenantBilling.tariff.summary.nextPeriod` | Next period | A | A | Summary | `vehicle.bookings.nextPeriod` (weak) | No | Yes |
| 11 | `tenantBilling.tariff.summary.cancellationStatus` | Cancellation status | A | A | Summary | — | No | Yes |
| 12 | `tenantBilling.tariff.breakdown.unavailable` | Cost breakdown is not available yet. | B | B | Breakdown | — | No | Yes |
| 13 | `tenantBilling.tariff.breakdown.subtitleHint` | {model} · {count} billable vehicles | B | B | Breakdown | — | No | Yes |
| 14 | `tenantBilling.tariff.breakdown.quantityColumn` | Quantity | B | B | Graduated table | `invoiceLineItem.col.quantity` (semantic) | No | Yes |
| 15 | `tenantBilling.tariff.breakdown.unitPriceColumn` | Unit price | B | B | Graduated table | — | No | Yes |
| 16 | `tenantBilling.tariff.breakdown.subtotalColumn` | Subtotal | B | B | Graduated table | `invoices.subtotal` (semantic) | No | Yes |
| 17 | `tenantBilling.tariff.breakdown.unitPriceRow` | Unit price | B | **J** | Adapter row | **`breakdown.unitPriceColumn` EXACT** | **Yes** | No (dup) |
| 18 | `tenantBilling.tariff.breakdown.unitPricePerVehicle` | {amount} per vehicle | B | B | Adapter row | — | No | Yes |
| 19 | `tenantBilling.tariff.breakdown.currencyRow` | Currency | B | B | Adapter row | `billing.customerPayments.currency` (semantic) | No | Yes |
| 20 | `tenantBilling.tariff.breakdown.calculatedAtRow` | Calculation as of | B | B | Adapter row | — | No | Yes |
| 21 | `tenantBilling.tariff.breakdown.pricingModelRow` | Pricing model | B | B | Adapter row | — | No | Yes |
| 22 | `tenantBilling.tariff.tierLadder.emptyTitle` | Price tiers have not been configured yet. | C | C | Tier ladder | — | No | Yes |
| 23 | `tenantBilling.tariff.tierLadder.emptyDescription` | … | C | C | Tier ladder | — | No | Yes |
| 24 | `tenantBilling.tariff.tierLadder.fleetHint` | Fleet pricing model: {model} | C | C | Tier ladder | — | No | Yes |
| 25 | `tenantBilling.tariff.tierLadder.current` | Current | C | C | Tier badge | — | No | Yes |
| 26 | `tenantBilling.tariff.tierLadder.notConfigured` | Not configured yet | C | C | Tier ladder | `tenantBilling.overview.taxMissing` (weak) | No | Yes |
| 27 | `tenantBilling.tariff.tierLadder.perVehicleMonth` | per vehicle / month | C | C | Tier ladder | — | No | Yes |
| 28 | `tenantBilling.tariff.tierRange.singleOne` | 1 vehicle | D | B | Adapter | — | No | Yes |
| 29 | `tenantBilling.tariff.tierRange.singleExact` | {count} vehicles | D | B | Adapter | — | No | Yes |
| 30 | `tenantBilling.tariff.tierRange.range` | {min}–{max} vehicles | D | B | Adapter | — | No | Yes |
| 31 | `tenantBilling.tariff.tierRange.openEnded` | {min}+ vehicles | D | B | Adapter | — | No | Yes |
| 32 | `tenantBilling.tariff.vehicles.title` | Vehicles in billing | E | D | Vehicle table | — | No | Yes |
| 33 | `tenantBilling.tariff.vehicles.loadErrorTitle` | Vehicle list could not be loaded | E | D | Vehicle table | — | No | Yes |
| 34 | `tenantBilling.tariff.vehicles.searchPlaceholder` | Search plate or model… | E | D | Vehicle table | — | No | Yes |
| 35 | `tenantBilling.tariff.filter.allStatuses` | All statuses | E | **I** | Filter | `tasks.filter.statusAll` EXACT EN | No | Yes |
| 36 | `tenantBilling.tariff.filter.billable` | Billable | E | D | Filter | — | No | Yes |
| 37 | `tenantBilling.tariff.filter.excluded` | Not billable | E | D | Filter | — | No | Yes |
| 38 | `tenantBilling.tariff.vehicles.emptyTitle` | No vehicles in billing | E | D | Vehicle table | — | No | Yes |
| 39 | `tenantBilling.tariff.vehicles.emptyDescription` | … | E | D | Vehicle table | — | No | Yes |
| 40 | `tenantBilling.tariff.col.station` | Location | E | **I** | Table header | `fleetConnectivity.detail.location` (semantic) | No | Yes |
| 41 | `tenantBilling.tariff.col.billableFrom` | Billable from | E | D | Table header | — | No | Yes |
| 42 | `tenantBilling.tariff.col.billableUntil` | Billable until | E | D | Table header | — | No | Yes |
| 43 | `tenantBilling.tariff.col.billingStatus` | Billing status | E | D | Table header | — | No | Yes |
| 44 | `tenantBilling.tariff.col.reason` | Reason | E | **I** | Table header | `workflowAutomation.diff.reason` (semantic) | No | Yes |
| 45 | `tenantBilling.tariff.pagination.shownOfTotal` | {shown} of {total} vehicles | E | D | Pagination | — | No | Yes |
| 46 | `tenantBilling.tariff.pagination.page` | Page {page} of {totalPages} | E/F | D | Pagination | No global `pagination.*` key | No | Yes |
| 47 | `tenantBilling.tariff.changes.title` | Changes to vehicle count | F | E | Changes | — | No | Yes |
| 48 | `tenantBilling.tariff.changes.subtitle` | Added or removed vehicles… | F | E | Changes | — | No | Yes |
| 49 | `tenantBilling.tariff.changes.loadErrorTitle` | Changes could not be loaded | F | E | Changes | — | No | Yes |
| 50 | `tenantBilling.tariff.changes.emptyTitle` | No vehicle changes yet | F | E | Changes | — | No | Yes |
| 51 | `tenantBilling.tariff.changes.vehicleFallback` | Vehicle | F | **I** | Changes | `bookings.vehicle` EXACT | No | Yes |
| 52 | `tenantBilling.tariff.changes.prorationLabel` | Prorated amount | F | E | Changes | — | No | Yes |
| 53 | `tenantBilling.tariff.changeType.added` | Added | H | **I** | Adapter | `rentalRules.workflow.publish.kindAdded` EXACT | No | Defer to P255B |
| 54 | `tenantBilling.tariff.changeType.removed` | Removed | H | **I** | Adapter | `rentalRules.workflow.publish.kindRemoved` EXACT | No | Defer to P255B |
| 55 | `tenantBilling.tariff.changeType.changed` | Changed | H | **I** | Adapter | `rentalRules.workflow.publish.kindChanged` EXACT | No | Defer to P255B |
| 56 | `tenantBilling.tariff.planKind.rental` | SynqDrive Rental | I | **L** | Adapter | Brand string; EN=DE | No | Optional |
| 57 | `tenantBilling.tariff.planKind.fleet` | SynqDrive Fleet | I | **L** | Adapter | Brand string; EN=DE | No | Optional |

**A11y keys created:** **0** (none — PASS)  
**Mobile/desktop duplicate pairs:** **0** (desktop table only)  
**Machine billing status keys:** **0** — uses raw `billingStatusLabel`  
**Unused keys:** **0**  
**Dynamic/provider accidents:** **0**  
**MACHINE DATA ACCIDENT:** **0**

---

## 4. Pre-flight estimate forensics (PR #1361)

Pre-flight predicted **~24–30** new keys from bucketed estimates. Implementation required **57**.

### Quantified delta sources

| Cause | Pre-flight est. | Actual keys | Δ |
|-------|-----------------|-------------|---|
| Scanner TSX findings (17 strings) | ~17 mapped ~1:1 | 17 strings removed | Baseline anchor |
| **Utils blind-spot** (`tenant-tariff-vehicles.utils.ts` = 0 scanner) | ~15 acknowledged | 15 keys (adapter: tier range 4, change types 3, plan kind 2, breakdown rows 6) | **+12–15 vs bucket** |
| Tariff summary row labels | 8 | 9 | +1 |
| Pricing breakdown (non-reused) | 4 | 10 | **+6** (columns + meta rows underestimated) |
| Tier ladder | 5 | 6 | +1 |
| Tier range grammar (adapter-only) | **not budgeted** | 4 | **+4** |
| Vehicle table | 10 | 15 | **+5** (5 col headers + pagination) |
| Vehicle changes | 5 | 6 | +1 |
| Tab shell / errors | 2 | 2 | 0 |
| Duplicate `unitPriceRow` | 0 | 1 | +1 |
| Plan kind | 2 | 2 | 0 |
| Change types | 3 | 3 | 0 |
| **Total** | **24–30** | **57** | **+27–33** |

**Root cause:** Pre-flight correctly identified the utils blind-spot (~15) but **under-budgeted adapter-only strings** (tier-range grammar, breakdown meta rows, table columns, pagination) and **collapsed multiple sub-surfaces into single buckets**. The scanner's 17 TSX findings were treated as approximate key count; implementation correctly created **separate keys per semantic surface** (columns vs rows vs filters), inflating count beyond scanner cardinality.

---

## 5. Scanner vs key count

| Metric | Baseline | Final | Δ |
|--------|----------|-------|---|
| Global scanner | 1438 | 1421 | **−17** |
| Rental | 341 | 324 | **−17** |
| Finance/Billing | 59 | 42 | **−17** |

**Relationship:** Scanner −17 counts **hardcoded string literals removed from TSX** in enforce-clean paths. Keys +57 because:

1. **One scanner finding ≠ one key** when a single German string becomes multiple semantic keys (e.g. tier range → 4 grammar variants).
2. **Adapter-only strings** (utils had 0 scanner findings) produced ~15 keys never in scanner inventory.
3. **Table infrastructure** (5 column headers, 2 pagination, 3 filters) were partially rolled into pre-flight "vehicle table: 10" bucket.
4. **P254 reuse** removed need for some keys but added tariff-namespace keys for tariff-specific semantics.

**Classification:** **EXPECTED STATIC-ANALYSIS LIMITATION** — not a governance coverage defect. Pre-flight explicitly documented utils blind-spot; estimate arithmetic was optimistic, not scanner-suppressed.

---

## 6–16. Reuse audits (summary)

### P254 `tenantBilling.*` — no harmful duplication

P255 **reused** (not re-keyed): `overview.billableVehicles`, `overview.pricingTier`, `overview.rowBase`, `overview.taxMissing`, `pricingModel.*`, `tab.*`, `status.*`. No duplicate P254 keys created.

### Generic reuse opportunities

| Key | Verdict | Candidate |
|-----|---------|-----------|
| `breakdown.unitPriceRow` | **EXACT REUSE** | `breakdown.unitPriceColumn` |
| `filter.allStatuses` | SEMANTIC | `tasks.filter.statusAll` |
| `changes.vehicleFallback` | SEMANTIC | `bookings.vehicle` |
| `changeType.*` (×3) | SEMANTIC | `rentalRules.workflow.publish.kind*` |
| `col.station` | SEMANTIC | `fleetConnectivity.detail.location` |
| `planKind.*` (×2) | DEFER | Hardcode brand strings (EN=DE) |
| `pagination.page` | NEW JUSTIFIED | No global pagination key with same pattern |
| `common.retry/back/next` | **Already reused** | ✓ |

### Mobile/desktop, a11y, status, pagination, empty/error

- **Mobile/desktop:** N/A — no duplicate pairs.
- **A11y:** 0 dedicated keys — correct.
- **Status:** Raw `billingStatusLabel` preserved; filter uses machine `billingStatus` enum only.
- **Pagination:** `common.back/next` reused for buttons; page label is domain-specific — justified new.
- **Empty/error/loading:** `common.retry` reused; section-specific error titles justified.

---

## 17. Sub-surface key counts

| Sub-surface | New keys |
|-------------|----------|
| G — Shared chrome (intro, tab error) | 2 |
| A — Tariff summary | 9 |
| B — Pricing breakdown | 10 |
| C — Tier ladder | 6 |
| D — Tier range (adapter) | 4 |
| E — Billable vehicles table (+filter/pagination) | 15 |
| F — Vehicle changes | 6 |
| H — Change types (adapter) | 3 |
| I — Plan kind (adapter) | 2 |
| **Total** | **57** |

---

## 18–24. Production change forensics & semantic freeze

All P255 production hunks classified **PRESENTATION ONLY** or **MACHINE→DISPLAY MAPPING** (locale-aware). Zero modifications in:

- FINANCIAL LOGIC, PRICING LOGIC, TIER LOGIC, METERING LOGIC
- BILLABILITY / PRORATION / FILTER / PAGINATION predicates
- PERMISSION / PROVIDER TRANSFORM

### Provider money precedence — PASS

`resolveTenantBillingMoneyDisplay` and `buildTariffPricingBreakdownRows` use API `*.formatted` when present. Tests assert `123,45 € PROVIDER-X7` preservation. No callsite switched from `.formatted` to reconstructed cents when formatted exists.

### Tier / metering / vehicle identity — PASS (frozen)

`appliedTier`, `priceTiers[].isCurrent`, `minVehicles`, `maxVehicles`, `unitPrice`, `billableVehicleCount`, `connectedVehicleCount`, `billingStatus`, `billableFrom`/`billableUntil`, vehicle inclusion — unchanged semantically.

### Raw provider fixtures — PASS

All X7 fixtures preserved in localization tests.

---

## 19–20. Adapter audit

| Export | Classification |
|--------|----------------|
| `resolveTenantBillingMoneyDisplay` | FORMAT PRESENTATION |
| `resolvePlanKindDisplayLabel` | MACHINE DISPLAY MAPPING |
| `formatTariffPeriodRangeDisplay` | FORMAT PRESENTATION |
| `formatTierRangeDisplay` | FORMAT PRESENTATION |
| `resolveVehicleChangeTypeLabel` | MACHINE DISPLAY MAPPING |
| `buildTariffPricingBreakdownRows` | **PRESENTATION ROW BUILDER** |

### `buildTariffPricingBreakdownRows` gate: **A**

Presentation-only row projection. Row order and raw value selection match baseline `pricingBreakdownRows()` in `tenant-tariff-vehicles.utils.ts`. No financial calculation. Uses `formatted` precedence. Reuses P254 overview keys and `invoiceLineItem.summary.*`.

---

## 26–27. Documentation count inconsistency

| Artifact | Claimed | Truth | Status |
|----------|---------|-------|--------|
| PR #1362 body | 57 keys, 8837→8894 | 57, 8894 | **ACCURATE** |
| Implementation audit table | 57, 8894 | 57, 8894 | **ACCURATE** |
| Implementation audit note | "52 keys" | 57 | **STALE** |
| Architecture artifact | 52, 8837→8889 | 57, 8894 | **STALE** |
| ChangesView | 52, 8889 | 57, 8894 | **STALE** |
| ArchitekturView | +52 | +57 | **STALE** |

**Second commit fully resolved count drift = NO**

---

## 28–31. Scope split analysis

| Option | Keys | Files | Risk | Coherence |
|--------|------|-------|------|-----------|
| A — Summary + Breakdown | ~21 | 3 + adapter partial | Low | High |
| B — Tier ladder + range | ~10 | 1 + adapter partial | Low | High |
| C — Billable vehicles | ~15 | 1 | Low | Medium alone |
| D — Vehicle changes | ~9 | 1 + change types | Low | Medium alone |
| E — Full combined | 57 | 8 | Medium (key budget) | High UX |

### Maximum safe slice size

Legitimate reuse ceiling: **X=1, Y=4–6, Z=0** → irreducible **~50–52**. **>40 → SPLIT REQUIRED.**

### Target key count after reuse

| | Count |
|--|-------|
| Current new keys | 57 |
| Exact reuse (duplicate `unitPriceRow`) | −1 |
| Semantic reuse (conservative: vehicleFallback, allStatuses) | −2 |
| Semantic reuse (optional: changeType×3, planKind×2) | −5 |
| **Irreducible combined** | **~49–51** |

### Optimal split (repository truth)

| Slice | Scope | Keys (net) | Production files |
|-------|-------|------------|------------------|
| **P255A** | Tariff summary + pricing breakdown + tier ladder + shared chrome + plan kind | **~31** (29 if planKind hardcoded) | `TenantBillingTariffVehiclesTab`, `TenantTariffSummarySection`, `TenantPricingBreakdownSection`, `BillingPriceTierLadder`, adapter partial |
| **P255B** | Billable vehicles + vehicle changes | **~24** | `TenantBillableVehiclesTable`, `TenantVehicleChangesSection`, adapter partial (change types) |

**P255A first** — lower financial surface, closes tariff/pricing/tier scanner debt, testable without vehicle pagination complexity.

---

## 32–37. Salvage & boundaries

### #1362 salvage strategy: **B — SPLIT REQUIRED — REDUCE #1362 TO P255A**

Do **not** close and reimplement (C) unless dictionary/history cleanup is preferred — implementation quality is sound; key budget is the blocker.

### P255A exact boundary (first correction)

**Include:**
- `TenantBillingTariffVehiclesTab.tsx` (intro + tariff error only)
- `TenantTariffSummarySection.tsx`
- `TenantPricingBreakdownSection.tsx`
- `BillingPriceTierLadder.tsx`
- Adapter: `resolvePlanKindDisplayLabel`, `formatTariffPeriodRangeDisplay`, `formatTierRangeDisplay`, `buildTariffPricingBreakdownRows`, `resolveTenantBillingMoneyDisplay`
- Keys: `tenantBilling.tariff.intro`, `loadErrorTitle`, `summary.*`, `breakdown.*` (minus duplicate row), `tierLadder.*`, `tierRange.*`, `planKind.*` (or hardcode)
- Tests: enforce-clean P255A paths, breakdown/tier unit tests, same-mount partial (summary/breakdown/ladder visible)

**Exclude (defer P255B):**
- `TenantBillableVehiclesTable.tsx`
- `TenantVehicleChangesSection.tsx`
- Keys: `vehicles.*`, `filter.*`, `col.*`, `pagination.*`, `changes.*`, `changeType.*`
- Utils: keep `changeTypeTone` only; defer change-type label adapter

### P255B deferred boundary

All vehicle table/changes keys and components remain untouched until P255B. Do not falsely declare P255B paths enforce-clean in P255A.

### Enforce-clean P255A scanner boundary

1. `TenantBillingTariffVehiclesTab.tsx`
2. `TenantTariffSummarySection.tsx`
3. `TenantPricingBreakdownSection.tsx`
4. `BillingPriceTierLadder.tsx`
5. `rental-tenant-billing-i18n.ts` (P255A exports only)
6. `tenant-tariff-vehicles.utils.ts` — **partial** (only if P255A removes remaining German strings; else defer file)

---

## 38. Test quality audit

| Test | Classification |
|------|----------------|
| P255 enforce-clean zero | REUSABLE P255A (partial paths) / COMBINED-ONLY for full 8-path |
| P254 enforce-clean regression | REUSABLE |
| Sub-tab query semantics | REUSABLE |
| Raw provider + breakdown rows | REUSABLE P255A |
| Tier range display | REUSABLE P255A |
| Same-mount DE↔EN full tab | **COMBINED-ONLY** — split needs P255A-scoped variant |
| `tenant-tariff-vehicles.utils.test.ts` | REUSABLE P255A (breakdown rows) |

---

## 39–41. Validation & Category E

| Check | Status | Overrides key-budget? |
|-------|--------|---------------------|
| `npm run i18n:check` | PASS (500 tests; 1 post-teardown Iconify warning) | **NO** |
| `npm run check:surface` | PASS | **NO** |
| `npm run build` | PASS | **NO** |
| Category E | **0** | — |

**Validation PASS does not waive key-budget NO-GO.**

---

## 42–43. Collision & progress

- **Main collision:** No HIGH/DIRECT collision for P255A tariff/pricing/tier slice.
- **#1362 not counted as complete.** Frozen campaign remains P216–P254.
- **Global completion baseline:** ~85.3–85.7% (central ~85.5%). No progress credit until corrected P255 merge.

---

## 44. Final verdict

# **B — SPLIT REQUIRED — REDUCE #1362 TO P255A**

**PR #1362 MUST NOT BE MERGED IN ITS CURRENT FORM.**  
**P255 REMAINS UNFROZEN.**  
**DO NOT START P256.**

### Required corrections before final re-audit

1. Reduce #1362 to P255A scope (~29–31 keys after duplicate removal).
2. Defer vehicle table/changes to P255B (~24 keys).
3. Align all documentation artifacts to **57 → split counts** (architecture, ChangesView, ArchitekturView, implementation audit note).
4. Remove duplicate `breakdown.unitPriceRow`; apply conservative semantic reuse where quality-neutral.
5. Re-run key-budget gate on P255A independently (target ≤32).

---

## Changes / Architektur update status

**Not updated** — read-only audit. Implementation PR documentation drift documented above; correction deferred to implementation follow-up.
