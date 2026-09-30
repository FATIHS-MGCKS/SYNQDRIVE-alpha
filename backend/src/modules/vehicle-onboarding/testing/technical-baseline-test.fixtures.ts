import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';

export function technicalBaselineV2HvBattery(
  capacityKwh = 77,
  overrides?: Partial<{
    capacityType: string;
    source: string;
  }>,
) {
  return {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
    hvBatteryReference: {
      capacityKwh,
      capacityType: overrides?.capacityType ?? BatteryReferenceCapacityType.USABLE,
      source: overrides?.source ?? BatteryReferenceCapacitySource.MANUAL_VERIFIED,
    },
  };
}

export function technicalBaselineV2BrakePadOnly(frontPadNominalThicknessMm = 12) {
  return {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
    brakeReference: {
      frontPadNominalThicknessMm,
      sourceType: 'manufacturer_confirmed',
    },
  };
}

export function technicalBaselineV2Empty() {
  return { version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 };
}
