import {
  BatteryGeneralizedEvidenceClass,
  BatteryGeneralizedEvidenceConfidence,
} from '@prisma/client';
import {
  isAlternatorVoltage,
  isChargingContextFromFields,
  isPlausibleLvVoltage,
  isSpeedKnownAtRest,
} from './generalized-evidence-classification.helpers';
import type { GeneralizedEvidenceFieldBundle } from './generalized-evidence.types';
import {
  resolveStateAlignment,
  resolveStateCompleteness,
} from '../shutdown-evidence/shutdown-evidence-classification.policy';

export interface ClassifyGeneralizedEvidenceInput {
  fields: GeneralizedEvidenceFieldBundle;
  referenceAt: Date;
  providerObservationOutcome?: string | null;
  /** Provider-qualified age vs session anchor; null when LV provider time missing. */
  actualRestAgeMs?: number | null;
  restStablePromotionEnabled?: boolean;
  /** M3.3B+ — R1 cadence qualification; must stay false in M3.3A.x */
  restWakeCadenceQualified?: boolean;
  /** Explicit provider/source semantic marking periodic R1 wake (not implemented in M3.3A) */
  restWakeSourceSemantic?: boolean;
}

export interface ClassifyGeneralizedEvidenceResult {
  evidenceClass: BatteryGeneralizedEvidenceClass;
  evidenceConfidence: BatteryGeneralizedEvidenceConfidence;
  stateCompleteness: ReturnType<typeof resolveStateCompleteness>;
  stateAlignmentClass: ReturnType<typeof resolveStateAlignment>['stateAlignmentClass'];
  stateTimestampSkewMs: number | null;
  maxFieldTimestampSkewMs: number | null;
}

function mapConfidence(
  evidenceClass: BatteryGeneralizedEvidenceClass,
  completeness: ReturnType<typeof resolveStateCompleteness>,
): BatteryGeneralizedEvidenceConfidence {
  if (
    evidenceClass === BatteryGeneralizedEvidenceClass.UNKNOWN ||
    evidenceClass === BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS
  ) {
    return BatteryGeneralizedEvidenceConfidence.INSUFFICIENT;
  }
  if (evidenceClass === BatteryGeneralizedEvidenceClass.STALE_REPLAY) {
    return BatteryGeneralizedEvidenceConfidence.LOW;
  }
  if (completeness === 'PARTIAL') {
    return BatteryGeneralizedEvidenceConfidence.MEDIUM;
  }
  if (
    evidenceClass === BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE ||
    evidenceClass === BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION ||
    evidenceClass === BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE
  ) {
    return BatteryGeneralizedEvidenceConfidence.MEDIUM;
  }
  return BatteryGeneralizedEvidenceConfidence.HIGH;
}

function classifyParkedEngineOff(
  input: ClassifyGeneralizedEvidenceInput,
  completeness: ReturnType<typeof resolveStateCompleteness>,
  alignment: ReturnType<typeof resolveStateAlignment>,
): ClassifyGeneralizedEvidenceResult {
  const restAge = input.actualRestAgeMs;
  const wakeQualified =
    input.restWakeCadenceQualified === true || input.restWakeSourceSemantic === true;

  if (wakeQualified) {
    if (input.restStablePromotionEnabled === true) {
      return wrap(
        BatteryGeneralizedEvidenceClass.REST_STABLE_VOLTAGE,
        completeness,
        alignment,
      );
    }
    return wrap(
      BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
      completeness,
      alignment,
    );
  }

  if (restAge == null || restAge <= 0) {
    return wrap(
      BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
      completeness,
      alignment,
    );
  }

  return wrap(
    BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
    completeness,
    alignment,
  );
}

export function classifyGeneralizedEvidence(
  input: ClassifyGeneralizedEvidenceInput,
): ClassifyGeneralizedEvidenceResult {
  const alignment = resolveStateAlignment(input.fields, input.referenceAt);
  const completeness = resolveStateCompleteness(input.fields);

  if (input.providerObservationOutcome === 'STALE_REPLAY') {
    return {
      evidenceClass: BatteryGeneralizedEvidenceClass.STALE_REPLAY,
      evidenceConfidence: BatteryGeneralizedEvidenceConfidence.LOW,
      stateCompleteness: completeness,
      stateAlignmentClass: alignment.stateAlignmentClass,
      stateTimestampSkewMs: alignment.stateTimestampSkewMs,
      maxFieldTimestampSkewMs: alignment.maxFieldTimestampSkewMs,
    };
  }

  if (completeness === 'MISSING') {
    return {
      evidenceClass: BatteryGeneralizedEvidenceClass.UNKNOWN,
      evidenceConfidence: BatteryGeneralizedEvidenceConfidence.INSUFFICIENT,
      stateCompleteness: completeness,
      stateAlignmentClass: alignment.stateAlignmentClass,
      stateTimestampSkewMs: alignment.stateTimestampSkewMs,
      maxFieldTimestampSkewMs: alignment.maxFieldTimestampSkewMs,
    };
  }

  const fields = input.fields;
  const voltage = fields.voltage;

  if (fields.activeTrip === true && !isSpeedKnownAtRest(fields.speedKmh)) {
    return wrap(
      BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
      completeness,
      alignment,
    );
  }

  if (isChargingContextFromFields(fields)) {
    return wrap(
      BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
      completeness,
      alignment,
    );
  }

  const driving =
    fields.engineRunning === true ||
    fields.ignitionOn === true ||
    (fields.speedKmh != null && !isSpeedKnownAtRest(fields.speedKmh));

  if (
    driving ||
    (voltage != null && isAlternatorVoltage(voltage)) ||
    fields.isLvCharging === true
  ) {
    const evidenceClass =
      voltage != null && (isAlternatorVoltage(voltage) || fields.isLvCharging)
        ? BatteryGeneralizedEvidenceClass.DRIVING_CHARGING
        : BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING;
    return wrap(evidenceClass, completeness, alignment);
  }

  const engineOff =
    fields.ignitionOn === false &&
    fields.engineRunning === false &&
    isSpeedKnownAtRest(fields.speedKmh);

  if (engineOff && isPlausibleLvVoltage(voltage)) {
    return classifyParkedEngineOff(input, completeness, alignment);
  }

  if (
    fields.speedKmh == null ||
    fields.ignitionOn == null ||
    fields.engineRunning == null
  ) {
    return wrap(
      BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
      completeness,
      alignment,
    );
  }

  return wrap(BatteryGeneralizedEvidenceClass.UNKNOWN, completeness, alignment);
}

function wrap(
  evidenceClass: BatteryGeneralizedEvidenceClass,
  completeness: ReturnType<typeof resolveStateCompleteness>,
  alignment: ReturnType<typeof resolveStateAlignment>,
): ClassifyGeneralizedEvidenceResult {
  return {
    evidenceClass,
    evidenceConfidence: mapConfidence(evidenceClass, completeness),
    stateCompleteness: completeness,
    stateAlignmentClass: alignment.stateAlignmentClass,
    stateTimestampSkewMs: alignment.stateTimestampSkewMs,
    maxFieldTimestampSkewMs: alignment.maxFieldTimestampSkewMs,
  };
}
