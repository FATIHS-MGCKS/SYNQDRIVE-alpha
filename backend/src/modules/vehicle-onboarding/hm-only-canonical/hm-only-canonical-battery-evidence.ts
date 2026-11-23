import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { VehicleOnboardingHvBatteryReferenceDraft } from '../contracts/vehicle-technical-baseline-draft.v2';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  evaluateReferenceCapacityCreate,
  isAllowedReferenceCapacitySource,
} from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';
import { HM_BATTERY_HIGH_TRUST_SOURCES } from './hm-only-canonical-battery-document-substantiation';

/**
 * @deprecated Prefer resolveHmOnlyHvBatteryReference (async) — sync helper for unit tests only.
 * Never treats client source enum + bare documentId as manufacturer-verified proof.
 */
export function buildGovernedHmOnlyHvBatteryReference(
  dto: RegisterHmOnlyVehicleDto,
): VehicleOnboardingHvBatteryReferenceDraft | undefined {
  if (dto.hvBatteryReferenceServiceEventId?.trim()) {
    return undefined;
  }

  const capacity = dto.hvBatteryUsableCapacityKwh;
  const sourceRaw = dto.hvBatteryReferenceSource?.trim();
  const documentId = dto.hvBatteryReferenceDocumentId?.trim() || null;

  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0) {
    return undefined;
  }
  if (!documentId) {
    return undefined;
  }
  if (!sourceRaw || !isAllowedReferenceCapacitySource(sourceRaw as BatteryReferenceCapacitySource)) {
    return undefined;
  }
  const source = sourceRaw as BatteryReferenceCapacitySource;
  if ((HM_BATTERY_HIGH_TRUST_SOURCES as readonly string[]).includes(source)) {
    return undefined;
  }
  if (source !== BatteryReferenceCapacitySource.MANUAL_VERIFIED) {
    return undefined;
  }

  const createEval = evaluateReferenceCapacityCreate({
    capacityKwh: capacity,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source,
    documentId,
    serviceEventId: null,
  });
  if (!createEval.ok) {
    return undefined;
  }

  return {
    capacityKwh: capacity,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source,
    documentId,
    serviceEventId: null,
  };
}