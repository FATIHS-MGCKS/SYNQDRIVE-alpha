# I18N — Booking Vehicle Picker (P2.2.17)

## Locale flow

```
useLanguage().{t, locale}
  → VehiclePickerStep (filter chrome, status tabs, card labels)
    → resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading, { locale })
      → booking-vehicle-preflight-presentation-i18n.ts (canonical blocking/caution copy)
      → formatVehicleOperationalStatusLabel(status, locale)
```

## Machine vs presentation separation

| Machine (frozen) | Presentation (localized) |
|------------------|--------------------------|
| `hardBlockReason`: `offline` \| `rental_blocked` \| `no_tariff` | `blockingReason` via presentation adapter |
| `isSelectable`, `fleetStatus`, filter values (`all`, status enums) | Status tab labels, filter chrome, empty states |
| Raw `health.blocking_reasons` provider strings | Passed through unchanged |
| Vehicle ID, license, station name, fuel type | Never translated |

## Enforce-clean boundary

`P217_ENFORCE_CLEAN_EXACT` — 2 production paths:

- `rental/components/new-booking/VehiclePickerStep.tsx`
- `rental/lib/booking-vehicle-preflight.ts`

Optional adapter (not in enforce-clean scope): `rental/lib/booking-vehicle-preflight-presentation-i18n.ts`

## Key reuse

| Concept | Key |
|---------|-----|
| All stations | `bookings.planner.allStations` |
| Reset filters | `tasks.filter.resetFilters` |
| More filters | `fleetCondition.moreFilters` |
| No tariff (price fallback) | `bookings.wizard.noTariff` |
| Status tabs | `fleet.shell.tab.all`, `vehicle.status.*` |
| Not rentable fallback | `health.rentalBlocked` |
| Rental unverified | `fleetCondition.rentalClearanceNotVerified` |

New keys under `bookings.wizard.vehiclePicker.*` (9 EN+DE): filters active badge + preflight canonical messages.

## Guardrails

- `i18n-hardcoded-scan.mjs` — P217 phase tagging
- `hardcoded-copy-guard.test.ts` — P217 inventory scope + blind-spot guards
- `booking-vehicle-picker-localization.test.tsx` — EN/DE chrome, preflight presentation, dynamic data preservation
- `booking-vehicle-preflight.test.ts` — machine invariants locale-independent

## Semantics freeze

Presentation-only migration. Vehicle selection, eligibility, filtering, callbacks, and API payloads unchanged. Category E = 0.
