# I18N — Tenant Billing Invoices List + Detail (P2.2.56)

**Date:** 2026-08-28
**Version:** V4.9.984
**Campaign:** RENTAL i18n Production Hardening

## Mount topology

```
Settings → Billing → billingSubTab=invoices
  → TenantBillingInvoicesTab (wrapper; no host copy)
    → TenantInvoicesSection (P256 list)
      → TenantInvoiceDetailDrawer (P256 detail)
        → useBillingInvoiceDetail / useInvoiceDocumentAction
```

**Out of scope (dead legacy):** `BillingInvoiceSection`, `BillingInvoiceDetailDrawer`

## Locale flow

`useLanguage().locale` → `rental-tenant-billing-i18n.ts` → components

- Dates: `formatRentalTenantBillingDate(locale, iso)`
- Invoice status display: `resolveTenantInvoiceStatusLabel` (raw `statusLabel` wins)
- Invoice status tone: `resolveTenantInvoiceStatusTone(machineStatus)` — machine-based (not translated label substrings)
- Payment status display: `resolveTenantPaymentStatusLabel` (raw `statusLabel` wins)
- Money: `formatOpenAmount` — provider `formatted` wins

## Machine / raw freeze

| Field | Treatment |
|-------|-----------|
| `invoiceNumber`, `invoiceNumberLabel` | Identity — display raw |
| `status` | Machine — filter + tone CSS |
| `statusLabel` | Backend DTO text — display raw when present |
| Line `description` | Provider text — display raw |
| `payment.status` | Machine — unchanged |
| `payment.statusLabel`, `providerLabel` | Provider text — display raw |
| `safeReason` | Provider failure text — display raw |
| Money `cents`/`currency` | Unchanged; `formatted` raw precedence |
| Filter `status` | `''` / DRAFT / OPEN / OVERDUE / PAID / VOID machine values |
| Search | `query.search` debounced 300ms — unchanged |
| Sort/pagination | `sort=-invoiceDate`, page/pageSize — unchanged on locale switch |
| Document URLs | `openHostedInvoice` / `openInvoicePdf` — unchanged |

## Dictionary

+30 EN+DE `tenantBilling.invoices.*` keys (8885→8915). Reuses `common.*`, `invoices.list.*`, `invoiceLineItem.*`, `bookings.period`, `bookingPayment.field.paidAt`, `tenantBilling.tariff.pagination.pageOf`.

## Guardrails

- P256 enforce-clean exact (4 paths): **0 findings**
- P255A/B enforce-clean: **0 regression**
- Dead legacy invoice components: **untouched**
- Category E: **0**

## Deferred

P2.2.57 Tenant Billing Payment Method — not started.
