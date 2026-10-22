import {
  applyDualConfirmationPolicy,
  emptyPersistedState,
  shouldEmitShadowLogLine,
} from './pdi-identity-drift-shadow.dual-confirmation';
import {
  PdiIdentityDriftConfidence,
  PdiIdentityDriftReasonCode,
  type PdiIdentityDriftEvaluationRow,
} from './pdi-identity-drift-shadow.types';

const evaluatedAt = new Date('2026-10-22T12:00:00.000Z');

function driftRow(partial: Partial<PdiIdentityDriftEvaluationRow>): PdiIdentityDriftEvaluationRow {
  return {
    physicalDeviceId: '11111111-1111-4111-8111-111111111111',
    vehicleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    dimoTokenId: 100001,
    reasonCode: PdiIdentityDriftReasonCode.SWAP_SUSPECTED,
    confidence: PdiIdentityDriftConfidence.CANDIDATE,
    expectedSerialMasked: 'R1-T***-AAA',
    observedSerialMasked: 'R1-T***-BBB',
    provenance: {
      source: 'DIMO_VEHICLE_MIRROR',
      mirrorSyncedAt: evaluatedAt.toISOString(),
      observationSnapshotFingerprint: partial.provenance?.observationSnapshotFingerprint ?? 'fp-1',
      syncRunId: 'run-1',
    },
    driftSignature: partial.driftSignature ?? 'sig-drift-1',
    detailCodes: ['OBSERVED_SERIAL_ACTIVE_ON_OTHER_VEHICLE'],
    ...partial,
  };
}

describe('pdi-identity-drift-shadow.dual-confirmation', () => {
  it('7. identical snapshot twice → stays CANDIDATE (no CONFIRMED)', () => {
    const row = driftRow({});
    const prev = emptyPersistedState('prev', evaluatedAt);
    prev.driftCandidates['sig-drift-1'] = {
      reasonCode: PdiIdentityDriftReasonCode.SWAP_SUSPECTED,
      observationFingerprints: ['fp-1'],
      lastConfidence: PdiIdentityDriftConfidence.CANDIDATE,
      lastSeenAt: evaluatedAt.toISOString(),
    };
    const { rows } = applyDualConfirmationPolicy({
      rows: [row],
      previousState: prev,
      evaluatedAt,
      syncRunId: 'run-2',
    });
    expect(rows[0].confidence).toBe(PdiIdentityDriftConfidence.CANDIDATE);
  });

  it('8. two independent observations → CONFIRMED', () => {
    const row = driftRow({
      provenance: {
        source: 'DIMO_VEHICLE_MIRROR',
        mirrorSyncedAt: evaluatedAt.toISOString(),
        observationSnapshotFingerprint: 'fp-2',
        syncRunId: 'run-2',
      },
    });
    const prev = emptyPersistedState('prev', evaluatedAt);
    prev.driftCandidates['sig-drift-1'] = {
      reasonCode: PdiIdentityDriftReasonCode.SWAP_SUSPECTED,
      observationFingerprints: ['fp-1'],
      lastConfidence: PdiIdentityDriftConfidence.CANDIDATE,
      lastSeenAt: evaluatedAt.toISOString(),
    };
    const { rows } = applyDualConfirmationPolicy({
      rows: [row],
      previousState: prev,
      evaluatedAt,
      syncRunId: 'run-2',
    });
    expect(rows[0].confidence).toBe(PdiIdentityDriftConfidence.CONFIRMED);
  });

  it('9. deviation disappears (MATCH) → prior candidate not carried forward', () => {
    const matchRow = driftRow({
      reasonCode: PdiIdentityDriftReasonCode.MATCH,
      confidence: PdiIdentityDriftConfidence.HIGH,
      driftSignature: null,
    });
    const prev = emptyPersistedState('prev', evaluatedAt);
    prev.driftCandidates['sig-old'] = {
      reasonCode: PdiIdentityDriftReasonCode.SWAP_SUSPECTED,
      observationFingerprints: ['fp-1'],
      lastConfidence: PdiIdentityDriftConfidence.CONFIRMED,
      lastSeenAt: evaluatedAt.toISOString(),
    };
    const { nextState } = applyDualConfirmationPolicy({
      rows: [matchRow],
      previousState: prev,
      evaluatedAt,
      syncRunId: 'run-clear',
    });
    expect(nextState.driftCandidates['sig-old']).toBeUndefined();
    expect(shouldEmitShadowLogLine(matchRow, prev)).toBe(false);
  });
});
