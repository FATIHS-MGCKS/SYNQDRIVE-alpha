import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';

/**
 * Calibrated from FULL prod dry-run (18 refuel detections, Aug 2026).
 * Positive control: CANONICAL_REFUEL_CASE — 8 min, +16 L, ~6 km apparent odometer spread.
 * False positives: 122–205 km odometer delta during alleged refuel windows.
 */
export const REFUEL_HIGH_ODOMETER_MOVEMENT_KM = 50;
export const REFUEL_LARGE_REFUEL_LITERS = 10;
export const REFUEL_ELEVATED_ODOMETER_MOVEMENT_KM = 20;
export const REFUEL_ELEVATED_MOVEMENT_SPEED_KMH = 40;

export function refuelOdometerDeltaKm(segment: DimoEnergyEventSegment): number | null {
  const start = segment.odometerStartKm;
  const end = segment.odometerEndKm;
  if (start == null || end == null) return null;
  return Math.abs(end - start);
}

export function refuelImpliedMovementKmh(segment: DimoEnergyEventSegment): number | null {
  const deltaKm = refuelOdometerDeltaKm(segment);
  if (deltaKm == null) return null;
  const durationHours = segment.durationSeconds / 3600;
  if (durationHours <= 0) return null;
  return deltaKm / durationHours;
}

export function assessRefuelMovementPlausibility(
  segment: DimoEnergyEventSegment,
): string[] {
  const flags: string[] = [];
  const liters = segment.fuelDeltaLiters ?? 0;
  const odometerDeltaKm = refuelOdometerDeltaKm(segment);
  const impliedSpeedKmh = refuelImpliedMovementKmh(segment);

  if (odometerDeltaKm != null && liters >= REFUEL_LARGE_REFUEL_LITERS) {
    if (odometerDeltaKm >= REFUEL_HIGH_ODOMETER_MOVEMENT_KM) {
      flags.push('refuel_high_odometer_movement');
    } else if (
      odometerDeltaKm >= REFUEL_ELEVATED_ODOMETER_MOVEMENT_KM &&
      impliedSpeedKmh != null &&
      impliedSpeedKmh >= REFUEL_ELEVATED_MOVEMENT_SPEED_KMH
    ) {
      flags.push('refuel_elevated_movement_during_refuel');
    }
  }

  if (
    odometerDeltaKm != null &&
    odometerDeltaKm > 5 &&
    liters < REFUEL_LARGE_REFUEL_LITERS
  ) {
    flags.push('refuel_odometer_movement_during_event');
  }

  return flags;
}
