import { BatteryMeasurementQuality } from '@prisma/client';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import {
  assessHvChargeSessionQualityFromDimoSegment,
  type HvChargeSessionQualityAssessment,
} from './hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from './hv-charge-session-quality.status';

export type { HvChargeSessionQualityAssessment } from './hv-charge-session-quality.assessor';
export {
  assessHvChargeSessionQualityFromDimoSegment,
  assessHvChargeSessionQualityFromFallbackCandidate,
  assessHvChargeSessionQualityFromInput,
  isHvChargeSessionCapacityShadowEligible,
  HV_SESSION_MIN_DURATION_SECONDS,
  HV_SESSION_MIN_SOC_DELTA_M2,
  HV_SESSION_MIN_SOC_DELTA_M3,
} from './hv-charge-session-quality.assessor';
export {
  HV_CHARGE_SESSION_QUALITY_STATUS,
  HV_CHARGE_SESSION_QUALITY_REASONS,
  type HvChargeSessionQualityStatus,
  type HvChargeSessionQualityReasonCode,
} from './hv-charge-session-quality.status';

/** Segment quality for HV charge session — delegates to central assessor. */
export function assessHvChargeSessionQuality(
  segment: NormalizedDimoRechargeSegment,
): BatteryMeasurementQuality {
  return assessHvChargeSessionQualityFromDimoSegment(segment).measurementQuality;
}

export function assessHvChargeSessionQualityDetailed(
  segment: NormalizedDimoRechargeSegment,
): HvChargeSessionQualityAssessment {
  return assessHvChargeSessionQualityFromDimoSegment(segment);
}

const QUALITY_STATUS_RANK: Record<string, number> = {
  [HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED]: 6,
  [HV_CHARGE_SESSION_QUALITY_STATUS.PARTIAL]: 5,
  [HV_CHARGE_SESSION_QUALITY_STATUS.ONGOING]: 4,
  [HV_CHARGE_SESSION_QUALITY_STATUS.PROVIDER_GAPS]: 3,
  [HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_SOC_DELTA]: 2,
  [HV_CHARGE_SESSION_QUALITY_STATUS.INSUFFICIENT_COVERAGE]: 1,
  [HV_CHARGE_SESSION_QUALITY_STATUS.ADDED_ENERGY_RESET]: 0,
  [HV_CHARGE_SESSION_QUALITY_STATUS.CONFLICTING_SOURCES]: 0,
  [HV_CHARGE_SESSION_QUALITY_STATUS.INVALID]: 0,
};

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

export function isBetterHvChargeSessionQualityStatus(
  incoming: string,
  existing: string,
): boolean {
  return (QUALITY_STATUS_RANK[incoming] ?? 0) > (QUALITY_STATUS_RANK[existing] ?? 0);
}
