# P2.2.56 — Tenant Billing Invoices List + Detail Implementation

**Date:** 2026-08-28
**Baseline:** `e1fa84ec5cd5cb765acddc972607b4658d85da87` (P2.2.55B merge)
**Pre-flight:** PR #1371 (verdict A — GO)
**Branch:** `cursor/p2256-tenant-billing-invoices-i18n-3c10`

## Summary

Localized production-mounted **Tenant Billing Invoices** list and detail drawer on Settings → Billing → Invoices (`billingSubTab=invoices`). Presentation-only; invoice identity, status machines, provider raw labels, money DTOs, filter/search/pagination, document URLs, and overdue derivation frozen.

| Metric | Baseline | P256 final |
|--------|----------|------------|
| EN keys | 8885 | **8915** |
| DE keys | 8885 | **8915** |
| New keys | — | **30** |
| Reused keys | — | **18** |
| Global scanner | 1421 | **1413** (−8) |
| Rental scanner | 324 | **316** (−8) |
| Finance/Billing scanner | 42 | **33** (−9) |
| P256 enforce-clean (4 paths) | 9 visible + ~35 hidden | **0** |
| P255A/B enforce-clean | 0 | **0** |

## Mount topology

```
Settings → Billing → billingSubTab=invoices
  → TenantBillingInvoicesTab (unchanged wrapper)
    → TenantInvoicesSection (P256 list)
      → TenantInvoiceDetailDrawer (P256 detail)
        → useBillingInvoiceDetail / useInvoiceDocumentAction
```

**Dead legacy (untouched):** `BillingInvoiceSection.tsx`, `BillingInvoiceDetailDrawer.tsx`

## Scope

**Included:**

- `TenantInvoicesSection.tsx` — list chrome, locale dates, machine-based status tone
- `TenantInvoiceDetailDrawer.tsx` — detail chrome, payment history presentation
- `tenant-invoices.utils.ts` — business-neutral helpers only (`formatOpenAmount`, `hasPaymentProblem`, `mapInvoiceStatusFilter`, `summarizeFailedAttemptReason`)
- `useBillingInvoiceDetail.ts` — document error codes (`unavailable` / `openFailed`) instead of German strings
- `rental-tenant-billing-i18n.ts` — invoice/payment status label + tone adapters

**Frozen:**

- P255A tariff summary/breakdown/tier ladder
- P255B billable vehicles + vehicle changes
- P254 overview/shell
- Payment Method, Add-ons tabs
- Backend invoice calculations, Stripe/provider services, PDF generation

## Key accounting

**New (`tenantBilling.invoices.*`):** 30 EN+DE keys

- `list.*` (7): title, updating, load error, search, empty×2, doc.online
- `status.*` (2): open, uncollectible (other statuses reuse `invoices.list.status.*`)
- `paymentStatus.*` (8): pending, succeeded, failed, refunded, partiallyRefunded, cancelled, fallback
- `detail.*` (12): title, description, load error, lineQty, paymentFailed, failedAttempt fallback, managePaymentMethod, payments section×4, actions×2
- `document.unavailable` (1)

**Reused (18):** `common.retry`, `common.back`, `common.next`, `common.loading`, `tenantBilling.tariff.pagination.pageOf`, `invoices.list.filters.allStatuses`, `invoices.list.filters.showing`, `invoices.list.col.*` (5), `invoices.list.status.*` (4), `invoices.list.error.openFailed`, `invoiceLineItem.summary.*` (4), `invoiceLineItem.section.title`, `bookings.period`, `bookingPayment.field.paidAt`

## Status tone migration

`tenantInvoiceStatusTone` migrated from German `statusLabel` substring matching to **machine-status-based** `resolveTenantInvoiceStatusTone(status)`. Visual mapping preserved:

| Machine | Tone |
|---------|------|
| DRAFT, VOID | neutral |
| OPEN | warning |
| OVERDUE, UNCOLLECTIBLE | critical |
| PAID | success |

## Freeze certifications

- Invoice number / `statusLabel` / line descriptions / payment labels / failure reasons — **raw display**
- `statusLabel` / `payment.statusLabel` — **API wins when non-empty**
- Status machines (DRAFT, OPEN, OVERDUE, PAID, VOID, UNCOLLECTIBLE) — **unchanged**
- Overdue derivation (OPEN + past `dueDate`) — **unchanged**
- Filter/search (300ms debounce)/sort/pagination — **unchanged**
- Money `.formatted` precedence — **preserved**
- Document URLs / open actions — **unchanged**
- Document errors — host-owned (`unavailable`, `openFailed`) localized; dynamic backend/provider messages preserved verbatim
- Drawer selected invoice ID + open state on locale switch — **preserved**
- P255A/B semantic diff — **ZERO**
- Category E — **0**

## Tests

`rental-tenant-billing-invoices-localization.test.tsx`:

- P256 enforce-clean = 0 on 4 active paths
- Dead legacy certification
- Machine-based status tone equivalence
- Raw statusLabel + overdue derivation
- DE/EN list chrome + raw DOM
- BillingTab same-mount list (no `setQuery` on locale switch)
- Drawer same-mount detail (portal body assertions)

Updated `tenant-invoices.utils.test.ts` for business-neutral utils.

`useBillingInvoiceDetail.test.ts`: real `useInvoiceDocumentAction` regression for raw provider errors, string exceptions, host fallbacks, and null URL ownership.

## Next slice

**P2.2.57 — Tenant Billing Payment Method** (revalidate mount boundary after P256 merge)
