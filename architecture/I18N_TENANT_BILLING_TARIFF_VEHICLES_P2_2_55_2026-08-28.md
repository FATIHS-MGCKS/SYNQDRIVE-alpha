# I18N — Tenant Billing Tariff (P2.2.55A)

**Date:** 2026-08-28  
**Campaign:** RENTAL  
**Baseline:** P2.2.54 merge `314d9c63`  
**Scope:** Tariff summary + pricing breakdown + tier ladder (P255A only)  
**Deferred:** P2.2.55B — billable vehicles + vehicle changes

## Locale flow

`useLanguage().locale` → extended `rental-tenant-billing-i18n.ts` → `formatInvoiceListAmount` / `toLocaleDateString` / `formatTierRangeDisplay` / `buildTariffPricingBreakdownRows`

## Keys

- **+30** EN+DE `tenantBilling.tariff.*` (8837→8867)
- **Reused:** `tenantBilling.overview.*`, `tenantBilling.pricingModel.*`, `invoiceLineItem.summary.*`, `common.*`
- **Plan kind:** stable brand strings (`SynqDrive Rental` / `SynqDrive Fleet`) — no translation keys

## Frozen semantics

- Plan name, billing interval label, tier labels, discounts, `*.formatted` — raw/provider
- Pricing model machine (`VOLUME`/`GRADUATED`), tier thresholds, applied tier selection, billable counts
- P255B vehicle table/changes — baseline German copy unchanged

## Guardrails

P255A enforce-clean exact (5 paths) — 0 findings  
P255B paths explicitly **not** declared clean (deferred debt remains)  
P2.2.54 overview/shell — unchanged  
Category E = 0

## Tests

`rental-tenant-billing-tariff-vehicles-localization.test.tsx` (P255A scope + P255B baseline certification)  
`tenant-tariff-vehicles.utils.test.ts`
