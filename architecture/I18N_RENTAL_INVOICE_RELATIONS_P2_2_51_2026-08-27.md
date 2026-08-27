# P2.2.51 — Rental Invoice Relations i18n

**Date:** 2026-08-27  
**Baseline:** `fb03d921` (P2.2.50 Header merge)  
**Campaign:** RENTAL  

## Scope

Localize host-owned presentation for the Invoice Detail **Relations** card only:

- Section title (`Zuordnung`)
- Entity relation labels (customer, booking, vehicle, vendor)
- Template row label
- Relation fallback machine → TranslationKey
- Permission-blocked chrome
- Booking period connector chrome
- Booking status via existing `bookingStatusLabel(status, locale)`

## Locale flow

```
useLanguage().locale
  → InvoiceDetail (rebuilds relations DTO with locale)
  → buildInvoiceRelationsDto(..., locale)
  → rental-invoice-relations-i18n.ts
```

`invoiceDetail.mapper.ts` is **not** modified (P250 frozen). Relations locale threading happens in `InvoiceDetail.tsx` by overriding `detail.relations` after `buildInvoiceDetailDto`.

## Keys

+13 EN+DE under `rental.invoice.relations.*` (8786→8799).

Reused: `bookings.customer`, `bookings.vehicle`, `tasks.entity.booking`, `tasks.entity.vendor`, `invoices.create.template.*`, `bookings.*` status keys.

## Hard exclusions

- `buildInvoiceProvenance` — **zero semantic diff** (P249 Secondary consumer)
- P250 Header files
- P249 Secondary files
- Payments, Documents, Line Items, Create/Send

## Guardrails

`P251_ENFORCE_CLEAN_EXACT` (4 paths) — 0 findings.

## Tests

`rental-invoice-relations-localization.test.tsx` — same-mount DE↔EN, raw entity preservation, permissions, navigation.

## Next slice

P2.2.52 — Invoice Payments localization.
