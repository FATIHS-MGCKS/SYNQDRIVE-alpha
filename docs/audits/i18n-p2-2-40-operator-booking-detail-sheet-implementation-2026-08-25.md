# P2.2.40 — Operator Booking Detail Sheet — Implementation Record

**Date:** 2026-08-25
**Baseline:** `00a58f54970be4853b1adab61796ac7b3bd962b3`
**Branch:** `cursor/p2240-operator-booking-detail-sheet-i18n-3c10`
**Pre-flight:** PR #1278 (not merged; no ancestry)

## Scope delivered

Localized Operator Booking Detail Sheet presentation in:

- `frontend/src/operator/components/OperatorBookingDetailSheet.tsx`
- `frontend/src/operator/lib/operator-booking-detail-i18n.ts` (new adapter)
- `frontend/src/i18n/translations/operator.bookings.detail.{en,de}.ts` (+12 new keys each)
- `frontend/src/operator/components/operator-booking-detail-localization.test.tsx` (8 tests)

## Production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorBookingDetailSheet.tsx` | Fullscreen booking detail dialog |
| `frontend/src/operator/lib/operator-booking-detail-i18n.ts` | Presentation adapter |

**Mount points:** `OperatorTodayView.tsx`, `OperatorScanView.tsx`
**Sheet:** fullscreen `role="dialog"` (no separate sheet ID; closes via `onClose`)

## Section inventory

| Section | Host-owned labels localized | Dynamic values frozen | Owned by P240 |
|---------|----------------------------|----------------------|---------------|
| Header | eyebrow, close aria | vehicle name, plate | Yes |
| Status chips | status label, kind chip | machine status | Yes (status via `bookingStatusLabel`) |
| Overview DL | customer, station, time labels | customer name, station name, timeLabel | Yes |
| Health blocker | vehicle blocked title | blocking reason strings | Yes (title only) |
| Documents | — | — | No (P238 panel mounted; unchanged) |
| Pickup verification | section title, action label | customer/booking IDs in callback | Yes |
| Manage actions | section title, edit/cancel/no-show labels | gate reasons (map-only) | Yes |
| Pickup/Return CTAs | button labels | gate reasons via handover-i18n | Yes |

## Status mapping

| Machine value | TranslationKey | Tone/icon changed |
|---------------|------------------|-------------------|
| `pending` | `bookings.planner.pending` | No |
| `confirmed` | `bookings.confirmed` | No |
| `active` | `bookings.active` | No |
| `completed` | `bookings.completed` | No |
| `cancelled` | `bookings.cancelled` | No |
| `no_show` | `bookings.planner.noShow` | No |

Direction: machine status → TranslationKey → localized label (safe).

## Frozen boundaries

| Domain | Frozen |
|--------|--------|
| bookingId | `item.bookingId` in all callbacks |
| Customer data | name, email, phone, company, customerId |
| Vehicle data | name, plate, VIN, vehicleId |
| Station data | station names/IDs |
| Timestamps | `scheduledAt`, `timeLabel`, core start/end |
| Notes | not rendered in detail sheet |
| P238 Documents | `OperatorBookingDocumentsPanel` production unchanged |
| P237 Cancel/No-Show | sheet types `booking-cancel`, `booking-no-show` unchanged |
| P236 Booking Form | sheet type `booking-edit` unchanged |
| Callbacks | `onClose`, `onPickupStart`, `onReturnStart`, `openSheet` args |

## Key reuse

| Classification | Keys |
|----------------|------|
| **NEW** | 12 `operator.bookings.detail.*` per locale |
| **EXACT REUSE** | `common.close`, `common.edit`, `bookings.customer`, `operator.bookings.form.error.detailsUnavailable`, `operator.bookings.cancelNoShow.cancel.submit`, `operator.bookings.cancelNoShow.noShow.submit`, `vehicle.bookings.startPickup`, `vehicle.bookings.startReturn` |
| **SEMANTIC REUSE** | `operator.bookings.documents.group.pickup`, `operator.bookings.documents.group.return`, P237 gate reason helpers, `bookingStatusLabel` |

## Adapter strategy

**NEW OPERATOR BOOKING DETAIL PRESENTATION ADAPTER** — `operator-booking-detail-i18n.ts` with `obds()` helper. Presentation-only; no business logic.

## Dictionary accounting

| Metric | Before | After |
|--------|-------:|------:|
| EN | 8596 | 8608 |
| DE | 8596 | 8608 |
| Parity | 100% | 100% |
| Orphans | 0 | 0 |

## Scanner accounting

| Metric | Before | After |
|--------|-------:|------:|
| P240 scoped findings | 8 | **0** |
| Global enforce-clean | 0 | 0 |

## Tests

`operator-booking-detail-localization.test.tsx` — 8 tests PASS

Coverage: enforce-clean debt, DE/EN render, same-mount locale switch, dynamic data preservation, pickup/edit callbacks, status mapping, blocking reason preservation.

## Validation

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS |
| `npm run build` | PASS |
| `npm run check:surface` | PASS |
| `git diff --check` | PASS |
| Category E | 0 |
| P236/P237/P238 | 0 |
| #1277/#1279 overlap | NO |

## Verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT P2.2.40 RE-AUDIT**

P2.2.40 implementation is ready for independent re-audit.
