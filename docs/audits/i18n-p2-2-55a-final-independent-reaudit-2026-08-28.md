# P2.2.55A — FINAL INDEPENDENT READ-ONLY RE-AUDIT
## Tenant Billing Tariff Summary + Pricing Breakdown + Tier Ladder

**Date:** 2026-08-28  
**Mode:** STRICT READ-ONLY INDEPENDENT VERIFICATION  
**Implementation PR:** #1362 (Draft, open — **DO NOT MERGE via this audit**)  
**Pre-flight:** PR #1361  
**Scope reassessment:** PR #1363 (Verdict B)  
**Authoritative baseline:** `314d9c63d176de4a1b30345d7f80ef13ba9b111d`  
**Implementation HEAD audited:** `becc8aa806a036f127cd64f97eaa1b4d72e1edad`  
**Audit branch:** `cursor/p2255a-final-independent-reaudit-3c10`  
**Campaign:** RENTAL  
**Frozen:** P216–P254

---

## Executive summary

| Gate | Result |
|------|--------|
| P255A bounded scope | **PASS** |
| P255B baseline restoration | **PASS** (zero diff vs baseline) |
| P255B-only keys remaining | **0** |
| New keys | **30** (≤32 **PASS**) |
| EN/DE parity | **8867 / 8867 — 100%** |
| Key budget | **PASS** |
| Provider/tier/money freeze | **PASS** |
| P254 freeze | **PASS** |
| P255A enforce-clean | **0** |
| P255B debt preserved | **9 findings** (not suppressed) |
| Category E | **0** |
| Validation (local) | **PASS** |
| Documentation | **PASS** (minor estimate note only) |
| **Final verdict** | **A — READY FOR P2.2.55A FREEZE / MERGE** |

---

## 1. PR / topology hard gate

| Check | Result |
|-------|--------|
| PR #1362 open | **YES** |
| Draft | **YES** |
| Merged | **NO** |
| Mergeable | **YES** |
| Base OID | `314d9c63d176de4a1b30345d7f80ef13ba9b111d` |
| HEAD OID | `becc8aa806a036f127cd64f97eaa1b4d72e1edad` |
| Commit count | **3** |
| Baseline is ancestor | **YES** |
| #1361/#1363 in commit ancestry | **NO** (referenced only in messages/docs) |

### Commit chain

| # | SHA | Parent | Classification |
|---|-----|--------|----------------|
| 1 | `f9a7b025c` | `314d9c63` ✓ | Combined implementation (historical) |
| 2 | `5c770fa28` | `f9a7b025c` | Doc-only count correction |
| 3 | `becc8aa80` | `5c770fa28` | **P255A scope reduction** |

---

## 2. Final diff forensics (`314d9c63...becc8aa80`)

### Changed paths (16 total)

| Path | Class |
|------|-------|
| `TenantBillingTariffVehiclesTab.tsx` | **A** — tariff shell |
| `TenantTariffSummarySection.tsx` | **B** — summary |
| `TenantPricingBreakdownSection.tsx` | **C** — breakdown |
| `BillingPriceTierLadder.tsx` | **D** — tier ladder |
| `rental-tenant-billing-i18n.ts` | **E** — bounded adapter |
| `tenant-tariff-vehicles.utils.ts` | **E** — P255A presentation migration (breakdown moved to adapter; P255B helpers retained) |
| `en.ts` / `de.ts` | **F** — dictionary |
| `hardcoded-copy-inventory.json` | **G** — scanner |
| `i18n-check.mjs` | **G** — test wiring |
| `rental-tenant-billing-tariff-vehicles-localization.test.tsx` | **H** — focused tests |
| `tenant-tariff-vehicles.utils.test.ts` | **H** — unit tests |
| `docs/audits/...implementation...md` | **I** — bookkeeping |
| `architecture/I18N_TENANT_BILLING...md` | **I** — bookkeeping |
| `ChangesView.tsx` / `ArchitekturView.tsx` | **I** — bookkeeping |

### Absent from diff (required)

| Path | Class | vs baseline |
|------|-------|-------------|
| `TenantBillableVehiclesTable.tsx` | **J** | **ZERO diff** |
| `TenantVehicleChangesSection.tsx` | **K** | **ZERO diff** |

### Semantic categories (required zero)

| Category | Count |
|----------|-------|
| L — financial semantic | **0** |
| M — tier semantic | **0** |
| N — metering semantic | **0** |
| O — provider transform | **0** |
| P — mutation | **0** |
| Q — frozen P254/P253–P249 | **0** (no production changes in frozen paths) |
| R — unrelated | **0** |

