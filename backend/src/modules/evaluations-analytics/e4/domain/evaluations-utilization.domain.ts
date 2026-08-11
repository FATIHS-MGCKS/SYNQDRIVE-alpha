/**
 * E4 time-weighted utilization domain (pure, deterministic, DST-safe).
 *
 * Utilization is interval-based, never a snapshot count. Capacity is the real
 * elapsed milliseconds of the (clipped) period, so 23h/25h DST days are handled
 * by construction. Rented time is unioned before summing (overlap-safe) and is
 * measured only within net capacity, so the fleet ratio can never exceed 100%:
 *   netCapacity = eligibleCapacity − downtime
 *   rentedEffective = rented − downtime   (clipped to eligibility & period)
 *   utilization = Σ rentedEffective / Σ netCapacity   ∈ [0, 1]
 *
 * Telemetry-offline is NOT downtime and never enters capacity/downtime math
 * (TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT = 0). Maintenance/blocked come from
 * canonical operational state only; "available" ≠ "ready-to-rent".
 */
import {
  clipInterval,
  clipIntervals,
  countOverlappingPairs,
  mergeIntervals,
  subtractDurationMs,
  unionDurationMs,
  type EvaluationsInterval,
} from './evaluations-interval';

export interface E4VehicleUtilizationInput {
  /** When the vehicle is eligible for capacity. Defaults to the whole period. */
  readonly eligibility?: EvaluationsInterval | null;
  /** Realized rental/booking intervals (already restricted to realized states). */
  readonly rented: readonly EvaluationsInterval[];
  /** Maintenance downtime intervals (canonical operational state only). */
  readonly maintenance: readonly EvaluationsInterval[];
  /** Blocked/out-of-service downtime intervals (canonical operational state only). */
  readonly blocked: readonly EvaluationsInterval[];
}

export interface E4UtilizationResult {
  readonly eligibleVehicles: number;
  readonly capacityMs: number;
  readonly rentedMs: number;
  readonly maintenanceMs: number;
  readonly blockedMs: number;
  readonly netCapacityMs: number;
  /** Fleet ratio in [0,1]; null when there is no net capacity to divide by. */
  readonly utilizationRatio: number | null;
  readonly overlappingBookingPairs: number;
}

export function computeUtilization(
  vehicles: readonly E4VehicleUtilizationInput[],
  periodStartMs: number,
  periodEndExclusiveMs: number,
): E4UtilizationResult {
  let capacityMs = 0;
  let rentedMs = 0;
  let maintenanceMs = 0;
  let blockedMs = 0;
  let netCapacityMs = 0;
  let overlappingBookingPairs = 0;
  let eligibleVehicles = 0;

  const wholePeriod: EvaluationsInterval = {
    startMs: periodStartMs,
    endExclusiveMs: periodEndExclusiveMs,
  };

  for (const vehicle of vehicles) {
    const eligibility =
      clipInterval(vehicle.eligibility ?? wholePeriod, periodStartMs, periodEndExclusiveMs);
    if (!eligibility) continue; // vehicle not eligible within the period
    eligibleVehicles += 1;

    const eligibilityMs = eligibility.endExclusiveMs - eligibility.startMs;

    const rentedClipped = clipIntervals(
      vehicle.rented,
      eligibility.startMs,
      eligibility.endExclusiveMs,
    );
    const maintenanceClipped = clipIntervals(
      vehicle.maintenance,
      eligibility.startMs,
      eligibility.endExclusiveMs,
    );
    const blockedClipped = clipIntervals(
      vehicle.blocked,
      eligibility.startMs,
      eligibility.endExclusiveMs,
    );

    overlappingBookingPairs += countOverlappingPairs(rentedClipped);

    // Downtime is the union of maintenance and blocked (overlap-safe).
    const downtime = mergeIntervals([...maintenanceClipped, ...blockedClipped]);
    const vehicleMaintenanceMs = unionDurationMs(maintenanceClipped);
    const vehicleBlockedMs = subtractDurationMs(blockedClipped, maintenanceClipped);
    const vehicleDowntimeMs = unionDurationMs(downtime);

    // Rented time never counts during downtime, so it stays within net capacity.
    const vehicleRentedEffectiveMs = subtractDurationMs(rentedClipped, downtime);
    const vehicleNetCapacityMs = Math.max(0, eligibilityMs - vehicleDowntimeMs);

    capacityMs += eligibilityMs;
    maintenanceMs += vehicleMaintenanceMs;
    blockedMs += vehicleBlockedMs;
    netCapacityMs += vehicleNetCapacityMs;
    rentedMs += Math.min(vehicleRentedEffectiveMs, vehicleNetCapacityMs);
  }

  const utilizationRatio = netCapacityMs > 0 ? rentedMs / netCapacityMs : null;
  return {
    eligibleVehicles,
    capacityMs,
    rentedMs,
    maintenanceMs,
    blockedMs,
    netCapacityMs,
    utilizationRatio,
    overlappingBookingPairs,
  };
}
