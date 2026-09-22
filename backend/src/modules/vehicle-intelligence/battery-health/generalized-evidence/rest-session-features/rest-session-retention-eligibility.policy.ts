import {
  BatteryGeneralizedEvidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import type {
  RestSessionRetentionAnchorInput,
  RestSessionRetentionCandidateInput,
  RestSessionRetentionEligiblePoint,
} from './rest-session-retention.types';
import { convertRestRetentionVoltageToMillivolts } from './rest-session-retention-voltage.policy';

const LADDER_EVIDENCE_CLASSES = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
  BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
]);

const EXCLUDED_EVIDENCE_CLASSES = new Set<BatteryGeneralizedEvidenceClass>([
  BatteryGeneralizedEvidenceClass.STALE_REPLAY,
  BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
  BatteryGeneralizedEvidenceClass.UNKNOWN,
  BatteryGeneralizedEvidenceClass.DRIVING_CHARGING,
  BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
  BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
  BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
  BatteryGeneralizedEvidenceClass.REST_STABLE_VOLTAGE,
]);

const ALLOWED_ALIGNMENT = new Set<BatteryShutdownStateAlignmentClass>([
  BatteryShutdownStateAlignmentClass.ALIGNED,
  BatteryShutdownStateAlignmentClass.PARTIAL,
]);

export function isRestSessionRetentionLadderEvidenceClass(
  evidenceClass: BatteryGeneralizedEvidenceClass,
): boolean {
  return LADDER_EVIDENCE_CLASSES.has(evidenceClass);
}

export function selectRestSessionRetentionEligiblePoints(input: {
  restSessionId: string;
  candidates: RestSessionRetentionCandidateInput[];
}): RestSessionRetentionEligiblePoint[] {
  const eligible: RestSessionRetentionEligiblePoint[] = [];

  for (const candidate of input.candidates) {
    if (candidate.restSessionId !== input.restSessionId) continue;
    if (!LADDER_EVIDENCE_CLASSES.has(candidate.evidenceClass)) continue;
    if (EXCLUDED_EVIDENCE_CLASSES.has(candidate.evidenceClass)) continue;
    if (!ALLOWED_ALIGNMENT.has(candidate.stateAlignmentClass)) continue;
    if (candidate.actualRestAgeMs == null || candidate.actualRestAgeMs <= 0) continue;
    if (candidate.voltageV == null || !Number.isFinite(candidate.voltageV)) continue;

    eligible.push({
      observationId: candidate.observationId,
      actualRestAgeMs: candidate.actualRestAgeMs,
      voltageMv: convertRestRetentionVoltageToMillivolts(candidate.voltageV),
      providerObservationAtMs: candidate.providerObservationAt?.getTime() ?? null,
      nominalRestIntervalIndex: candidate.nominalRestIntervalIndex,
      evidenceClass: candidate.evidenceClass,
    });
  }

  return sortRestSessionRetentionEligiblePoints(eligible);
}

export function sortRestSessionRetentionEligiblePoints(
  points: RestSessionRetentionEligiblePoint[],
): RestSessionRetentionEligiblePoint[] {
  return [...points].sort((a, b) => {
    if (a.actualRestAgeMs !== b.actualRestAgeMs) {
      return a.actualRestAgeMs - b.actualRestAgeMs;
    }
    const aProv = a.providerObservationAtMs ?? 0;
    const bProv = b.providerObservationAtMs ?? 0;
    if (aProv !== bProv) return aProv - bProv;
    return a.observationId.localeCompare(b.observationId);
  });
}

export function resolveRestSessionRetentionAnchorVoltageMv(
  anchor: RestSessionRetentionAnchorInput,
): number | null {
  if (anchor.evidenceClass !== BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION) {
    return null;
  }
  if (anchor.voltageV == null || !Number.isFinite(anchor.voltageV)) {
    return null;
  }
  return convertRestRetentionVoltageToMillivolts(anchor.voltageV);
}
