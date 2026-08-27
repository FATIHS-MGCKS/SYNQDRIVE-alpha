# P2.2.55A — Tenant Billing Tariff Summary + Pricing Breakdown + Tier Ladder

**Date:** 2026-08-28  
**Baseline:** `314d9c63d176de4a1b30345d7f80ef13ba9b111d`  
**Pre-flight:** PR #1361  
**Scope reassessment:** PR #1363 (Verdict B — split to P255A)

## Summary

Corrected PR #1362 from combined P2.2.55 (57 keys) to bounded **P255A** slice via in-place scope reduction. Localizes tariff summary, pricing breakdown, and tier ladder only. **P255B** (billable vehicles + vehicle changes) deferred and restored to baseline German copy.

| Metric | Baseline | P255A final |
|--------|----------|-------------|
| EN keys | 8837 | **8867** |
| DE keys | 8837 | **8867** |
| New keys | — | **30** |
| Removed (P255B deferral) | — | 27 |
| Removed (duplicate `unitPriceRow`) | — | 1 |
| Removed (plan-kind keys → brand strings) | — | 2 (from prior 57-key combined) |
| Reused keys | — | ~10 |
| Global scanner | 1438 | **1430** |
| Rental scanner | 341 | **333** |
| Finance/Billing scanner | 59 | **51** |
| P255A enforce-clean | 13 (est.) | **0** |
| P255B deferred debt | — | **9** findings (2 files) |

## P255A scope

**Included:** `TenantBillingTariffVehiclesTab` (intro/error), `TenantTariffSummarySection`, `TenantPricingBreakdownSection`, `BillingPriceTierLadder`, bounded `rental-tenant-billing-i18n.ts` exports.

**Deferred (P255B):** `TenantBillableVehiclesTable`, `TenantVehicleChangesSection` — exact baseline restoration.

## Key budget

30 new keys ≤ 32 hard gate — **PASS**

## Certifications

- FINANCIAL CALCULATION DIFF = ZERO
- TIER SELECTION DIFF = ZERO
- PROVIDER RAW = PRESERVED
- P254 OVERVIEW/SHELL SEMANTIC DIFF = ZERO
- P255B BASELINE RESTORATION = ZERO SEMANTIC DIFF
- Category E = 0
