import {
  BatteryGeneralizedEvidenceClass,
  BatteryGeneralizedEvidenceConfidence,
} from '@prisma/client';
import { isPlausibleLvVoltage } from '../generalized-evidence-classification.helpers';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import type { RestSessionRetentionAnchorInput } from './rest-session-retention.types';
import { convertRestRetentionVoltageToMillivolts } from './rest-session-retention-voltage.policy';
import type { RestSessionFeatureInputAnchorV1 } from './rest-session-feature-input-snapshot.types';

export type RestSessionRetentionAnchorCandidateRow = {
  observationId: string;
  sourceMeasurementId: string;
  restSessionId: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  evidenceConfidence: BatteryGeneralizedEvidenceConfidence;
  actualRestAgeMs: number | null;
  voltage: number | null;
  voltageObservedAt: Date | null;
  providerTimestampSource: string | null;
};

export type CanonicalRestSessionRetentionAnchorResult =
  | { status: 'UNAVAILABLE' }
  | {
      status: 'SELECTED';
      snapshotAnchor: RestSessionFeatureInputAnchorV1;
      retentionAnchor: RestSessionRetentionAnchorInput;
      duplicateCandidateObservationIds: string[];
    }
  | {
      status: 'AMBIGUOUS';
      duplicateCandidateObservationIds: string[];
    };

function anchorSemanticFingerprint(row: {
  sourceMeasurementId: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  evidenceConfidence: BatteryGeneralizedEvidenceConfidence;
  actualRestAgeMs: number;
  voltageMv: number;
  voltageObservedAtIso: string;
  providerTimestampSource: string;
}): string {
  return JSON.stringify([
    row.sourceMeasurementId,
    row.evidenceClass,
    row.evidenceConfidence,
    row.actualRestAgeMs,
    row.voltageMv,
    row.voltageObservedAtIso,
    row.providerTimestampSource,
  ]);
}

function isValidAnchorCandidate(
  row: RestSessionRetentionAnchorCandidateRow,
  targetRestSessionId: string,
  anchorAt: Date,
): boolean {
  if (row.restSessionId !== targetRestSessionId) return false;
  if (row.evidenceClass !== BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION) return false;
  if (row.actualRestAgeMs !== 0) return false;
  if (row.voltage == null || !isPlausibleLvVoltage(row.voltage)) return false;
  if (row.voltageObservedAt == null) return false;
  if (row.providerTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP) {
    return false;
  }
  return row.voltageObservedAt.getTime() === anchorAt.getTime();
}

export function resolveCanonicalRestSessionRetentionAnchor(input: {
  restSessionId: string;
  anchorAt: Date;
  candidates: RestSessionRetentionAnchorCandidateRow[];
}): CanonicalRestSessionRetentionAnchorResult {
  const valid = input.candidates.filter((row) =>
    isValidAnchorCandidate(row, input.restSessionId, input.anchorAt),
  );

  if (valid.length === 0) {
    return { status: 'UNAVAILABLE' };
  }

  const normalized = valid.map((row) => {
    const voltageObservedAtIso = row.voltageObservedAt!.toISOString();
    const voltageMv = convertRestRetentionVoltageToMillivolts(row.voltage!);
    return {
      row,
      fingerprint: anchorSemanticFingerprint({
        sourceMeasurementId: row.sourceMeasurementId,
        evidenceClass: row.evidenceClass,
        evidenceConfidence: row.evidenceConfidence,
        actualRestAgeMs: 0,
        voltageMv,
        voltageObservedAtIso,
        providerTimestampSource: row.providerTimestampSource!,
      }),
      voltageObservedAtIso,
      voltageMv,
    };
  });

  const fingerprints = new Set(normalized.map((entry) => entry.fingerprint));
  const allIds = normalized.map((entry) => entry.row.observationId).sort((a, b) => a.localeCompare(b));

  if (fingerprints.size > 1) {
    return { status: 'AMBIGUOUS', duplicateCandidateObservationIds: allIds };
  }

  const chosen = [...normalized].sort((a, b) =>
    a.row.observationId.localeCompare(b.row.observationId),
  )[0];

  const snapshotAnchor: RestSessionFeatureInputAnchorV1 = {
    observationId: chosen.row.observationId,
    sourceMeasurementId: chosen.row.sourceMeasurementId,
    evidenceClass: chosen.row.evidenceClass,
    evidenceConfidence: chosen.row.evidenceConfidence,
    actualRestAgeMs: 0,
    voltageMv: chosen.voltageMv,
    voltageObservedAt: chosen.voltageObservedAtIso,
    providerTimestampSource: chosen.row.providerTimestampSource!,
  };

  const retentionAnchor: RestSessionRetentionAnchorInput = {
    restSessionId: input.restSessionId,
    evidenceClass: chosen.row.evidenceClass,
    actualRestAgeMs: 0,
    voltageV: chosen.row.voltage,
  };

  return {
    status: 'SELECTED',
    snapshotAnchor,
    retentionAnchor,
    duplicateCandidateObservationIds: allIds.filter((id) => id !== chosen.row.observationId),
  };
}
