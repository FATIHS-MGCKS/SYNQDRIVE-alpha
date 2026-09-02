import { BatteryMeasurement, BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { buildAssessmentJobIdempotencyKey } from '../jobs/battery-v2-job-idempotency.policy';
import { buildRestMissedMeasurementIdempotencyKey } from './battery-rest-target-evaluation';
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

function isRestTargetMeasurementType(type: BatteryMeasurementType): boolean {
  return (
    type === BatteryMeasurementType.REST_60M ||
    type === BatteryMeasurementType.REST_6H
  );
}

function hasSourceObservationProvenance(
  measurement: Pick<BatteryMeasurement, 'provenance'>,
): boolean {
  const provenance = parseProvenance(measurement.provenance);
  const sourceObservationId = provenance?.sourceObservationId;
  return typeof sourceObservationId === 'string' && sourceObservationId.length > 0;
}

/**
 * Synthetic terminal row from persistMissedMeasurement (D2 replay contract).
 */
export function isSyntheticRestMissedMeasurement(
  measurement: Pick<BatteryMeasurement, 'provenance' | 'type' | 'quality' | 'idempotencyKey' | 'sessionId'>,
): boolean {
  if (!isRestTargetMeasurementType(measurement.type)) return false;
  if (hasSourceObservationProvenance(measurement)) return false;
  if (measurement.quality !== BatteryMeasurementQuality.MISSED) return false;
  if (!measurement.sessionId) return false;
  const restTargetType = restTargetTypeForMeasurementType(measurement.type);
  if (!restTargetType) return false;
  const expectedKey = buildRestMissedMeasurementIdempotencyKey({
    sessionId: measurement.sessionId,
    restTargetType,
  });
  return measurement.idempotencyKey === expectedKey;
}

/**
 * Synthetic terminal row from persistStatusMeasurement (D2 replay contract).
 */
export function isSyntheticRestStatusMeasurement(
  measurement: Pick<BatteryMeasurement, 'provenance' | 'type' | 'quality' | 'idempotencyKey' | 'sessionId'>,
): boolean {
  if (!isRestTargetMeasurementType(measurement.type)) return false;
  if (hasSourceObservationProvenance(measurement)) return false;
  if (measurement.quality === BatteryMeasurementQuality.MISSED) return false;
  if (!measurement.sessionId) return false;
  const restTargetType = restTargetTypeForMeasurementType(measurement.type);
  if (!restTargetType) return false;
  const expectedKey = buildRestMissedMeasurementIdempotencyKey({
    sessionId: measurement.sessionId,
    restTargetType,
  });
  return measurement.idempotencyKey === expectedKey;
}

export function readRestMeasurementTerminalReason(
  measurement: Pick<BatteryMeasurement, 'provenance'>,
): string | undefined {
  const provenance = parseProvenance(measurement.provenance);
  const code = provenance?.qualityReasonCode;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}
