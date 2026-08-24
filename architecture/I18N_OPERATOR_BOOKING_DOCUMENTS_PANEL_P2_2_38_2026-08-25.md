# I18N — Operator Booking Documents Panel (P2.2.38)

**Date:** 2026-08-25  
**Baseline:** `f8495e3fe415ebb3a7b6f4338f7cc534ee41c400`  
**Campaign:** OPERATOR

## Scope

Presentation-only localization for the Operator booking documents panel embedded in:

- `OperatorBookingDetailSheet`
- `OperatorHandoverStepDocuments`

## Production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/documents/OperatorBookingDocumentsPanel.tsx` | UI |
| `frontend/src/operator/documents/operatorBookingDocuments.utils.ts` | Slot builder + availability derivation |
| `frontend/src/operator/lib/operator-booking-documents-i18n.ts` | Presentation adapter |

`P238_ENFORCE_CLEAN_EXACT` = above 3 paths.

## Locale flow

`useLanguage().locale` → `operator-booking-documents-i18n.ts` (`obd`, label helpers) → canonical keys in `operator.bookings.documents.*` plus semantic reuse of `email.docType.*` and `common.open`.

## Machine freeze

- `documentType` string codes (e.g. `RENTAL_CONTRACT`, `HANDOVER_PICKUP`)
- `OperatorDocumentAvailability` enum (`available` | `missing` | `generating` | `failed`)
- `deriveDocumentAvailability` predicates and `currentDocumentsByType` ordering
- Document IDs, booking IDs, filenames, bundle.status, API error bodies
- `api.documents.open(orgId, doc.id)` and customer preview `window.open` callbacks

## Dynamic data (never translated)

- `doc.fileName`, `doc.documentNumber`, `doc.title` (when used as dynamic title)
- `view.bundle.status`, `view.bundle.lastError`
- Customer document `status` meta field
- API-thrown error messages (displayed raw unless matching known host fallback)

## Keys

- **New:** 26 EN+DE keys under `operator.bookings.documents.*` (8552 → 8578)
- **Reused:** `email.docType.*` (9 types), `common.open`

## Tests

`frontend/src/operator/documents/operator-booking-documents-localization.test.tsx`

## Semantics

Category E = 0. No overlap with Vehicle Operational State work (#1263).
