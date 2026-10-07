/**
 * M3.3-HV-H4-A3.3-O2 — TEST-ONLY / DESIGN-ONLY integrity attestation validity model.
 * Not wired to production loader or persistence.
 */

export const M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1 =
  'M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1';

export type M3_3HvH4A3HistoryIntegrityAttestationV1 = {
  revisionId: string;
  durabilityAckId: string;
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  evidenceContractVersion: string;
  sourceRevisionFingerprint: string;
  durabilityAckContractVersion: string;
  integrityAttestationContractVersion: string;
  attestedAt: Date;
  /** Witness for Strategy B/C — must match live revision row generation when present. */
  revisionMutationGeneration: number;
  ackMutationGeneration: number;
};

export type M3_3HvH4A3HistoryIntegrityAttestationRevisionWitnessV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  evidenceContractVersion: string;
  sourceRevisionFingerprint: string;
  mutationGeneration: number;
};

export type M3_3HvH4A3HistoryIntegrityAttestationAckWitnessV1 = {
  id: string;
  revisionId: string;
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  evidenceContractVersion: string;
  sourceRevisionFingerprint: string;
  durabilityAckContractVersion: string;
  mutationGeneration: number;
};

export type M3_3HvH4A3HistoryIntegrityAttestationValidityV1 =
  | { kind: 'VALID' }
  | { kind: 'INVALID'; reason: string }
  | { kind: 'MISSING' };

export type M3_3HvH4A3HistoryIntegrityAttestationReadPolicyV1 = {
  missPolicy: 'FULL_VERIFY';
  invalidPolicy: 'FULL_VERIFY';
  corruptionBecomesSourceFailure: false;
};

export const M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_READ_POLICY_V1: M3_3HvH4A3HistoryIntegrityAttestationReadPolicyV1 =
  {
    missPolicy: 'FULL_VERIFY',
    invalidPolicy: 'FULL_VERIFY',
    corruptionBecomesSourceFailure: false,
  };

function fieldMismatch(field: string): M3_3HvH4A3HistoryIntegrityAttestationValidityV1 {
  return { kind: 'INVALID', reason: `ATTESTATION_BINDING_MISMATCH:${field}` };
}

/**
 * Pure binding check — does NOT prove scientificEvidenceJson integrity (that requires full verifier).
 */
export function evaluateM3_3HvH4A3HistoryIntegrityAttestationBindingV1(input: {
  attestation: M3_3HvH4A3HistoryIntegrityAttestationV1 | null | undefined;
  revision: M3_3HvH4A3HistoryIntegrityAttestationRevisionWitnessV1;
  ack: M3_3HvH4A3HistoryIntegrityAttestationAckWitnessV1 | null | undefined;
}): M3_3HvH4A3HistoryIntegrityAttestationValidityV1 {
  if (!input.attestation) {
    return { kind: 'MISSING' };
  }
  const a = input.attestation;
  const rev = input.revision;
  if (a.revisionId !== rev.id) return fieldMismatch('revisionId');
  if (a.organizationId !== rev.organizationId) return fieldMismatch('organizationId');
  if (a.vehicleId !== rev.vehicleId) return fieldMismatch('vehicleId');
  if (a.segmentFingerprint !== rev.segmentFingerprint) return fieldMismatch('segmentFingerprint');
  if (a.evidenceContractVersion !== rev.evidenceContractVersion) {
    return fieldMismatch('evidenceContractVersion');
  }
  if (a.sourceRevisionFingerprint !== rev.sourceRevisionFingerprint) {
    return fieldMismatch('sourceRevisionFingerprint');
  }
  if (a.revisionMutationGeneration !== rev.mutationGeneration) {
    return { kind: 'INVALID', reason: 'REVISION_MUTATION_WITNESS_STALE' };
  }

  if (!input.ack) {
    return { kind: 'INVALID', reason: 'ACK_MISSING' };
  }
  const ack = input.ack;
  if (a.durabilityAckId !== ack.id) return fieldMismatch('durabilityAckId');
  if (ack.revisionId !== rev.id) return fieldMismatch('ack.revisionId');
  if (a.organizationId !== ack.organizationId) return fieldMismatch('ack.organizationId');
  if (a.vehicleId !== ack.vehicleId) return fieldMismatch('ack.vehicleId');
  if (a.segmentFingerprint !== ack.segmentFingerprint) return fieldMismatch('ack.segmentFingerprint');
  if (a.evidenceContractVersion !== ack.evidenceContractVersion) {
    return fieldMismatch('ack.evidenceContractVersion');
  }
  if (a.sourceRevisionFingerprint !== ack.sourceRevisionFingerprint) {
    return fieldMismatch('ack.sourceRevisionFingerprint');
  }
  if (a.durabilityAckContractVersion !== ack.durabilityAckContractVersion) {
    return fieldMismatch('durabilityAckContractVersion');
  }
  if (a.ackMutationGeneration !== ack.mutationGeneration) {
    return { kind: 'INVALID', reason: 'ACK_MUTATION_WITNESS_STALE' };
  }

  if (a.integrityAttestationContractVersion !== M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1) {
    return fieldMismatch('integrityAttestationContractVersion');
  }

  return { kind: 'VALID' };
}

export function shouldSkipHistoricalJsonReadForAttestationV1(
  validity: M3_3HvH4A3HistoryIntegrityAttestationValidityV1,
): boolean {
  return validity.kind === 'VALID';
}

export function historicalIntegrityPathForAttestationV1(
  validity: M3_3HvH4A3HistoryIntegrityAttestationValidityV1,
): 'NARROW_ATTESTED' | 'FULL_VERIFY' {
  return shouldSkipHistoricalJsonReadForAttestationV1(validity) ? 'NARROW_ATTESTED' : 'FULL_VERIFY';
}
