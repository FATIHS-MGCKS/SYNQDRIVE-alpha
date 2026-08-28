# P2.2.55B — Tenant Billing Billable Vehicles + Vehicle Changes Implementation

**Date:** 2026-08-28  
**Baseline:** `20eb441fdf98596f3a49296c014410bfdbbfe080` (P255A merge)  
**Pre-flight:** PR #1367  
**Branch:** `cursor/p2255b-billable-vehicles-changes-i18n-3c10`

## Summary

Localized production-mounted **Billable Vehicles Table** and **Vehicle Changes Section** on Settings → Billing → Tarif & Fahrzeuge (`billingSubTab=tariff-vehicles`). Presentation-only; all billability, filter, search, sort, pagination, provider raw fields, and proration semantics frozen.

| Metric | Baseline | P255B final |
|--------|----------|-------------|
| EN keys | 8867 | **8885** |
| DE keys | 8867 | **8885** |
| New keys | — | **18** |
| Reused keys | — | **10** |
| Global scanner | 1430 | **1421** (−9) |
| Rental scanner | 333 | **324** (−9) |
| Finance/Billing scanner | 51 | **42** (−9) |
| P255B enforce-clean | 9 | **0** |
| P255A enforce-clean | 0 | **0** |

## Scope

**Included:**

- `TenantBillableVehiclesTable.tsx` — host chrome, locale date formatting
- `TenantVehicleChangesSection.tsx` — host chrome, change-type display, proration display
- `tenant-tariff-vehicles.utils.ts` — removed German `changeTypeLabel`; kept `changeTypeTone`
- `rental-tenant-billing-i18n.ts` — added `resolveVehicleChangeTypeLabel` only

**Frozen (unchanged):**

- P255A tariff summary/breakdown/tier ladder
- P254 overview/shell
- Deferred billing tabs (invoices, payment method, add-ons)
- Backend billing APIs

## Key accounting

**New (`tenantBilling.tariff.*`):** 18 EN+DE keys

- `vehicles.*` (12): load error, title, search, filters×2, empty×2, columns×4, pagination summary
- `pagination.pageOf` (1 shared)
- `changes.*` (5): load error, title, subtitle, empty, proration label

**Reused:** `common.retry`, `common.back`, `common.next`, `fleet.licensePlate`, `bookings.vehicle`, `vehicle.station`, `tasks.filter.statusAll`, `rentalRules.workflow.publish.kindAdded/Removed/Changed`

## Freeze certifications

- Vehicle identity raw (plate, label, station) — **preserved**
- `billingStatus` machine (`BILLABLE`/`EXCLUDED`) — **unchanged**
- `billingStatusLabel` backend text — **raw display**
- `reasonLabel` / change `reason` — **raw display**
- `eventTypeLabel` — **raw display**
- Filter/search/sort/pagination state — **unchanged**
- `prorationAmount.formatted` precedence — **preserved**
- P255A semantic diff — **ZERO**
- Category E — **0**

## Tests

Extended `rental-tenant-billing-tariff-vehicles-localization.test.tsx`:

- P255B enforce-clean = 0
- DE/EN host chrome
- Raw provider fixtures across locale switch
- Search/filter/pagination state preservation
- Change-type adapter mapping
- Money formatted precedence
- No locale-keyed React remounts

## Next slice

**P2.2.56 — Tenant Billing Invoices** (revalidate mount boundary after P255B merge)
