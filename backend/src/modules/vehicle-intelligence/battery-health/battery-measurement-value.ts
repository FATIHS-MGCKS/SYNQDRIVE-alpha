import { BatteryMeasurementQuality } from '@prisma/client';

const STATUS_ONLY_QUALITIES = new Set<BatteryMeasurementQuality>([
  BatteryMeasurementQuality.MISSED,
  BatteryMeasurementQuality.PROVIDER_ERROR,
  BatteryMeasurementQuality.PROVIDER_DELAY,
  BatteryMeasurementQuality.MISSING_CONTEXT,
]);

export interface BatteryMeasurementValueInput {
  numericValue?: number | null;
  textValue?: string | null;
  quality: BatteryMeasurementQuality;
}

export function hasUsableBatteryMeasurementNumericValue(
  value: number | null | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasUsableBatteryMeasurementTextValue(
  value: string | null | undefined,
): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns true when the measurement carries a publishable value or is an
 * allowed status-only row (MISSED / PROVIDER_ERROR without invented numbers).
 */
export function isBatteryMeasurementValueAllowed(
  input: BatteryMeasurementValueInput,
): boolean {
  const hasNumeric = hasUsableBatteryMeasurementNumericValue(input.numericValue);
  const hasText = hasUsableBatteryMeasurementTextValue(input.textValue);

  if (hasNumeric || hasText) return true;
  return STATUS_ONLY_QUALITIES.has(input.quality);
}
