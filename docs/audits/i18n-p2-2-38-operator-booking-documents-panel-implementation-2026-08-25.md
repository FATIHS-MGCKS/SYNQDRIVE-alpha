# P2.2.38 — Operator Booking Documents Panel — Implementation Record

**Date:** 2026-08-25  
**Baseline:** `f8495e3fe415ebb3a7b6f4338f7cc534ee41c400`  
**Branch:** `cursor/p2238-operator-booking-documents-panel-i18n-3c10`  
**Pre-flight:** PR #1265 (not merged; no ancestry)

## Scope delivered

Localized Operator Booking Documents Panel presentation in:

- `frontend/src/operator/documents/OperatorBookingDocumentsPanel.tsx`
- `frontend/src/operator/documents/operatorBookingDocuments.utils.ts`
- `frontend/src/operator/lib/operator-booking-documents-i18n.ts` (new adapter)
- `frontend/src/i18n/translations/operator.bookings.documents.{en,de}.ts` (+26 keys each)

## Machine / semantic freeze (verified)

| Domain | Frozen |
|--------|--------|
| Document IDs | `doc.id`, React keys `documentType` / `doc.id` |
| Booking ID | `bookingId` prop, bundle `bookingId` |
| Document types | `RENTAL_CONTRACT`, `HANDOVER_PICKUP`, etc. |
| Availability enum | `available` / `missing` / `generating` / `failed` |
| Derivation | `deriveDocumentAvailability`, `currentDocumentsByType` sort |
| Filenames | Raw `fileName` never translated; meta prefers `documentNumber` when present |
| Dynamic titles | `doc.title` displayed raw |
| Bundle status | `view.bundle.status` raw |
| API errors | Displayed raw except known host fallbacks |
| Callbacks | `api.documents.open`, `window.open`, `reload`, `onAiUpload` |
| Ordering | Group/type iteration unchanged |

## Key reuse

| Bucket | Keys |
|--------|------|
| **NEW** | 26 `operator.bookings.documents.*` |
| **SEMANTIC REUSE** | 9 `email.docType.*`, `common.open` |

## Dictionary accounting

| Metric | Before | After |
|--------|-------:|------:|
| EN | 8552 | 8578 |
| DE | 8552 | 8578 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## Scanner accounting

| Metric | Before | After |
|--------|-------:|------:|
| P238 scoped findings | 8 | **0** |
| Operator total | 84 | 77 |
| Global enforce-clean | 0 | 0 |

## Tests

`operator-booking-documents-localization.test.tsx` — 8 tests PASS

Coverage: enforce-clean debt, DE/EN render, same-mount locale switch, availability derivation, type labels, filename preservation (when shown), adapter titles.

## Validation

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS (364 tests incl. guard) |
| `npm run build` | PASS |
| `npm run check:surface` | PASS |
| `git diff --check` | PASS |
| Category E | 0 |
| #1263 overlap | NO |

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.38 RE-AUDIT**
