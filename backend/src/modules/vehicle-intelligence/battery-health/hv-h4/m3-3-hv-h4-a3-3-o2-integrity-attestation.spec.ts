import {
  evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1,
  historicalIntegrityPathForAttestationV1,
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  type M3_3HvH4A3HistoryIntegrityAttestationAckWitnessV1,
  type M3_3HvH4A3HistoryIntegrityAttestationRevisionWitnessV1,
  type M3_3HvH4A3HistoryIntegrityAttestationV1,
} from './m3-3-hv-h4-a3-3-o2-integrity-attestation.v1';

function baseRevision(): M3_3HvH4A3HistoryIntegrityAttestationRevisionWitnessV1 {
  return {
    id: 'rev-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    segmentFingerprint: 'seg-fp',
    evidenceContractVersion: 'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1',
    sourceRevisionFingerprint: 'a'.repeat(64),
    mutationGeneration: 1,
  };
}

function baseAck(rev: M3_3HvH4A3HistoryIntegrityAttestationRevisionWitnessV1): M3_3HvH4A3HistoryIntegrityAttestationAckWitnessV1 {
  return {
    id: 'ack-1',
    revisionId: rev.id,
    organizationId: rev.organizationId,
    vehicleId: rev.vehicleId,
    segmentFingerprint: rev.segmentFingerprint,
    evidenceContractVersion: rev.evidenceContractVersion,
    sourceRevisionFingerprint: rev.sourceRevisionFingerprint,
    durabilityAckContractVersion: 'M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1',
    mutationGeneration: 1,
  };
}

function baseAttestation(
  rev: M3_3HvH4A3HistoryIntegrityAttestationRevisionWitnessV1,
  ack: M3_3HvH4A3HistoryIntegrityAttestationAckWitnessV1,
): M3_3HvH4A3HistoryIntegrityAttestationV1 {
  return {
    revisionId: rev.id,
    durabilityAckId: ack.id,
    organizationId: rev.organizationId,
    vehicleId: rev.vehicleId,
    segmentFingerprint: rev.segmentFingerprint,
    evidenceContractVersion: rev.evidenceContractVersion,
    sourceRevisionFingerprint: rev.sourceRevisionFingerprint,
    durabilityAckContractVersion: ack.durabilityAckContractVersion,
    integrityAttestationContractVersion: M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
    attestedAt: new Date('2026-10-07T00:00:00.000Z'),
    revisionMutationGeneration: rev.mutationGeneration,
    ackMutationGeneration: ack.mutationGeneration,
  };
}

describe('M3.3-HV-H4-A3.3-O2 integrity attestation validity (pure)', () => {
  it('accepts exact attestation binding', () => {
    const rev = baseRevision();
    const ack = baseAck(rev);
    const attestation = baseAttestation(rev, ack);
    expect(
      evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1({ attestation, revision: rev, ack }),
    ).toEqual({ kind: 'VALID' });
    expect(historicalIntegrityPathForAttestationV1({ kind: 'VALID' })).toBe('NARROW_ATTESTED');
  });

  it('revision mutation witness stale => invalid => full verify', () => {
    const rev = baseRevision();
    const ack = baseAck(rev);
    const attestation = baseAttestation(rev, ack);
    const mutatedRev = { ...rev, mutationGeneration: 2 };
    const validity = evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1({
      attestation,
      revision: mutatedRev,
      ack,
    });
    expect(validity.kind).toBe('INVALID');
    expect(historicalIntegrityPathForAttestationV1(validity)).toBe('FULL_VERIFY');
  });

  it('ACK mutation witness stale => invalid => full verify', () => {
    const rev = baseRevision();
    const ack = baseAck(rev);
    const attestation = baseAttestation(rev, ack);
    const mutatedAck = { ...ack, mutationGeneration: 2 };
    const validity = evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1({
      attestation,
      revision: rev,
      ack: mutatedAck,
    });
    expect(validity.kind).toBe('INVALID');
    expect(historicalIntegrityPathForAttestationV1(validity)).toBe('FULL_VERIFY');
  });

  it('missing attestation => full verify (no false pass)', () => {
    const rev = baseRevision();
    const ack = baseAck(rev);
    const validity = evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1({
      attestation: null,
      revision: rev,
      ack,
    });
    expect(validity).toEqual({ kind: 'MISSING' });
    expect(historicalIntegrityPathForAttestationV1(validity)).toBe('FULL_VERIFY');
  });

  it('corrupted attestation binding => full verify', () => {
    const rev = baseRevision();
    const ack = baseAck(rev);
    const attestation = { ...baseAttestation(rev, ack), sourceRevisionFingerprint: 'b'.repeat(64) };
    const validity = evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1({
      attestation,
      revision: rev,
      ack,
    });
    expect(validity.kind).toBe('INVALID');
    expect(historicalIntegrityPathForAttestationV1(validity)).toBe('FULL_VERIFY');
  });

  it('missing ACK => invalid (fail closed on full verify path)', () => {
    const rev = baseRevision();
    const attestation = baseAttestation(rev, baseAck(rev));
    const validity = evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1({
      attestation,
      revision: rev,
      ack: null,
    });
    expect(validity).toEqual({ kind: 'INVALID', reason: 'ACK_MISSING' });
  });
});
