# P2.2.55 — Tenant Billing Tariff & Vehicles Pre-Flight
## Rental i18n Production Hardening

**Date:** 2026-08-27  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Authoritative baseline:** `314d9c63d176de4a1b30345d7f80ef13ba9b111d`  
**Baseline origin:** Merged PR #1359 (P2.2.54)  
**Merged implementation HEAD:** `1667b4a9782d0928dc3043cbf0b8f802644db411`  
**P254 re-audit:** PR #1360 (Verdict B)  
**Campaign:** RENTAL  
**Frozen:** P216–P254

---

## PART A — P254 post-merge baseline

### 1. Merge provenance

| Check | Result |
|-------|--------|
| PR #1359 merged | **YES** (`mergedAt: 2026-08-27T20:58:40Z`) |
| PR #1359 closed | **YES** (`state: MERGED`) |
| Merge commit | `314d9c63d176de4a1b30345d7f80ef13ba9b111d` |
| Merged implementation HEAD | `1667b4a9782d0928dc3043cbf0b8f802644db411` |
| Merge strategy | **Merge commit** (1 implementation squash commit on branch, merge commit on baseline) |
| Implementation commits in PR | **1** |
| Current main SHA | `61a3578e8db4b6aa99d6b15bde7ad0c8a8a4de8a` |
| Campaign baseline vs main | **Intentionally separate** — main includes #1347 fleet work and lacks P254 merge on campaign branch |

**Topology:** VALID

### 2. Baseline health (verified on `314d9c63`)

| Metric | Expected | Actual |
|--------|----------|--------|
| EN | 8837 | **8837** |
| DE | 8837 | **8837** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P254 enforce-clean | 0 | **0** |
| P253–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| Global scanner | ≈1438 | **1438** |
| Rental scanner | ≈341 | **341** |
| Finance/Billing | ≈59 | **59** |
| `npm run i18n:check` | PASS | **PASS** |
| `npm run check:surface` | PASS | **PASS** |
| Category E | 0 | **0** |

### 3. P254 freeze verification

P254 enforce-clean scope (8 paths): **0 findings**. P255 must not alter P254 display/business behavior. Shared adapter extension allowed only if P254 call paths remain value-equivalent.

---

## PART B — Mounted Tariff & Vehicles runtime map

### Route

`Settings` → `settingsTab=billing` → `billingSubTab=tariff-vehicles`

### Mount chain (all production-mounted)

```
BillingTab
  └─ useBillingTariffVehicles(orgId)
  └─ TenantBillingTariffVehiclesTab
       ├─ TenantTariffSummarySection
       ├─ TenantPricingBreakdownSection
       ├─ BillingPriceTierLadder (conditional on priceTiers)
       ├─ TenantBillableVehiclesTable
       └─ TenantVehicleChangesSection
```

**Hook (read-only):** `useBillingTariffVehicles.ts` — fetches tariff, billable vehicles, vehicle changes; local filter/pagination state only.

**API endpoints:** `orgSubscriptionTariff`, `orgBillableVehiclesList`, `orgVehicleBillingChanges`.

### Sub-surface map

| ID | Surface | Component | Scanner | Blind-spot |
|----|---------|-----------|---------|------------|
| A | Tariff summary | `TenantTariffSummarySection` | 1 | ~9 row labels |
| B | Pricing breakdown | `TenantPricingBreakdownSection` | 3 | utils row labels |
| C | Billable vehicles | `TenantBillableVehiclesTable` | 5 | table headers, filters |
| D | Vehicle changes | `TenantVehicleChangesSection` | 4 | pagination chrome |
| E | Tier ladder | `BillingPriceTierLadder` | 2 | title, empty, “Aktuell” |
| F | Tab shell | `TenantBillingTariffVehiclesTab` | 2 | — |
| G | Utils | `tenant-tariff-vehicles.utils.ts` | **0** | **~15 strings** |

**Total scanner (7 paths):** **17**  
**Estimated total actionable (incl. utils blind-spot):** **~32–38**

---

## PART C — Pricing / tier / metering / vehicle domain

### Domain classification (selected fields)

