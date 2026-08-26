# Platform i18n — Rental Invoice Detail Secondary (P2.2.49)

**Date:** 2026-08-26
**Baseline:** `2dfafe8f8810bf995146e95487792a8e8a5d5897` (P2.2.48 merge)
**Campaign:** Rental
**Scope:** Invoice Detail Secondary accordion surface only

## Boundary

| Path | Role |
|------|------|
| `rental/components/invoices/InvoiceDetailSecondary.tsx` | Secondary accordion host |
| `rental/components/invoices/InvoiceNotes.tsx` | Internal notes chrome + edit/save/cancel |
| `rental/components/invoices/InvoiceTimeline.tsx` | Embedded timeline chrome |
| `rental/components/invoices/invoiceDetailSecondary.mapper.ts` | Panel projection; task title sanitize only |
| `rental/lib/rental-invoice-detail-secondary-i18n.ts` | Presentation adapter |

**Excluded:** Invoice Detail Primary, documents panel (P223), create/send dialogs, financial/tax/payment semantics, `invoiceTimeline.mapper.ts` (fixed-locale deferred — presentation overridden in `InvoiceTimeline.tsx`).

## Locale flow

`useLanguage().locale` → `rental-invoice-detail-secondary-i18n.ts` (`rids`, task-status map, timeline date formatter).

## Keys

- **+28** EN+DE `rental.invoice.detail.secondary.*` (8732→8760)
- **Reused (9):** `common.save`, `common.cancel`, `common.edit`, `tasks.filter.status.{OPEN,IN_PROGRESS,DONE,CANCELLED}`, `notification.expandDetails`, `dashboard.attention.showLess`

## Frozen semantics

- Dynamic: `invoice.description`, `invoice.notes`, task titles, provenance values, timeline `event.label`/`detail`/`actorLine`, internal ID copy payload
- Notes mutation: `onSave(notes)` payload unchanged
- Task machine values, order, tone, icons unchanged
- Timeline event IDs, order, timestamps, grouping unchanged (display formatting locale-aware via adapter)
- Callbacks, permissions, visibility, accordion state unchanged

## Guardrails

`P249_ENFORCE_CLEAN_EXACT` — 5 paths, 0 findings.

## Tests

`rental-invoice-detail-secondary-localization.test.tsx` — EN/DE render, same-mount locale switch, notes draft/mutation, task status localization, timeline raw preservation, copy callback.

**Category E:** 0
