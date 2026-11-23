import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { VehicleOnboardingHvBatteryReferenceDraft } from '../contracts/vehicle-technical-baseline-draft.v2';
import {
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  evaluateReferenceCapacityCreate,
  evaluateReferenceCapacityVerify,
  isAllowedReferenceCapacitySource,
} from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';
import type { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';

/**
 * HM canonical registration never accepts a client source enum as proof.
 * Governed references require capacity + allowed source + documentId (or serviceEventId)
 * passing reference-capacity policy verification.
 */
export function buildGovernedHmOnlyHvBatteryReference(
  dto: RegisterHmOnlyVehicleDto,
): VehicleOnboardingHvBatteryReferenceDraft | undefined {
  const capacity = dto.hvBatteryUsableCapacityKwh;
  const sourceRaw = dto.hvBatteryReferenceSource?.trim();
  const documentId = dto.hvBatteryReferenceDocumentId?.trim() || null;
  const serviceEventId = dto.hvBatteryReferenceServiceEventId?.trim() || null;

  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0) {
    return undefined;
  }
  if (!documentId && !serviceEventId) {
    return undefined;
  }
  if (!sourceRaw || !isAllowedReferenceCapacitySource(sourceRaw as BatteryReferenceCapacitySource)) {
    return undefined;
  }
  const source = sourceRaw as BatteryReferenceCapacitySource;

  const createEval = evaluateReferenceCapacityCreate({
    capacityKwh: capacity,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source,
    documentId,
    serviceEventId,
  });
  if (!createEval.ok) {
    return undefined;
  }

  const verifyEval = evaluateReferenceCapacityVerify({
    isActive: true,
    verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
    source,
    documentId,
    serviceEventId,
  });
  if (!verifyEval.ok) {
    return undefined;
  }

  return {
    capacityKwh: capacity,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source,
    documentId,
    serviceEventId,
  };
}