| Field | Classification | P255 rule |
|-------|----------------|-----------|
| `planName` | BACKEND/PROVIDER TEXT | Raw |
| `billingIntervalLabel` | BACKEND/PROVIDER TEXT | Raw |
| `priceVersionLabel` | BACKEND/PROVIDER TEXT | Raw |
| `cancellationStatusLabel` | BACKEND/PROVIDER TEXT | Raw |
| `appliedTierLabel` / `tier.label` / `tierLabel` | BACKEND/PROVIDER TEXT | Raw |
| `pricingModel` | MACHINE VALUE | Map to existing `tenantBilling.pricingModel.*` |
| `billableVehicleCount` / `connectedVehicleCount` | METERING INPUT | Integer frozen; label only |
| `minVehicles` / `maxVehicles` | FINANCIAL INPUT | Threshold frozen; host range label may localize |
| `unitPrice.cents` / `currency` | FINANCIAL INPUT | Frozen |
| `*.formatted` (money DTOs) | PROVIDER DISPLAY | Authoritative when present |
| `discount.label` | BACKEND/PROVIDER TEXT | Raw |
| `vehicleLabel` / `licensePlate` / VIN | RAW DOMAIN DATA | Raw |
| `billingStatus` | MACHINE VALUE | Filter/tone only; `billingStatusLabel` raw |
| `reasonLabel` | BACKEND/PROVIDER TEXT | Raw |
| `changeType` | MACHINE VALUE | Host map ADDED/REMOVED/CHANGED |
| `eventTypeLabel` | BACKEND/PROVIDER TEXT | Raw |
| `reason` (change) | BACKEND/PROVIDER TEXT | Raw |
| `prorationAmount` | FINANCIAL DERIVED | Display `formatted`; no recalculation |
| `currentTierIndex` / `isCurrent` | BUSINESS DERIVED | Backend-owned selection |

### Pricing model inventory

| Machine | Business use | Baseline label | P254 reuse |
|---------|--------------|----------------|------------|
| `VOLUME` | Whole-fleet tier pricing | Mengenpreis | `tenantBilling.pricingModel.volume` |
| `GRADUATED` | Tier-line pricing | Gestaffelter Preis | `tenantBilling.pricingModel.graduated` |

**Pricing model freeze:** machine + calculation unchanged; visible label via existing P254 keys.

### Tier selection

- Applied tier from `pricing.appliedTier` and `priceTiers[].isCurrent` (backend).
- `currentTierId` derived as `tier-${index}` from `findIndex(isCurrent)` — **unchanged**.
- `formatTierRange(min,max)` in `billing.utils.ts` builds host threshold text — **P254-frozen file; do not modify**. Add locale-aware tier-range helper in P254 adapter extension instead.

### SynqDrive price bands

Repository uses dynamic `minVehicles`/`maxVehicles` from API/pricebook — **no hardcoded 1–8 / 9–19 / 20+ in rental Tariff tab**. Master admin UI references example bands separately (out of P255 scope).

### Financial calculation freeze

Frontend **does not recompute** totals. `pricingBreakdownRows()` assembles display rows from API `formatted` values and counts. Graduated table renders `tierBreakdown` lines as-is. **Category E feasible.**

### Mutation gate

**Read-only.** Actions: reload, search/filter, pagination. **No billing mutations.**

### Permissions

Inherited `billing.read` from `BillingTab`. No new permission IDs.

---

## PART D — Financial / raw / provider freeze matrices

### Money precedence

| Field | Formatted source | May localize? | Must remain unchanged |
|-------|------------------|---------------|------------------------|
| `baseAmount` | API `formatted` | Fallback only | cents, currency |
| `discount.amount` | API `formatted` | Fallback only | label raw |
| `net/tax/gross` | API `formatted` | Fallback only | cents |
| `unitPrice` (tier/ladder) | API `formatted` or `formatMoneyCents` fallback | Fallback locale only | cents |
| `prorationAmount` | API `formatted` | Fallback only | cents |

### Provider/raw fixtures (must preserve)

| Fixture | Field |
|---------|-------|
| `SynqDrive Enterprise X7` | `planName` |
| `Provider Tier X7` | `appliedTierLabel`, `tierLabel` |
| `Mietwagen Sonderfall X7` | `vehicleLabel` |
| `KS-FS-7777` | `licensePlate` |
| `Provider Discount X7` | `discount.label` |
| `Provider Reason X7` | `reason`, `reasonLabel` |
| `123,45 € PROVIDER-X7` | `*.formatted` |

### Fixed-locale debt (candidate paths)

| Symbol | Location | Classification |
|--------|----------|----------------|
| `formatDateDe(...)` | Summary, vehicles, changes | PRESENTATION ONLY — thread `locale` via P254 adapter |
| `formatMoneyCents(...)` | Tier ladder | PRESENTATION ONLY — thread `locale` |
| `formatTierRange(...)` | Tier ladder via `billing.utils` | **Do not modify billing.utils** — extend adapter |
| `pricingModelLabel(...)` | Pricing breakdown | Replace with `resolvePricingModelDisplayLabel` (P254) |

---

## PART E — Key / reuse / split analysis

### Existing `tenantBilling.*` reuse (P254)

| Key | P255 reuse |
|-----|------------|
| `tenantBilling.pricingModel.volume` | EXACT |
| `tenantBilling.pricingModel.graduated` | EXACT |
| `tenantBilling.overview.billableVehicles` | SEMANTIC (same metric) |
| `tenantBilling.overview.pricingTier` | SEMANTIC |
| `tenantBilling.overview.rowBase` | SEMANTIC |
| `tenantBilling.overview.taxMissing` | SEMANTIC |
| `tenantBilling.overview.breakdownTitle` | SEMANTIC (Preisaufschlüsselung) |
| `invoiceLineItem.summary.{net,tax,gross}` | EXACT |
| `common.retry` / `common.loading` | EXACT |

### Estimated key budget

