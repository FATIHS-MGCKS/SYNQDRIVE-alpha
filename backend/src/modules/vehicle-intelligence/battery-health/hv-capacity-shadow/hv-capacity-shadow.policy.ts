import { BatteryMeasurementQuality } from '@prisma/client';
import { isBatteryV2HvCapacityShadowEnabled } from '@config/battery-health-v2.config';

/** Shadow M2 observations never feed publication, SOH, alerts, or rental readiness. */
export const HV_CAPACITY_SHADOW_BLOCKED_SIDE_EFFECTS = [
  'battery_publication',
  'hv_soh_percent',
  'rental_readiness',
  'alert',
  'task',
  'prominent_health_percent',
] as const;

export type HvCapacityShadowBlockedSideEffect =
  (typeof HV_CAPACITY_SHADOW_BLOCKED_SIDE_EFFECTS)[number];

export function isHvCapacityShadowModeActive(): boolean {
  return isBatteryV2HvCapacityShadowEnabled();
}

export function resolveHvCapacityShadowPublicationEligible(): false {
  return false;
}

export function resolveHvCapacityShadowSohEligible(): false {
  return false;
}

export function isHvCapacityShadowObservationQuality(
  quality: BatteryMeasurementQuality,
): boolean {
  return (
    quality === BatteryMeasurementQuality.SHADOW ||
    quality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE
  );
}

export function withHvCapacityShadowMetadata<T extends Record<string, unknown>>(
  metadata: T,
): T & { shadowMode: true } {
  return {
    ...metadata,
    shadowMode: true,
  };
}
