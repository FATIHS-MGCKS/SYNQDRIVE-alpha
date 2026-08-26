# Vehicle Operational State — Dashboard / Fleet Readiness Cutover (P1.5)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.5 — Dashboard Fleet Readiness KPI cutover |
| **Prerequisite** | P1.1 contract, P1.2 UI projection, P1.3 Fleet, P1.4 Vehicle Detail |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` §T |

## Purpose

Cut Dashboard vehicle-readiness KPI semantics to canonical P0.2 `operationalAvailability` and P0.1 `connectivityRuntime` via P1.2 projection. Eliminate client timestamp / `onlineStatus` readiness state machine on Dashboard consumers.

## Canonical path

```
VehicleData (fleet-map store)
  → readDashboardOperationalAvailability()
  → buildFleetVehicleUiProjection() (attention/connectivity display)
  → deriveIsReadyForRenting() / buildVehicleRuntimeStates()
  → buildDashboardRuntimeModel() slices / KPI counts
```

## Module location

```
frontend/src/rental/components/dashboard/runtime/
  dashboard-operational-readiness.ts       # P1.5 canonical selectors + reason builders
  dashboard-canonical-test-fixtures.ts     # Shared test fixtures
  dashboard-operational-p1-5-cutover.test.ts
  rentalReadiness.ts                       # Ready = business AVAILABLE + operationalAvailability AVAILABLE
  vehicleRuntimeStateBuilder.ts            # Telemetry from connectivityRuntime only
  dashboardSliceBuilder.ts                 # Blocked/maintenance membership rules
```

## KPI semantic domains

| KPI | Domain | Rule |
|-----|--------|------|
| **Ready to Rent** | Business workflow + P0.2 availability | `businessState === AVAILABLE` AND `operationalAvailability === AVAILABLE` (not telemetry live) |
| **Active Rented** | Business workflow | `ACTIVE_RENTED` regardless of connectivity |
| **Due Soon / Overdue** | Booking/return workflow | Unchanged — pickup/return tile timing |
| **Blocked / Maintenance** | Business block + operational UNAVAILABLE | Maintenance, unavailable workflow, explicit hard blocks; excludes auth/device/NEEDS_VERIFICATION |
| **Critical Alerts** | Canonical attention / evidence | `attentionState` CRITICAL/ACTION_REQUIRED, DEVICE_UNPLUGGED, INTEGRATION_ERROR, OFFLINE; not WATCH/standby alone |

## Ready-to-Rent invariant

```
AVAILABLE business + operationalAvailability AVAILABLE + STANDBY telemetry => Ready YES
AVAILABLE business + NEEDS_VERIFICATION => Ready NO
ACTIVE_RENTED + OFFLINE => Active Rented YES (attention may surface separately)
```

## Legacy paths bypassed (Dashboard P1.5 only)

- `resolveTelemetryFreshness()` — not used for dashboard telemetry state
- `isVehicleOffline()` — not used
- `onlineStatus` / `lastSignal` / 24h–48h thresholds — not used for readiness or blocking
- `addTelemetryReason()` timestamp offline blocking — removed from runtime builder

`vehicleRuntimeStateBuilder` and `rentalReadiness` remain as **thin adapters** over canonical fields; they are not independent state machines.

## BusinessPulse

Unchanged — finance/booking operations only; no vehicle connectivity cutover in P1.5.

## Remaining P1.6+ consumers

- Booking picker `isVehicleOffline()` gate
- Notifications offline generation
- Master Admin redesign
- Global legacy helper deletion (`controlSignalsBuilder`, `derivePredictiveOperationsInsights` timestamp paths)

## Tests

| Suite | Result |
|-------|--------|
| P1.5 focused | 28/28 |
| Dashboard runtime bundle | 193/193 |
| P1.4 regression | 33/33 |
| P1.3 regression | 45/45 |

## Expected visible count changes

- Vehicles with stale timestamps but `operationalAvailability AVAILABLE` may move **into** Ready to Rent
- Vehicles with fresh telemetry but `NEEDS_VERIFICATION` / `UNKNOWN` / `UNAVAILABLE` move **out** of Ready to Rent
- Hard-offline timestamp alone no longer inflates Blocked & Maintenance
