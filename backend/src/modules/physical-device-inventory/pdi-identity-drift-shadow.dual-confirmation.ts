import {
  PdiIdentityDriftConfidence,
  PdiIdentityDriftReasonCode,
  type PdiIdentityDriftConfidence as DriftConfidenceLevel,
  type PdiIdentityDriftEvaluationRow,
  type PdiIdentityDriftShadowPersistedStateV1,
} from './pdi-identity-drift-shadow.types';

export function emptyPersistedState(syncRunId: string, evaluatedAt: Date): PdiIdentityDriftShadowPersistedStateV1 {
  return {
    version: 1,
    lastSyncRunId: syncRunId,
    lastEvaluatedAt: evaluatedAt.toISOString(),
    driftCandidates: {},
  };
}

export function parsePersistedState(raw: unknown): PdiIdentityDriftShadowPersistedStateV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.lastSyncRunId !== 'string' || typeof o.lastEvaluatedAt !== 'string') return null;
  if (!o.driftCandidates || typeof o.driftCandidates !== 'object') return null;
  return o as PdiIdentityDriftShadowPersistedStateV1;
}

/**
 * Applies dual-confirmation using prior VEHICLE_SYNC poll meta only (no new tables).
 * CONFIRMED requires two distinct observationSnapshotFingerprints for the same driftSignature.
 */
export function applyDualConfirmationPolicy(input: {
  rows: PdiIdentityDriftEvaluationRow[];
  previousState: PdiIdentityDriftShadowPersistedStateV1 | null;
  evaluatedAt: Date;
  syncRunId: string;
}): {
  rows: PdiIdentityDriftEvaluationRow[];
  nextState: PdiIdentityDriftShadowPersistedStateV1;
} {
  const nextState = emptyPersistedState(input.syncRunId, input.evaluatedAt);
  const prevCandidates = input.previousState?.driftCandidates ?? {};

  const rows = input.rows.map((row) => {
    if (row.reasonCode === PdiIdentityDriftReasonCode.MATCH) {
      return { ...row, confidence: PdiIdentityDriftConfidence.HIGH };
    }

    if (row.confidence === PdiIdentityDriftConfidence.UNCONFIRMED) {
      return row;
    }

    const signature = row.driftSignature;
    if (!signature) {
      return { ...row, confidence: PdiIdentityDriftConfidence.UNCONFIRMED };
    }

    const fingerprint = row.provenance.observationSnapshotFingerprint;
    const prior = prevCandidates[signature];
    const priorFingerprints = prior?.observationFingerprints ?? [];
    const isDuplicateSnapshot = priorFingerprints.includes(fingerprint);

    let confidence: DriftConfidenceLevel = PdiIdentityDriftConfidence.CANDIDATE;
    if (!isDuplicateSnapshot && priorFingerprints.length >= 1) {
      confidence = PdiIdentityDriftConfidence.CONFIRMED;
    }

    const mergedFingerprints = isDuplicateSnapshot
      ? priorFingerprints
      : [...priorFingerprints, fingerprint].slice(-5);

    nextState.driftCandidates[signature] = {
      reasonCode: row.reasonCode,
      observationFingerprints: mergedFingerprints,
      lastConfidence: confidence,
      lastSeenAt: input.evaluatedAt.toISOString(),
    };

    return { ...row, confidence };
  });

  return { rows, nextState };
}

export function shouldEmitShadowLogLine(
  row: PdiIdentityDriftEvaluationRow,
  previousState: PdiIdentityDriftShadowPersistedStateV1 | null,
): boolean {
  if (row.reasonCode === PdiIdentityDriftReasonCode.MATCH) {
    const signature = row.driftSignature;
    if (!signature) return false;
    return Boolean(previousState?.driftCandidates[signature]);
  }
  if (row.confidence === PdiIdentityDriftConfidence.UNCONFIRMED) {
    return row.detailCodes.includes('PROVIDER_MIRROR_STALE_OR_MISSING') === false;
  }
  return (
    row.confidence === PdiIdentityDriftConfidence.CANDIDATE ||
    row.confidence === PdiIdentityDriftConfidence.CONFIRMED
  );
}

export function formatShadowLogLine(row: PdiIdentityDriftEvaluationRow): string {
  return JSON.stringify({
    channel: 'PDI_IDENTITY_DRIFT_SHADOW',
    reasonCode: row.reasonCode,
    confidence: row.confidence,
    physicalDeviceId: row.physicalDeviceId,
    vehicleId: row.vehicleId,
    dimoTokenId: row.dimoTokenId,
    expectedSerialMasked: row.expectedSerialMasked,
    observedSerialMasked: row.observedSerialMasked,
    mirrorSyncedAt: row.provenance.mirrorSyncedAt,
    provenance: row.provenance.source,
    observationSnapshotFingerprint: row.provenance.observationSnapshotFingerprint,
    detailCodes: row.detailCodes,
    note: 'Observed provider registry serial; not proof of physical device swap',
  });
}
