import { BatteryMeasurement, BatteryMeasurementType } from '@prisma/client';
import { buildAssessmentJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { LV_REST_TARGET_TYPES, type LvRestTargetType } from './lv-rest-window-target.metadata';

function parseProvenance(
  provenance: BatteryMeasurement['provenance'],
): Record<string, unknown> | null {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return null;
  }
  return provenance as Record<string, unknown>;
}

/**
 * Handoff-eligible canonical REST measurements carry selected-observation provenance
 * (`sourceObservationId`) from evaluateAndPersist success paths (D2).
 */
export function isCanonicalRestAssessmentHandoffEligible(
  measurement: Pick<BatteryMeasurement, 'provenance' | 'type'>,
): boolean {
  const provenance = parseProvenance(measurement.provenance);
  const sourceObservationId = provenance?.sourceObservationId;
  return (
    typeof sourceObservationId === 'string' &&
    sourceObservationId.length > 0 &&
    (measurement.type === BatteryMeasurementType.REST_60M ||
      measurement.type === BatteryMeasurementType.REST_6H)
  );
}

export function restTargetTypeForMeasurementType(
  type: BatteryMeasurementType,
): LvRestTargetType | null {
  switch (type) {
    case BatteryMeasurementType.REST_60M:
      return LV_REST_TARGET_TYPES.REST_60M;
    case BatteryMeasurementType.REST_6H:
      return LV_REST_TARGET_TYPES.REST_6H;
    default:
      return null;
  }
}

export function buildCanonicalLvAssessmentHandoffJobKey(input: {
  vehicleId: string;
  measurementId: string;
}): string {
  return buildAssessmentJobIdempotencyKey({
    vehicleId: input.vehicleId,
    assessmentType: 'LV_HEALTH',
    inputVersion: input.measurementId,
  });
}
