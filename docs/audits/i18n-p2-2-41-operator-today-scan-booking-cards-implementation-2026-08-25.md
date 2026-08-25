# P2.2.41 — Operator Today + Scan Booking Cards Localization

**Date:** 2026-08-25  
**Baseline:** `9280b2cb7e995add90b6dcecb279470242b99a74` (merged P2.2.40)  
**Pre-flight:** PR #1284

## Scope

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorBookingCard.tsx` | Today handover booking card |
| `frontend/src/operator/components/OperatorScanBookingCard.tsx` | Scan search booking result card |
| `frontend/src/operator/lib/operator-booking-card-i18n.ts` | Presentation adapter |

## Shared-slice justification

Both cards present booking identity in Operator handover/search flows with the same status machine mappings and frozen dynamic data rules. Combined scope: 3 production files, 2 new keys, extensive key reuse.

## Key reuse

| Concept | Strategy |
|---------|----------|
| Pickup/Return CTA (Today) | EXACT REUSE `vehicle.bookings.startPickup` / `startReturn` |
| Details | EXACT REUSE `common.details` |
| Overdue | EXACT REUSE `status.overdue` |
| Status labels | EXACT REUSE `bookingStatusLabel(status, locale)` |
| Due kind badges | SEMANTIC REUSE `operator.bookings.documents.group.pickup` / `return` |
| Scan pickup/return actions | SEMANTIC REUSE documents group keys |
| Open vehicle | EXACT REUSE `bookings.vehicle` |
| Scan title prefix | NEW `operator.bookings.card.scanTitle` |
| Done chip | NEW `operator.bookings.card.done` |

**New keys:** 2 EN+DE (`8608→8610`)

## Frozen semantics

- Booking IDs, customer/vehicle/station data — raw, untranslated
- Status machine values, gate predicates, callbacks unchanged
- P240 detail sheet integration — trigger only, no P240 file changes
- Scan search query/ranking — untouched

## Tests

`operator-booking-card-localization.test.tsx` — EN/DE both cards, same-mount switch, status mapping, dynamic data, callbacks.

## Category E

Presentation-only string substitution and locale threading. **Category E = 0**
