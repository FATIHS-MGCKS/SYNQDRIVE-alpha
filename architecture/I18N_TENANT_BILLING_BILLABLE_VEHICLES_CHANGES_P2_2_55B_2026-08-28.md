# I18N — Tenant Billing Billable Vehicles + Vehicle Changes (P2.2.55B)

**Date:** 2026-08-28  
**Version:** V4.9.983  
**Campaign:** RENTAL i18n Production Hardening

## Mount topology

```
Settings → Billing → billingSubTab=tariff-vehicles
  → TenantBillingTariffVehiclesTab (P255A frozen)
    → TenantBillableVehiclesTable (P255B)
    → TenantVehicleChangesSection (P255B)
    → useBillingTariffVehicles (read-only hook; unchanged)
```

## Locale flow

`useLanguage().locale` → `rental-tenant-billing-i18n.ts` → components

- Dates: `formatRentalTenantBillingDate(locale, iso)`
- Change types: `resolveVehicleChangeTypeLabel(changeType, t)` → `rentalRules.workflow.publish.kind*`
- Proration: `resolveTenantBillingMoneyDisplay(formatted, locale, cents, currency)` — provider `formatted` wins

## Machine / raw freeze

| Field | Treatment |
|-------|-----------|
| `billingStatus` | Machine only — filter + tone CSS |
| `billingStatusLabel` | Backend DTO text — display raw |
| `reasonLabel`, `reason` | Backend/provider text — display raw |
| `eventTypeLabel` | Backend event label — display raw |
| `licensePlate`, `vehicleLabel`, `stationName` | Identity — display raw |
| `changeType` | Machine — display via adapter only |
| `prorationAmount.cents/currency` | Unchanged; `formatted` raw precedence |
| Filter `status` | `''` / `BILLABLE` / `EXCLUDED` machine values |
| Search | Raw field substring match (backend) |
| Sort/pagination | Hook query state unchanged on locale switch |

## Dictionary

+18 EN+DE `tenantBilling.tariff.*` keys (8867→8885). Reuses `common.*`, `fleet.licensePlate`, `bookings.vehicle`, `vehicle.station`, `tasks.filter.statusAll`, `rentalRules.workflow.publish.kind*`.

## Guardrails

- P255B enforce-clean exact (3 paths): **0 findings**
- P255A enforce-clean: **0 regression**
- Category E: **0**

## Deferred

P2.2.56 Tenant Billing Invoices — not started.