---

## 3. P255A exact production boundary

**Localized:**
- `TenantBillingTariffVehiclesTab.tsx` — intro + tariff-level load error only
- `TenantTariffSummarySection.tsx`
- `TenantPricingBreakdownSection.tsx`
- `BillingPriceTierLadder.tsx`
- `rental-tenant-billing-i18n.ts` — P255A exports only:
  - `resolveTenantBillingMoneyDisplay`
  - `resolvePlanKindDisplayLabel` (brand strings, no keys)
  - `formatTariffPeriodRangeDisplay`
  - `formatTierRangeDisplay`
  - `buildTariffPricingBreakdownRows`
- `tenant-tariff-vehicles.utils.ts` — retains `changeTypeLabel` / `changeTypeTone` for baseline P255B surfaces only; removed German `pricingBreakdownRows` / `planKindLabel` / `formatPeriodRange` (migrated to adapter)

**Not in enforce-clean scope:** P255B files (deferred debt visible).

---

## 4. P255B baseline restoration — PRIMARY GATE

```bash
git diff 314d9c63..becc8aa80 -- TenantBillableVehiclesTable.tsx TenantVehicleChangesSection.tsx
# → 0 lines
```

**VISIBLE/SEMANTIC DIFF = ZERO** — exact baseline content preserved.

Test certification: byte-for-byte comparison vs `git show 314d9c63:...` plus runtime render under EN locale still shows German P255B chrome.

---

## 5. P255B key negative gate

Searched final EN/DE for `vehicles.*`, `filter.*`, `col.*`, `pagination.*`, `changes.*`, `changeType.*`, `planKind.*`, `unitPriceRow`:

**Result: 0 P255B-only keys remaining.**

---

## 6. Dictionary accounting (independent)

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | **8837** | **8867** |
| DE | **8837** | **8867** |
| New keys | — | **30** |
| Removed | — | **0** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |

Method: `Object.keys(en/de)` on baseline export vs final export; tariff prefix delta = 30.

---

## 7. Exact 30-key inventory

| # | Key | Group | Used | Reuse |
|---|-----|-------|------|-------|
| 1 | `tenantBilling.tariff.intro` | SHARED | Tab | NEW justified |
| 2 | `tenantBilling.tariff.loadErrorTitle` | SHARED | Tab error | NEW justified |
| 3 | `tenantBilling.tariff.summary.title` | SUMMARY | Summary | NEW justified |
| 4 | `tenantBilling.tariff.summary.empty` | SUMMARY | Summary | NEW justified |
| 5 | `tenantBilling.tariff.summary.product` | SUMMARY | Summary | NEW justified |
| 6 | `tenantBilling.tariff.summary.planNameLabel` | SUMMARY | Summary | NEW justified |
| 7 | `tenantBilling.tariff.summary.billingInterval` | SUMMARY | Summary | NEW justified |
| 8 | `tenantBilling.tariff.summary.priceVersion` | SUMMARY | Summary | NEW justified |
| 9 | `tenantBilling.tariff.summary.contractStart` | SUMMARY | Summary | NEW justified |
| 10 | `tenantBilling.tariff.summary.nextPeriod` | SUMMARY | Summary | NEW justified |
| 11 | `tenantBilling.tariff.summary.cancellationStatus` | SUMMARY | Summary | NEW justified |
| 12 | `tenantBilling.tariff.breakdown.unavailable` | BREAKDOWN | Breakdown | NEW justified |
| 13 | `tenantBilling.tariff.breakdown.subtitleHint` | BREAKDOWN | Breakdown | NEW justified |
| 14 | `tenantBilling.tariff.breakdown.quantityColumn` | BREAKDOWN | Graduated table | NEW justified |
| 15 | `tenantBilling.tariff.breakdown.unitPriceColumn` | BREAKDOWN | Table + row | NEW justified |
| 16 | `tenantBilling.tariff.breakdown.subtotalColumn` | BREAKDOWN | Graduated table | NEW justified |
| 17 | `tenantBilling.tariff.breakdown.unitPricePerVehicle` | BREAKDOWN | Adapter row | NEW justified |
| 18 | `tenantBilling.tariff.breakdown.currencyRow` | BREAKDOWN | Adapter row | NEW justified |
| 19 | `tenantBilling.tariff.breakdown.calculatedAtRow` | BREAKDOWN | Adapter row | NEW justified |
| 20 | `tenantBilling.tariff.breakdown.pricingModelRow` | BREAKDOWN | Adapter row | NEW justified |
| 21 | `tenantBilling.tariff.tierLadder.emptyTitle` | TIER LADDER | Ladder | NEW justified |
| 22 | `tenantBilling.tariff.tierLadder.emptyDescription` | TIER LADDER | Ladder | NEW justified |
| 23 | `tenantBilling.tariff.tierLadder.fleetHint` | TIER LADDER | Ladder | NEW justified |
| 24 | `tenantBilling.tariff.tierLadder.current` | TIER LADDER | Ladder badge | NEW justified |
| 25 | `tenantBilling.tariff.tierLadder.notConfigured` | TIER LADDER | Ladder | NEW justified |
| 26 | `tenantBilling.tariff.tierLadder.perVehicleMonth` | TIER LADDER | Ladder | NEW justified |
| 27 | `tenantBilling.tariff.tierRange.singleOne` | TIER RANGE | Adapter | NEW justified |
| 28 | `tenantBilling.tariff.tierRange.singleExact` | TIER RANGE | Adapter | NEW justified |
| 29 | `tenantBilling.tariff.tierRange.range` | TIER RANGE | Adapter | NEW justified |
| 30 | `tenantBilling.tariff.tierRange.openEnded` | TIER RANGE | Adapter | NEW justified |

