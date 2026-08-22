# P2.2.17 — Booking Vehicle Picker Localization — Implementation Audit

**Date:** 2026-08-22
**Baseline SHA:** `f709520590967c4a128f91a38f07d0672f6d4a55`
**Branch:** `cursor/p2217-booking-vehicle-picker-i18n-3c10`
**Pre-flight:** PR #1142 — GO

## Scope

| File | Role |
|------|------|
| `rental/components/new-booking/VehiclePickerStep.tsx` | Picker UI chrome, status tabs, filters |
| `rental/lib/booking-vehicle-preflight.ts` | Preflight machine logic + locale-threaded presentation |
| `rental/lib/booking-vehicle-preflight-presentation-i18n.ts` | Canonical preflight message adapter |

## Findings before/after

| Metric | Before | After |
|--------|--------|-------|
| P217 visible enforce-clean (VehiclePickerStep) | 2 | 0 |
| P217 hidden presentation literals (cluster) | ~18–22 | 0 |
| P217 enforce-clean exact scope | 2 paths in debt | 0 |

## Machine invariants (unchanged)

- `hardBlockReason`: `offline` \| `rental_blocked` \| `no_tariff`
- `isSelectable` eligibility booleans
- Filter machine values: `all`, `VEHICLE_OPERATIONAL_STATUS.*`
- Raw provider `blocking_reasons` preserved
- Vehicle ID / selection callbacks unchanged

## Dictionary accounting

| | Count |
|---|------|
| EN | 7908 |
| DE | 7908 |
| Parity | 100% |
| New keys | 9 |
| Reused keys | 8+ concepts |
| Orphans | 0 |

### New keys

- `bookings.wizard.vehiclePicker.filtersActive`
- `bookings.wizard.vehiclePicker.preflight.vehicleOffline`
- `bookings.wizard.vehiclePicker.preflight.noActiveTariff`
- `bookings.wizard.vehiclePicker.preflight.statusUnavailable`
- `bookings.wizard.vehiclePicker.preflight.maintenanceCaution`
- `bookings.wizard.vehiclePicker.preflight.currentlyRented`
- `bookings.wizard.vehiclePicker.preflight.reservedCaution`
- `bookings.wizard.vehiclePicker.preflight.healthCritical`
- `bookings.wizard.vehiclePicker.preflight.healthWarning`

## Test matrix

| Test file | Coverage |
|-----------|----------|
| `booking-vehicle-picker-localization.test.tsx` | EN/DE chrome, empty state, source guards, dynamic data |
| `booking-vehicle-preflight.test.ts` | Machine invariants, locale-independent eligibility, EN/DE presentation |
| `hardcoded-copy-guard.test.ts` | P217 inventory scope = 0 |

## Validation

| Gate | Result |
|------|--------|
| `npm run build` | PASS |
| P217 scope enforce-clean | 0 |
| Global enforce-clean | 1 (pre-existing: `DataAuthorizationTab.tsx` — P2.2.4, not P217-caused) |
| P216A/B/C freeze | 0 regressions |
| Category E | 0 |
| Shim count | 29 (unchanged) |

## Verdict

**B — IMPLEMENTATION COMPLETE WITH NON-BLOCKING OBSERVATIONS — READY FOR RE-AUDIT**

P217 scope is clean. Global `i18n:check` reports 1 pre-existing enforce-clean finding outside P217 boundary (`rental/components/settings/data-authorization/DataAuthorizationTab.tsx`).
