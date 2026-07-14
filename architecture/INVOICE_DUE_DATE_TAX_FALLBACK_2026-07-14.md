# Invoice Due Date & Tax Fallback (V4.9.435)

## Problem

- Booking invoices hardcoded `booking.startDate + 14 days` for due date while org default is `paymentTermsDays` (7).
- Tax fallback used hardcoded 19% (`/ 1.19`) in booking fallback, final invoice, document extraction, and legacy line-item parsing.

## Due date model

### Enum `InvoiceDueDateBase`

| Value | Anchor for auto due date |
|-------|--------------------------|
| `INVOICE_DATE` | `invoiceDate` (default for outgoing auto) |
| `ISSUE_DATE` | `issuedAt` on issue; at create uses `invoiceDate` until issued |
| `BOOKING_START` | `booking.startDate` (explicit opt-in only) |
| `CUSTOM` | Explicit `dueDate` from DTO — never overwritten |

### Org settings

- `Organization.paymentTermsDays` (default 7)
- `Organization.timezone` for calendar-day math (`tariff-instant.util`)

### Persistence

- `OrgInvoice.dueDateBase` — nullable for legacy rows
- `OrgInvoice.paymentTermsDaysAtCreate` — snapshot when auto-computed

### Rules

- Explicit `dueDate` in create/update → `CUSTOM`
- Incoming without explicit due date → `null`
- `issue()` recalculates only when `dueDateBase === ISSUE_DATE`
- Legacy rows (`dueDateBase` null) are not recalculated on issue
- No implicit coupling to booking start for wizard/booking invoices

## Tax model

### Priority

1. Line item / price snapshot `taxRatePercent`
2. Org `defaultVatRate` (0 / 7 / 19)
3. `isSmallBusiness` → 0%
4. System default 19% (logged when used for gross split)

### Utilities

- `invoice-tax.util.ts` — cent-precise net/tax/gross split, allowed rates
- `invoice-line-items.util.ts` — per-line rounding, mixed rates, legacy parse
- `InvoicesService` logs `Logger.warn` on legacy gross-split fallbacks

### Removed hardcodes

- `createBookingInvoice` legacy path
- `createFinalInvoice`
- `DocumentExtractionApplyService` incoming invoice (gross-only → `computeInvoiceTotals`)
- `invoice-detail.mapper` display fallback (org tax via read service)

## Tests

- `invoice-due-date.util.spec.ts` — 0/7/14/30 days, CUSTOM, ISSUE_DATE on issue, legacy null
- `invoice-line-items.util.spec.ts` — 0/7/19%, mixed lines, rounding
- `invoices.service.baseline.spec.ts` — booking invoice uses INVOICE_DATE + org terms
