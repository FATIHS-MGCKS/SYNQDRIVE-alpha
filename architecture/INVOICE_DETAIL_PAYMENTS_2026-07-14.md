# Invoice Detail — Payments (V4.9.462)

## Scope

Payments section on invoice detail only. No payment cancel/correct endpoints (not in backend).

## Backend

- `presentInvoicePayment()` in `invoice-payments.presentation.ts` enriches `OrgInvoicePayment` with:
  - `createdByName` (User lookup)
  - `statusKind` / `statusLabel` (`recorded` vs `provider_confirmed` when Stripe/booking provider IDs exist)
- `InvoicesService.presentPayments()` used by `findById` / `findByOrg`
- `POST …/invoices/:id/payments` (`recordPayment`):
  - `method` required (`RecordInvoicePaymentDto`)
  - German validation errors (overpayment, duplicate reference/provider)
  - `createdByUserId` from `@CurrentUser`
- `PATCH …/invoices/:id/pay` (`markPaid`) unchanged — not exposed in UI (no invented method shortcut)

## Frontend

- `InvoicePayments` — always visible; summaries (bezahlt/offen); desktop table / mobile cards (`md:` breakpoint)
- Central i18n: `invoicePayment.*` + `invoicePayments.mapper.ts` formatters (no scattered switches)
- `RecordPaymentDialog` — `FormDialog`; amount prefilled with outstanding; method required; date/reference/note
- `InvoicePaymentDetailDialog` — read-only details
- `useInvoicePayments` + `invoicePayments.api.ts` — record command + error mapping
- Header „Zahlung erfassen“ opens same dialog via `openRecordDialog`

## Data flow

```
InvoiceDetail
  → useInvoicePayments(orgId, invoice, onUpdate, detail.actions.record_payment)
  → InvoicePayments (UI + dialogs)
  → recordInvoicePayment → api.invoices.recordPayment
  → InvoicesService.recordPayment → findById (presented payments)
```

## Tests

- `invoice-payments.presentation.spec.ts`
- `invoicePayments.mapper.test.ts`
- `InvoicePayments.test.tsx` (320/375/390/tablet/desktop SSR markers)
- `useInvoicePayments.integration.test.ts`
