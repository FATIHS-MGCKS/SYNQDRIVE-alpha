import type { DriverAttributionType } from '@prisma/client';
import type { DriverAttributionPriorityInput } from './driver-attribution.types';

/** Higher rank wins when selecting canonical attribution for a trip. */
export const DRIVER_ATTRIBUTION_TYPE_PRIORITY: Record<DriverAttributionType, number> = {
  CONFIRMED_DRIVER: 700,
  ASSIGNED_DRIVER: 600,
  BOOKING_CUSTOMER_ONLY: 500,
  STAFF_MOVEMENT: 450,
  TIME_WINDOW_MATCH: 400,
  PRIVATE: 300,
  VEHICLE_ONLY: 200,
  UNKNOWN: 100,
};

const CONFIDENCE_PRIORITY = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

const MANUAL_RESOLUTION_BONUS = 1000;

export function driverAttributionPriorityScore(input: DriverAttributionPriorityInput): number {
  const manualBonus = input.resolvedAt != null ? MANUAL_RESOLUTION_BONUS : 0;
  return manualBonus + DRIVER_ATTRIBUTION_TYPE_PRIORITY[input.attributionType] + CONFIDENCE_PRIORITY[input.confidence];
}

/** Positive when `a` outranks `b`. */
export function compareDriverAttributionPriority(
  a: DriverAttributionPriorityInput,
  b: DriverAttributionPriorityInput,
): number {
  return driverAttributionPriorityScore(a) - driverAttributionPriorityScore(b);
}

export function isDriverAttributionActiveAt(
  row: { validFrom: Date; validUntil: Date | null },
  at: Date,
): boolean {
  return row.validFrom <= at && (row.validUntil == null || row.validUntil >= at);
}

export function pickCanonicalDriverAttribution<
  T extends DriverAttributionPriorityInput & { validFrom: Date; validUntil: Date | null },
>(rows: T[], at: Date = new Date()): T | null {
  const active = rows.filter((row) => isDriverAttributionActiveAt(row, at));
  if (active.length === 0) return null;
  return [...active].sort((a, b) => compareDriverAttributionPriority(b, a))[0] ?? null;
}
