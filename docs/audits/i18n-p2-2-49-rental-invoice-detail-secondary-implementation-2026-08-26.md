# P2.2.49 — Rental Invoice Detail Secondary Localization — Implementation Audit

**Date:** 2026-08-26  
**Verdict:** A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.49 RE-AUDIT  
**Branch:** `cursor/p2249-rental-invoice-detail-secondary-i18n-3c10`  
**Baseline:** `2dfafe8f8810bf995146e95487792a8e8a5d5897`  
**Pre-flight authority:** PR #1327 (read-only; no ancestry)

## Scope

Localized host-owned presentation in Invoice Detail Secondary accordion:

- Section chrome (more info, description, tasks, provenance/audit, timeline)
- Internal notes edit/save/cancel chrome
- Linked task status display labels (machine → TranslationKey)
- Copy internal ID button label/aria
- Timeline loading/empty/expand chrome
- Locale-aware timeline date display (presentation-only override in `InvoiceTimeline.tsx`)

## Out of scope (verified zero diff)

Invoice Detail Primary, documents panel, create/send flows, tenant billing, financial/tax/payment calculations, `invoiceTimeline.mapper.ts`.

## Runtime trace

`/rental` → `currentView=invoices` → `InvoiceDetail` → `InvoiceDetailSecondary`  
Data: `buildInvoiceDetailSecondaryPanel(invoice, provenance, editGate)`  
Callbacks: `onSaveNotes(notes)`, `onCopyInternalId()` (toast in parent — frozen)

## Key accounting

| Metric | Baseline | Final |
|--------|----------|-------|
| EN keys | 8732 | 8760 |
| DE keys | 8732 | 8760 |
| New keys | — | 28 |
| Reused keys | — | 9 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## Reused keys (quality)

| Key | Classification |
|-----|----------------|
| `common.save` / `common.cancel` / `common.edit` | EXACT |
| `tasks.filter.status.*` | EXACT |
| `notification.expandDetails` | EXACT |
| `dashboard.attention.showLess` | ACCEPTABLE |

## Adapter classification

`rental-invoice-detail-secondary-i18n.ts` — **CANONICAL**  
No business/financial/task derivation logic (E–N = 0).

## Fixed-locale handling

`invoiceTimeline.mapper.ts` still uses `de-DE` internally; `InvoiceTimeline.tsx` re-formats `item.time` via `formatRentalInvoiceDetailSecondaryTimelineDateTime` using canonical `getFormattingLocale`. Raw timestamps/order unchanged.

## Tests

- `rental-invoice-detail-secondary-localization.test.tsx` (11 tests)
- P248/P223 regressions via global `npm run i18n:check` (463 tests, 0 failures)

## Certifications

- FINANCIAL DIFF = ZERO
- INVOICE PRIMARY DIFF = ZERO
- DOCUMENTS PANEL DIFF = ZERO
- Category E = 0
- P249 = 0; P248–P216 = 0; global enforce-clean = 0
- Active collision: NONE
- Main drift: LOW (theme tokens only — not absorbed)

## P250 forecast

**P250 FORECAST CONFIRMED** — Invoice Detail Primary (Header + Relations)

## Campaign progress

- P249 cluster (16 pre-flight units): closed
- Remaining Rental inventory: ~356 findings (global scan)
- Global completion: ~92.9% (methodology aligned with #1327)