**Unused = 0 | Duplicate = 0 | Out-of-scope = 0**

---

## 8. Duplicate `unitPriceRow` closure

- `tenantBilling.tariff.breakdown.unitPriceRow` — **ABSENT** from final dictionaries
- Replacement: `tenantBilling.tariff.breakdown.unitPriceColumn` in `buildTariffPricingBreakdownRows` — **VERIFIED**

---

## 9. Key budget hard gate

**30 ≤ 32 → PASS**

---

## 10. Plan kind decision

`planKind.rental` / `planKind.fleet` keys **removed**.  
`resolvePlanKindDisplayLabel` returns stable brand strings (`SynqDrive Rental` / `SynqDrive Fleet`). Machine IDs (`RENTAL`/`FLEET`) not exposed. **ACCEPTABLE.**

---

## 11–20. Semantic freeze certifications

| Gate | Result |
|------|--------|
| Raw plan/interval/version/cancel/tier labels | **PRESERVED** (tests + adapter pass-through) |
| Pricing model machine (`VOLUME`/`GRADUATED`) | **UNCHANGED** — display via P254 keys |
| Tier thresholds / `isCurrent` / applied tier | **UNCHANGED** |
| Tier range presentation | **PRESENTATION ONLY** |
| Tier ladder visual semantics | **UNCHANGED** (count, order, highlight, prices) |
| Money cents/currency | **UNCHANGED** |
| Provider `formatted` precedence | **PRESERVED** (`123,45 € PROVIDER-X7` in tests) |
| `buildTariffPricingBreakdownRows` | **PRESENTATION-ONLY ROW BUILDER — ACCEPTABLE** |
| Financial/tax/rounding/proration | **ZERO DIFF** |
| Provider/dynamic translation | **NONE** |

### Breakdown row order (baseline `pricingBreakdownRows` vs final)

1. Billable vehicles count  
2. Applied tier label (raw)  
3. Unit price row (when applicable)  
4. Base → discounts → net → tax → gross → currency → calculatedAt → pricing model  

**Identical semantics; labels localized.**

---

## 21–24. Frozen surface regression

| Surface | Diff |
|---------|------|
| P254 adapter exports (unchanged bodies) | **ZERO** |
| P254 overview/shell production files | **ZERO** (not in diff) |
| P253–P249 | **ZERO** |
| Invoices / PM / Add-ons | **ZERO** |

---

## 25–27. Test quality

| Test area | Grade |
|-----------|-------|
| Same-mount DE→EN→DE (`billingSubTab=tariff-vehicles`) | **STRONG** |
| Raw provider fixtures (X7) | **STRONG** |
| P255B contamination in P255A tests | **NONE** |
| P255B deferred regression evidence | **STRONG** (byte diff + EN-locale render) |

**Focused tests:** 21/21 PASS (P255A + P254 overview + utils)

---

## 28–30. Scanner accounting

| Metric | Baseline | Final | Δ |
|--------|----------|-------|---|
| Global | 1438 | **1430** | **−8** |
| Rental | 341 | **333** | −8 |
| Finance/Billing | 59 | **51** | −8 |
| P255A paths | 8 | **0** | **−8 closure** |
| P255B paths | 9 | **9** | **0 (preserved)** |

