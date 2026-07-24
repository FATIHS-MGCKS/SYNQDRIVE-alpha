# Evaluations Utilization Model (Prompt 22/54)

Canonical fleet utilization and operational performance for Auswertungen (`GET …/evaluations/analytics/summary` → `utilizationModel` section).

**Calculation version:** `utilization-model-v1`

## Architecture alignment

This model **does not invent parallel runtime definitions**. It reuses:

| Concept | Source |
|---------|--------|
| Operational snapshot (point-in-time) | `VehiclesService.deriveFleetStatusContext` + `buildBookingContextMap` |
| Booking occupancy intervals | `Booking.startDate/endDate` + status semantics aligned with `vehicle-availability-intelligence.utils` |
| Maintenance / blocked intervals | `ServiceCase.downtimeStart/End` with `blocksRental=true`; fallback to `Vehicle.status` snapshot (PARTIAL) |
| Telemetry offline | `VehicleLatestState.online` / `lastSeenAt` — **informational only**, not downtime |
| Capacity bottlenecks | Station shortage pattern (available vehicles ≤ threshold) |

## Time window semantics

| Term | Numerator | Denominator |
|------|-----------|-------------|
| **Fleet capacity** | — | `period.to - period.from` per scoped vehicle |
| **Rented time** | Merged `ACTIVE` + `COMPLETED` booking intervals ∩ period | — |
| **Available capacity** | `capacity - maintenance - blocked - rented` | Net capacity |
| **Maintenance / blocked** | Downtime intervals or full-period snapshot fallback | Fleet capacity |
| **Time-weighted utilization** | `SUM(rentedMs)` | `SUM(capacityMs - maintenanceMs - blockedMs)` |
| **Operational snapshot %** | `activeRented` at period end | `activeRented + available + reserved` (derived) |

**Rules enforced:**
- Maintenance and blocked time are **excluded** from available capacity (not counted as rentable).
- Telemetry offline is tracked for coverage; **not** interpreted as technical downtime.
- Booking status (forecast vs realized) is separated: `PENDING/CONFIRMED` vs `ACTIVE/COMPLETED`.
- Overlapping blocking bookings on the same vehicle are flagged as **data errors** (PARTIAL).

## Metrics

| Key | Description |
|-----|-------------|
| `UTILIZATION_PER_VEHICLE` | Fleet time-weighted utilization |
| `UTILIZATION_BY_VEHICLE_CLASS` | Breakdown by `Vehicle.rentalCategoryId` |
| `UTILIZATION_BY_STATION` | Breakdown by `Vehicle.homeStationId` |
| `RENTED_TIME` | Sum of realized rental intervals |
| `AVAILABLE_TIME` | Net capacity minus rented |
| `MAINTENANCE_TIME` | ServiceCase downtime + IN_SERVICE fallback |
| `BLOCKED_TIME` | OUT_OF_SERVICE downtime windows |
| `UNPLANNED_DOWNTIME` | REPAIR/DIAGNOSTIC ServiceCase downtime |
| `TURNAROUND_TIME` | Gaps between consecutive realized bookings |
| `STANDSTILL_TIME` | Idle time within available capacity |
| `BOOKED_NOT_REALIZED_TIME` | PENDING/CONFIRMED not yet realized |
| `AVAILABLE_NOT_RENTABLE` | AVAILABLE + cleaning≠CLEAN (rental_blocked: gap) |
| `CAPACITY_BOTTLENECKS` | Stations with low spare capacity |
| `OPERATIONAL_SNAPSHOT_UTILIZATION` | Point-in-time derived utilization |

Each metric includes: `formula`, `dataSources`, `coverage`, `period`, `status`, `calculationVersion`.

## Drill-downs

`utilizationModel.drillDowns[]` provides entity lists:

| Drill-down key | Entity level |
|----------------|--------------|
| `UTILIZATION_PER_VEHICLE` | Vehicle |
| `MAINTENANCE_TIME` | Vehicle |
| `BLOCKED_TIME` | Vehicle |
| `AVAILABLE_NOT_RENTABLE` | Vehicle |
| `CAPACITY_BOTTLENECKS` | Station |
| `OVERLAPPING_BOOKINGS` | Booking (data error) |
| `TELEMETRY_OFFLINE` | Vehicle (informational) |

## Known data gaps

| Gap | Reason |
|-----|--------|
| `RENTAL_HEALTH` | Per-vehicle `rental_blocked` not batch-loaded in v1 (cleaningStatus used for not-rentable) |
| `MAINTENANCE_INTERVALS` | Vehicles IN_SERVICE without ServiceCase downtime → full-period snapshot fallback |
| `BLOCKED_INTERVALS` | OUT_OF_SERVICE without downtime window → snapshot fallback |
| `HISTORICAL_STATUS` | No persisted status transition timeline |
| `TELEMETRY` | Offline ≠ downtime by design |
| `STATION_TRANSFER` | Utilization grouped by home station; current station moves not time-weighted |

## Module map

| File | Role |
|------|------|
| `evaluations-utilization-intervals.ts` | Pure interval math |
| `evaluations-utilization-model.contract.ts` | Types + snapshot |
| `evaluations-utilization-model.ts` | `buildUtilizationModelSummary` |
| `evaluations-utilization-snapshot.service.ts` | Prisma + `deriveFleetStatusContext` loader |
| `vehicles.service.ts` | `deriveOperationalTokensForVehicles` |

## Tests

```bash
cd backend && npm run test:insights:analytics
```

Scenarios covered in `evaluations-utilization-model.spec.ts`:
- Fully rented vehicle
- Partially rented vehicle
- Maintenance reduces capacity
- Blocked time excluded
- Overlapping bookings (data error)
- Booked-not-realized forecast
- Station breakdown
- Telemetry offline drill-down

## Related

- Prompt 17: Analytics summary
- Prompt 21: Cost model (underutilization opportunity excluded from costs)
- `deriveFleetStatusContext` (V4.6.84+)
