import type { BatteryAssessment } from '@prisma/client';
import type { HvCrossSessionAssessment } from '../hv-capacity-shadow/hv-capacity-cross-session.types';
import type { HvSohGateCrossSessionInput } from '../hv-capacity-shadow/hv-soh-gate.types';
import { HV_SOH_GATE_MODEL_VERSION } from '../hv-capacity-shadow/hv-soh-gate.types';

export interface PersistedCrossSessionEvidence {
  shadowGatePassed: boolean;
  sessionIds: string[];
  sessionCount: number;
  estimatedUsableCapacityKwh: number | null;
  computedAt: string;
  gateReasonCodes: string[];
  methodAgreement: {
    sessionsWithM3Conflict: number;
  };
  confidence: string;
  idempotencyKey: string;
  modelVersion: number;
  capabilityVersion: number | null;
}

export function mapBatteryAssessmentToCrossSessionEvidence(
  row: BatteryAssessment | null,
): PersistedCrossSessionEvidence | null {
  if (!row?.inputSummary || typeof row.inputSummary !== 'object') {
    return null;
  }
  const summary = row.inputSummary as Record<string, unknown>;
  const methodAgreement =
    summary.methodAgreement && typeof summary.methodAgreement === 'object'
      ? (summary.methodAgreement as Record<string, unknown>)
      : {};

  return {
    shadowGatePassed: summary.shadowGatePassed === true,
    sessionIds: Array.isArray(summary.sessionIds)
      ? summary.sessionIds.filter((id): id is string => typeof id === 'string')
      : [],
    sessionCount: typeof summary.sessionCount === 'number' ? summary.sessionCount : 0,
    estimatedUsableCapacityKwh:
      typeof row.scoreValue === 'number' && Number.isFinite(row.scoreValue)
        ? row.scoreValue
        : null,
    computedAt: row.computedAt.toISOString(),
    gateReasonCodes: Array.isArray(summary.gateReasonCodes)
      ? summary.gateReasonCodes.filter((c): c is string => typeof c === 'string')
      : [],
    methodAgreement: {
      sessionsWithM3Conflict:
        typeof methodAgreement.sessionsWithM3Conflict === 'number'
          ? methodAgreement.sessionsWithM3Conflict
          : 0,
    },
    confidence: typeof summary.confidence === 'string' ? summary.confidence : row.confidence ?? 'INSUFFICIENT',
    idempotencyKey: row.idempotencyKey,
    modelVersion: row.modelVersion,
    capabilityVersion:
      typeof summary.capabilityVersion === 'number' ? summary.capabilityVersion : null,
  };
}

export function mapPersistedCrossSessionToSohGateInput(
  evidence: PersistedCrossSessionEvidence | null,
): HvSohGateCrossSessionInput | null {
  if (!evidence) return null;

  return {
    shadowGatePassed: evidence.shadowGatePassed,
    estimatedUsableCapacityKwh: evidence.estimatedUsableCapacityKwh,
    sessionCount: evidence.sessionCount,
    computedAt: evidence.computedAt,
    gateReasonCodes: evidence.gateReasonCodes as HvSohGateCrossSessionInput['gateReasonCodes'],
    methodAgreement: evidence.methodAgreement,
    confidence: evidence.confidence as HvSohGateCrossSessionInput['confidence'],
    idempotencyKey: evidence.idempotencyKey,
    modelVersion: evidence.modelVersion ?? HV_SOH_GATE_MODEL_VERSION,
    capabilityVersion: evidence.capabilityVersion,
  };
}

/** @internal test hook — same shape as persisted pipeline assessment */
export function crossSessionEvidenceFromAssessment(
  assessment: HvCrossSessionAssessment,
): PersistedCrossSessionEvidence {
  return {
    shadowGatePassed: assessment.shadowGatePassed,
    sessionIds: assessment.sessionIds ?? [],
    sessionCount: assessment.sessionCount,
    estimatedUsableCapacityKwh: assessment.estimatedUsableCapacityKwh,
    computedAt: assessment.computedAt,
    gateReasonCodes: assessment.gateReasonCodes,
    methodAgreement: {
      sessionsWithM3Conflict: assessment.methodAgreement.sessionsWithM3Conflict,
    },
    confidence: assessment.confidence,
    idempotencyKey: assessment.idempotencyKey,
    modelVersion: assessment.modelVersion,
    capabilityVersion:
      typeof assessment.inputSummary?.capabilityVersion === 'number'
        ? assessment.inputSummary.capabilityVersion
        : null,
  };
}
