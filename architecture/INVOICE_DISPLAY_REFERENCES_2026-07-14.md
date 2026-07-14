# Invoice Display References (V4.9.434)

**Datum:** 2026-07-14

## Problem

Visible invoice-related strings embedded internal UUID fragments (`booking.id.slice(0,8)`), e.g. task title „Zahlungseingang prüfen: Buchungsrechnung #f82515ad“.

## Rules

| Phase | Primary reference |
|-------|-----------------|
| Draft (no sequence) | Booking number `BK-{last6}` when `bookingId` set; else neutral type label / user title |
| Issued | `invoiceNumberDisplay` (e.g. `FSM-2026-0042`) |
| Documents | `RE-2026-…` document numbers + `BK-…` booking ref in titles/filenames |

Internal IDs remain only in dedup keys (`invoice:unpaid:{invoiceId}`), logs, and FK columns.

## Implementation

- `invoice-display-reference.util.ts` — title/task/description builders
- `InvoicesService.issue()` — allocates number, refreshes `title`, creates task with invoice reference
- `InvoicesService.createBookingInvoice()` / `createFinalInvoice()` — business titles at create
- `template-helpers.bookingRef()` — now `BK-{last6}` (used in document bundle titles/filenames)
- Frontend `resolveLinkedDocumentLabel()` — no `generatedDocumentId.slice` in UI

## Invoice numbers

Assigned only in `InvoicesService.issue()` via `InvoiceNumberService.allocate()` when status moves DRAFT → ISSUED. Document PDF numbers (`RE-…`) come from `DocumentNumberingService` separately.

## Historical data

Existing tasks/notifications with UUID fragments are **not** backfilled (dedup/update risk). New creates and `issue()` use business references.

## Tests

- `invoice-display-reference.util.spec.ts`
- `invoices.service.baseline.spec.ts` (issue title + task)
- `invoice-detail-ui.baseline.test.ts` (frontend guards)