**No suppression.** P255B findings remain in inventory.

---

## 31. Category E

**Category E = 0** — presentation-only localization.

---

## 32. Documentation consistency

| Artifact | P255A scope | 30 keys | 8867 | Scanner | P255B deferred |
|----------|-------------|---------|------|---------|----------------|
| PR #1362 body | ✓ | ✓ | ✓ | ✓ | ✓ |
| Implementation audit | ✓ | ✓ | ✓ | ✓ | ✓ |
| Architecture artifact | ✓ | ✓ | ✓ | ✓ | ✓ |
| ChangesView | ✓ | ✓ | ✓ | — | ✓ |
| ArchitekturView | ✓ | ✓ | ✓ | — | ✓ |

**No stale 57/52/8894/8889/full-completed claims** in current artifacts (57 referenced only as historical in implementation audit).

**Minor note:** Implementation audit lists "P255A enforce-clean 13 (est.)" — independent count is **8** baseline findings on P255A paths. Non-blocking; final state (0) is correct.

---

## 33. Commit 3 forensics (`becc8aa80`)

**Changed:** 13 files — dictionary removals (27 P255B keys + duplicate + planKind), P255B file restoration, test refactor, adapter trim, docs update, inventory regen.

**No unrelated production changes.**

---

## 34. Validation (local, independent)

| Check | Result |
|-------|--------|
| P255A focused tests | **15/15 PASS** |
| P254 regression tests | **6/6 PASS** |
| `npm run i18n:check` | **PASS** |
| `npm run check:surface` | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** (no conflict markers; trailing whitespace only in architecture doc from prior commit) |

---

## 35. CI triage (#1362 @ `becc8aa80`)

| Failure | Classification |
|---------|----------------|
| Vehicle Detail Typecheck | **Pre-existing** (unrelated module) |
| Legal Documents Typecheck | **Pre-existing** |
| Vehicle Detail Backend unit tests | **Pre-existing** |
| Vehicle Detail Playwright E2E | **Pre-existing** |
| Frontend component tests | **PASS** |
| Production build (CI) | **PASS** |

**P255A-caused required CI failures = 0**

---

## 36. Active collision

No HIGH/DIRECT collision with active Billing/Pricing work on P255A paths.

---

## 37. Progress accounting

| Metric | Value |
|--------|-------|
| Pre-P255A baseline completion | ~85.5% central |
| Post-P255A global scanner | 1430 (−8 from 1438) |
| P255A closure | 8 findings |
| P255B deferred debt | 9 findings |
| Remaining mounted Tenant Billing | Invoices (high), PM (~6), Add-ons (~2) |
| Conservative completion | **~85.6%** |
| Central | **~85.7%** |
| Optimistic | **~85.8%** |
| Confidence | **High** for P255A; P255B debt explicit |

**P255B not credited.**

---

## 38. Next slice

**P2.2.55B — Billable Vehicles + Vehicle Changes** (next immediate slice).  
**P256 (Invoices) blocked** until P255B handled.

---

## 39. Claim reconciliation (selected)

| Claim | #1362 | Independent | PASS |
|-------|-------|-------------|------|
| 3 commits | ✓ | ✓ | ✓ |
| Direct baseline ancestry | ✓ | ✓ | ✓ |
| P255A-only scope | ✓ | ✓ | ✓ |
| P255B restored | ✓ | ✓ (0-line diff) | ✓ |
| 30 keys | ✓ | ✓ | ✓ |
| 8867/8867 | ✓ | ✓ | ✓ |
| Scanner 1430/333/51 | ✓ | ✓ | ✓ |
| P255A enforce-clean 0 | ✓ | ✓ | ✓ |
| P255B debt 9 | ✓ | ✓ | ✓ |
| Provider raw preserved | ✓ | ✓ | ✓ |
| Tier/money semantics | ✓ | ✓ | ✓ |
| P254 freeze | ✓ | ✓ | ✓ |
| Category E 0 | ✓ | ✓ | ✓ |
| Tests/build/check | ✓ | ✓ (local) | ✓ |

---

## 40. Correction threshold

**No corrections required.**

---

## Final verdict

# **A — READY FOR P2.2.55A FREEZE / MERGE**

**PR #1362 may be marked ready and merged as P2.2.55A.**

**P255B remains deferred and becomes the next campaign slice.**

**DO NOT START P256.**

---

## Changes / Architektur update status

**Not updated** — read-only audit. Implementation PR already contains corrected bookkeeping from commit 3.
