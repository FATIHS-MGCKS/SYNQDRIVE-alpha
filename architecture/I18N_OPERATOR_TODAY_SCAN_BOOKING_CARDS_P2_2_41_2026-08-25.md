# I18N — Operator Today + Scan Booking Cards (P2.2.41)

**Version:** V4.9.968  
**Date:** 2026-08-25  
**Baseline:** `9280b2cb7e995add90b6dcecb279470242b99a74`

## Overview

Localized host-owned presentation for Operator Today handover booking cards and Scan search booking result cards via a shared presentation adapter.

## Locale flow

```
useLanguage().locale
  → operator-booking-card-i18n.ts (obc helpers)
  → OperatorBookingCard / OperatorScanBookingCard
```

Reuses `bookingStatusLabel(status, locale)` for status chips. Today card gate tooltips continue via `resolveHandoverGateReason(locale, gate)` (unchanged).

## Production boundary

```text
P241_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingCard.tsx',
  'operator/components/OperatorScanBookingCard.tsx',
  'operator/lib/operator-booking-card-i18n.ts',
]
```

## Mount points

| Component | Mount | Audience |
|-----------|-------|----------|
| `OperatorBookingCard` | `OperatorTodayView` handover sections | Operator — today tab |
| `OperatorScanBookingCard` | `OperatorScanView` booking results | Operator — scan tab |

## Machine / domain freeze

| Value | Localize label? | Frozen |
|-------|-----------------|--------|
| `bookingId` | NO | full ID in callbacks; scan title shows truncated slice as data |
| `status` enum | label only | machine value |
| `kind` PICKUP/RETURN | label only | machine value |
| Gate booleans | tooltip via handover-i18n | predicates |
| customer/vehicle/station | NO | raw strings |
| handover callbacks | NO | identity + args |
| detail sheet open | NO | existing callbacks |

## Keys

- **New:** `operator.bookings.card.scanTitle`, `operator.bookings.card.done` (+2 EN+DE)
- **Reused:** `vehicle.bookings.startPickup`, `vehicle.bookings.startReturn`, `common.details`, `status.overdue`, `bookings.vehicle`, `operator.bookings.documents.group.pickup`, `operator.bookings.documents.group.return`, `bookings.*` status keys via `bookingStatusLabel`

## Exclusions

P216–P240 frozen surfaces, Quick View, fleet/vehicle status libs (`operatorStatus.ts`), dashboard #1279, DIMO #1281, fleet health #1277.

## Tests

`frontend/src/operator/components/operator-booking-card-localization.test.tsx`

## Semantics

Presentation-only. Category E = 0.