| Bucket | New keys (est.) |
|--------|-----------------|
| Tab shell / errors | 2 |
| Tariff summary labels | 8 |
| Pricing breakdown (non-reused) | 4 |
| Tier ladder | 5 |
| Vehicle table | 10 |
| Vehicle changes | 5 |
| Change-type machine map | 3 |
| Plan-kind display | 2 |
| **Total new** | **~24–30** |
| **Reused** | **~10–12** |

**Gates:** ≤25 ideal; 26–32 justify; >32 consider split. Estimate **within justify band**.

### Split analysis

| Option | Assessment |
|--------|------------|
| A — Tariff/ pricing only | Would leave vehicle table/changes with German debt in same tab |
| B — Billable vehicles only | Incomplete tab; shared pricing context split awkwardly |
| C — Changes/ladder separate | Same hook/API; unnecessary fragmentation |
| **D — Full Tariff & Vehicles** | **Selected** — single mounted tab, cohesive read-only surface, manageable keys |

**Split verdict:** **ONE SLICE — TARIFF & VEHICLES**

### Adapter strategy

**EXTEND EXISTING P254 ADAPTER** (`rental-tenant-billing-i18n.ts`)

Allowed additions:

- `formatTierRangeDisplay(locale, min, max)` — host threshold presentation
- `resolveVehicleChangeTypeLabel(changeType, t)`
- `resolvePlanKindLabel(kind, t)`
- `pricingBreakdownRows(pricing, t, locale)` presentation wrapper or parallel localized builder in utils with `t` param

**MUST NOT** own: tier selection, pricing formulas, metering eligibility, proration calculation, sorting, permissions.

**Do NOT modify** `billing.utils.ts` (P254 frozen) — add parallel locale-aware helpers in adapter.

### P255 enforce-clean boundary (exact)

1. `TenantBillingTariffVehiclesTab.tsx`
2. `TenantTariffSummarySection.tsx`
3. `TenantPricingBreakdownSection.tsx`
4. `TenantBillableVehiclesTable.tsx`
5. `TenantVehicleChangesSection.tsx`
6. `BillingPriceTierLadder.tsx`
7. `tenant-tariff-vehicles.utils.ts`
8. `rental-tenant-billing-i18n.ts` (extension only, P254-neutral)

**Exclude:** P254 overview/shell files, deferred invoice/PM/add-ons tabs, legacy unmounted billing.

### Same-mount contract

Mount `BillingTab` at `billingSubTab=tariff-vehicles`. DE→EN→DE must preserve: subTab, URL, plan name, pricing model machine, counts, tier IDs/thresholds, raw tier labels, vehicle IDs/plates/VIN, billing status machine, money cents/currency/formatted, change IDs/types, timestamps, row order, filters/pagination, permissions, callbacks.

### Category E feasibility

**YES** — presentation-only localization of read-only DTO display; no formula/tier/metering/mutation changes planned.

---

## PART F — P255 decision

| Item | Value |
|------|-------|
| Boundedness | **PASS** |
| Active collision | **NONE / LOW** |
| Main drift on P255 paths | **Present on main** (P254 + fleet) — **do not absorb** |
| Baseline strategy | **DIRECT FROM P254 MERGE BASELINE** (`314d9c63`) |

### Final verdict

# **A — GO — P2.2.55 TENANT BILLING TARIFF & VEHICLES SELECTED**

---

## PART G — Progress + P256 forecast

### Scanner reference vs post-P255 projection

| Metric | Current | After P255 (est.) |
|--------|---------|-------------------|
| Global | 1438 | ~1421 (−17 scanner; up to −35 incl. utils) |
| Rental | 341 | ~324–328 |
| Finance/Billing | 59 | ~42–45 |
| P255 enforce-clean scope | 17 (+blind) | **0** |

### Remaining Tenant Billing debt (post-P255, mounted)

| Surface | Est. findings |
|---------|---------------|
| Payment Method tab | ~6 |
| Add-ons tab | ~2 |
| Legacy unmounted billing | ~34 (out of campaign mounted scope) |

### Global completion (methodology unchanged)

| | % |
|--|---|
| Conservative | **~85.6%** |
| Central | **~85.8%** |
| Optimistic | **~86.0%** |
| Confidence | **Medium-high** (scanner blind-spot in utils acknowledged) |

### P256 forecast (ranked)

| Rank | Target | Est. mounted debt | Rationale |
|------|--------|-------------------|-----------|
| 1 | **Tenant Billing Invoices** | High (drawers/sections; scanner undercounts) | Largest remaining mounted billing UX surface |
| 2 | **Payment Method** | ~6 scanner | Stripe/PM copy cluster |
| 3 | **Add-ons** | ~2 scanner | Smallest deferred tab |

**Recommended P256:** **Tenant Billing Invoices** (revalidate after P255 merge).

---

## Implementation NOT started

**P2.2.55:** Tenant Billing Tariff & Vehicles  
**CAMPAIGN:** RENTAL  
**P254 STATUS:** FROZEN
