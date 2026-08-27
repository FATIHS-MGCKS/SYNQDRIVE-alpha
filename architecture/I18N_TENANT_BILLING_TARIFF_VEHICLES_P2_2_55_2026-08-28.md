# I18N — Tenant Billing Tariff & Vehicles (P2.2.55)

**Date:** 2026-08-28  
**Campaign:** RENTAL  
**Baseline:** P2.2.54 merge `314d9c63`  
**Scope:** Read-only Tariff & Vehicles mounted tab only

## Locale flow

`useLanguage().locale` → extended `rental-tenant-billing-i18n.ts` → `formatInvoiceListAmount` / `toLocaleDateString` / `formatTierRangeDisplay`

## Keys

- **+52** EN+DE `tenantBilling.tariff.*` (8837→8889)
- **Reused:** `tenantBilling.overview.*`, `tenantBilling.pricingModel.*`, `invoiceLineItem.summary.*`, `common.*`, `fleet.licensePlate`, `bookings.vehicle`

## Frozen semantics

- Plan name, billing interval label, tier labels, vehicle identity, billing status labels, reasons, discounts, `*.formatted` — raw/provider
- Pricing model machine (`VOLUME`/`GRADUATED`), tier thresholds, applied tier selection, billable/connected counts
- Filter/pagination state, row order, read-only mutations (none)

## Guardrails

P2.2.55 enforce-clean exact (8 paths) — 0 findings  
P2.2.54 overview/shell — unchanged  
Category E = 0

## Tests

`rental-tenant-billing-tariff-vehicles-localization.test.tsx`  
`tenant-tariff-vehicles.utils.test.ts`
