# Fleet Operational Status — Frontend Derivation Cleanup (Prompt 28)

Audit date: 2026-07-15

## Removed derivations

| Location | Removed behavior |
|----------|------------------|
| `fleetVisualState.ts` `deriveRentalStatus` | Downgrade `ACTIVE_RENTED` → `available` when `activeBookingId` missing; downgrade `RESERVED` → `available` when `reservedBookingId` missing |
| `vehicleRuntimeStateBuilder.ts` | Local `mapOperationalStatus` string switch (`'Available'` / `'Reserved'` / …) — replaced by `selectFleetRuntimeOperationalStatus` |
| `vehicle-booking-operator.utils.ts` | `fleetActive` from `activeBookingId` OR status; now canonical `selectFleetOperationalStatus` only |
| `fleet-map-vehicle-mapper` (P27) | Reserved/Active from `futureBookingCount` / raw status guessing |

## Legitimate remaining display-only mappings

| Module | Role |
|--------|------|
| `vehicle-operational-state/display.ts` | `formatVehicleOperationalStatusLabel` — DE/EN labels from canonical enums |
| `fleetVisualState.ts` | Map tone, chip tone, legend labels, telemetry/health overlays (does not change operational status) |
| `fleetVehicleDisplay.ts` | Primary badge labels/tones from `selectFleetOperationalStatus` + health/telemetry |
| `fleet-map-sync.ts` `fleetStatusToOperatorTab` | Legacy string normalizer for deprecated tab helper (uses central normalizer) |

## Open legacy spots (intentional)

| Surface | Notes |
|---------|-------|
| `master/PlatformVehiclesView.tsx` | Master admin uses separate `VehicleStatus` display strings from `VEHICLE_STATUS_MAP` — not rental operational read-model |
| `figma-rental/App.tsx` | Design prototype only |
| Flat fields on `VehicleData` | Projected from `bookingContext` for backward-compatible UI; not used as status source when `operationalState` present |
| `FleetContext` list endpoint | Fleet rental surfaces consume `useFleetMapStore` (canonical mapper); other vehicle list APIs may lack `operationalState` until backend rollout |

## Component read contract

Fleet rental surfaces must use:

- `vehicle.operationalState` / `selectFleetOperationalStatus`
- `vehicle.bookingContext` / `selectFleet*Booking` selectors
- Never `rawVehicleStatus` or legacy `status` string alone for operational truth
- Never `nextBooking` as Reserved indicator
