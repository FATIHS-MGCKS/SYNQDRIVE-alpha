import { BatteryMeasurementQuality } from '@prisma/client';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';

const MIN_RELIABLE_DURATION_SECONDS = 5 * 60;
const MIN_RELIABLE_SOC_DELTA = 5;

/** Segment quality for HV charge session — no capacity calculation. */
export function assessHvChargeSessionQuality(
  segment: NormalizedDimoRechargeSegment,
): BatteryMeasurementQuality {
  const socDelta = segment.soc.delta;
  const durationSeconds = segment.durationSeconds;

  if (segment.soc.min == null && segment.soc.max == null) {
    return BatteryMeasurementQuality.NO_DATA;
  }

  if (segment.ongoing) {
    if (segment.soc.min != null || segment.soc.max != null) {
      return BatteryMeasurementQuality.SHADOW;
    }
    return BatteryMeasurementQuality.PROVIDER_DELAY;
  }

  if (
    durationSeconds >= MIN_RELIABLE_DURATION_SECONDS &&
    socDelta != null &&
    socDelta >= MIN_RELIABLE_SOC_DELTA
  ) {
    return BatteryMeasurementQuality.VALID;
  }

  if (socDelta != null && socDelta > 0) {
    return BatteryMeasurementQuality.SHADOW;
  }

  return BatteryMeasurementQuality.INSUFFICIENT_COVERAGE;
}

export function isBetterSessionQuality(
  incoming: BatteryMeasurementQuality | null,
  existing: BatteryMeasurementQuality | null,
): boolean {
  const rank: Record<BatteryMeasurementQuality, number> = {
    [BatteryMeasurementQuality.VALID]: 5,
    [BatteryMeasurementQuality.VALID_PROXY]: 4,
    [BatteryMeasurementQuality.SHADOW]: 3,
    [BatteryMeasurementQuality.PROVIDER_DELAY]: 2,
    [BatteryMeasurementQuality.INSUFFICIENT_COVERAGE]: 1,
    [BatteryMeasurementQuality.NO_DATA]: 0,
    [BatteryMeasurementQuality.CONTAMINATED_BY_WAKE]: 0,
    [BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING]: 0,
    [BatteryMeasurementQuality.CONTAMINATED_BY_LOAD]: 0,
    [BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP]: 0,
    [BatteryMeasurementQuality.INSUFFICIENT_CADENCE]: 0,
    [BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT]: 0,
    [BatteryMeasurementQuality.STALE]: 0,
    [BatteryMeasurementQuality.MISSING_CONTEXT]: 0,
    [BatteryMeasurementQuality.MISSED]: 0,
    [BatteryMeasurementQuality.UNSUPPORTED_PROFILE]: 0,
    [BatteryMeasurementQuality.PROVIDER_ERROR]: 0,
  };

  const incomingRank = incoming ? rank[incoming] ?? 0 : 0;
  const existingRank = existing ? rank[existing] ?? 0 : 0;
  return incomingRank > existingRank;
}
