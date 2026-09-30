import { BatteryMeasurementQuality } from '@prisma/client';
import { HV_M2_MODEL_VERSION } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_MODEL_VERSION } from '../hv-capacity-shadow/hv-capacity-m3.types';

/** Accepted M2 observation qualities from current hv-capacity-shadow producers. */
export const M3_3_HV_H2_M2_ELIGIBLE_QUALITIES: readonly BatteryMeasurementQuality[] = [
  BatteryMeasurementQuality.SHADOW,
];

/** Accepted M3 observation qualities from current hv-capacity-m3 producers. */
export const M3_3_HV_H2_M3_ELIGIBLE_QUALITIES: readonly BatteryMeasurementQuality[] = [
  BatteryMeasurementQuality.VALID_PROXY,
];

export const M3_3_HV_H2_M2_SUPPORTED_MODEL_VERSION = HV_M2_MODEL_VERSION;
export const M3_3_HV_H2_M3_SUPPORTED_MODEL_VERSION = HV_M3_MODEL_VERSION;

export function isM3_3HvH2M2QualityEligible(quality: BatteryMeasurementQuality): boolean {
  return M3_3_HV_H2_M2_ELIGIBLE_QUALITIES.includes(quality);
}

export function isM3_3HvH2M3QualityEligible(quality: BatteryMeasurementQuality): boolean {
  return M3_3_HV_H2_M3_ELIGIBLE_QUALITIES.includes(quality);
}
