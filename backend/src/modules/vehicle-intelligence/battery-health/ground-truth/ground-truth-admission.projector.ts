import {
  BatteryEvidenceSourceType,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { M3_3G_GROUND_TRUTH_ADMISSION_CONTRACT } from './ground-truth.constants';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  GROUND_TRUTH_ADMISSION_REASON,
  type GroundTruthAdmissionContextV1,
  type GroundTruthAdmissionDecisionV1,
} from './ground-truth-admission.types';

const EXCLUDED_SOURCES: BatteryEvidenceSourceType[] = [
  BatteryEvidenceSourceType.TELEMETRY_DERIVED,
  BatteryEvidenceSourceType.MODEL_DERIVED,
];

const MEASUREMENT_ADMISSIBLE: BatteryEvidenceSourceType[] = [
  BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
  BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
];

function decision(
  level: GroundTruthAdmissionDecisionV1['level'],
  reasons: GroundTruthAdmissionDecisionV1['reasons'],
): GroundTruthAdmissionDecisionV1 {
  return {
    contractVersion: M3_3G_GROUND_TRUTH_ADMISSION_CONTRACT,
    level,
    reasons,
  };
}

/**
 * Pure admission projector — no I/O.
 */
export function projectGroundTruthAdmissionV1(
  ctx: GroundTruthAdmissionContextV1,
): GroundTruthAdmissionDecisionV1 {
  if (ctx.vehicleOrganizationId !== ctx.organizationId) {
    return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [
      GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH,
    ]);
  }

  const evidence = ctx.sourceIdentity.batteryEvidence;
  if (evidence && EXCLUDED_SOURCES.includes(evidence.sourceType)) {
    const reason =
      evidence.sourceType === BatteryEvidenceSourceType.TELEMETRY_DERIVED
        ? GROUND_TRUTH_ADMISSION_REASON.TELEMETRY_DERIVED_EXCLUDED
        : GROUND_TRUTH_ADMISSION_REASON.MODEL_DERIVED_EXCLUDED;
    return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [reason]);
  }

  if (!ctx.effectiveAt || Number.isNaN(ctx.effectiveAt.getTime())) {
    return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [
      GROUND_TRUTH_ADMISSION_REASON.EFFECTIVE_TIME_REQUIRED,
    ]);
  }

  if (ctx.batteryScope !== 'LV' && ctx.batteryScope !== 'HV') {
    return decision(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE, [
      GROUND_TRUTH_ADMISSION_REASON.SCOPE_REQUIRED,
    ]);
  }

  if (ctx.groundTruthType === 'BATTERY_REPLACEMENT') {
    const event = ctx.sourceIdentity.serviceEvent;
    if (!event || event.eventType !== ServiceEventType.BATTERY_REPLACEMENT) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE, [
        GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING,
      ]);
    }

    if (!evidence || evidence.scope !== ctx.batteryScope) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE, [
        GROUND_TRUTH_ADMISSION_REASON.REPLACEMENT_SCOPE_AMBIGUOUS,
      ]);
    }

    const origin = event.origin;
    const documentConfirmed =
      origin === ServiceEventOrigin.AI_UPLOAD ||
      origin === ServiceEventOrigin.WORKSHOP_DOCUMENT ||
      ctx.sourceAuthority === 'CONFIRMED_DOCUMENT' ||
      ctx.sourceAuthority === 'OEM';

    const manualConfirmed =
      ctx.sourceAuthority === 'MANUAL_CONFIRMED' && ctx.manualConfirmationTrusted;

    if (origin === ServiceEventOrigin.MANUAL && !manualConfirmed) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE, [
        GROUND_TRUTH_ADMISSION_REASON.MANUAL_ORIGIN_NOT_CONFIRMED,
      ]);
    }

    if (!documentConfirmed && !manualConfirmed && origin !== ServiceEventOrigin.IMPORT) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE, [
        GROUND_TRUTH_ADMISSION_REASON.REPLACEMENT_WITHOUT_CONFIRMATION,
      ]);
    }

    return decision(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, [
      GROUND_TRUTH_ADMISSION_REASON.ADMITTED,
    ]);
  }

  if (ctx.groundTruthType === 'WORKSHOP_MEASUREMENT') {
    if (!evidence || !MEASUREMENT_ADMISSIBLE.includes(evidence.sourceType)) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [
        GROUND_TRUTH_ADMISSION_REASON.UNSUPPORTED_SOURCE_TYPE,
      ]);
    }

    if (evidence.scope !== ctx.batteryScope) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [
        GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
      ]);
    }

    const doc = ctx.sourceIdentity.documentExtraction;
    if (doc && doc.status !== 'CONFIRMED' && doc.status !== 'APPLIED') {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [
        GROUND_TRUTH_ADMISSION_REASON.DOCUMENT_UNCONFIRMED,
      ]);
    }

    return decision(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, [
      GROUND_TRUTH_ADMISSION_REASON.ADMITTED,
    ]);
  }

  if (ctx.groundTruthType === 'OTHER_CONFIRMED_INTERVENTION') {
    if (!ctx.manualConfirmationTrusted && !ctx.confirmedAt) {
      return decision(GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE, [
        GROUND_TRUTH_ADMISSION_REASON.CONFIRMATION_REQUIRED,
      ]);
    }
    return decision(GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, [
      GROUND_TRUTH_ADMISSION_REASON.ADMITTED,
    ]);
  }

  return decision(GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED, [
    GROUND_TRUTH_ADMISSION_REASON.UNSUPPORTED_SOURCE_TYPE,
  ]);
}
