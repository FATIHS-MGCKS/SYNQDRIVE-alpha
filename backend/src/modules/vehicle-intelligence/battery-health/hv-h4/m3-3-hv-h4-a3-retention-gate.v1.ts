import type { HvChargeSession, Prisma } from '@prisma/client';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  H4EvidenceAckIdentityMismatchError,
  H4EvidenceRevisionMirrorIncoherenceError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
  H4EvidenceUnsupportedContractVersionError,
  H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.mapper.v1';
import {
  assertAckMirrorsRevisionV1,
  assertStoredEvidenceRevisionMatchesPersistenceInputV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.persistence.verify.v1';
import {
  M3_3_HV_H4_A3_RETENTION_GATE_REASON,
  type M3_3HvH4A3RetentionGateBlockKind,
  type M3_3HvH4A3RetentionGateOutcomeV1,
} from './m3-3-hv-h4-a3-retention-gate.types.v1';

type DbClient = Prisma.TransactionClient | Pick<Prisma.TransactionClient, keyof Prisma.TransactionClient>;

function blocked(
  blockKind: M3_3HvH4A3RetentionGateBlockKind,
  reasonCode: string,
): M3_3HvH4A3RetentionGateOutcomeV1 {
  return { kind: 'BLOCKED', blockKind, reasonCode };
}

function mapIntegrityError(error: unknown): M3_3HvH4A3RetentionGateOutcomeV1 {
  if (error instanceof H4EvidenceAckIdentityMismatchError) {
    return blocked('BLOCKED_ACK_IDENTITY_MISMATCH', error.code);
  }
  if (error instanceof H4EvidenceUnsupportedContractVersionError) {
    return blocked('BLOCKED_CONTRACT_VERSION', error.code);
  }
  if (
    error instanceof H4EvidenceRevisionStoredFingerprintMismatchError ||
    error instanceof H4EvidenceRevisionMirrorIncoherenceError ||
    error instanceof H4SourceRevisionFingerprintCollisionOrCanonicalizationDriftError
  ) {
    return blocked('BLOCKED_REVISION_INTEGRITY', (error as Error).name);
  }
  throw error;
}

export async function evaluateCurrentHvChargeSessionPruneDurabilityV1(input: {
  db: DbClient;
  session: HvChargeSession;
  retentionCutoff: Date;
}): Promise<M3_3HvH4A3RetentionGateOutcomeV1> {
  if (input.session.startAt.getTime() >= input.retentionCutoff.getTime()) {
    return blocked(
      'BLOCKED_RETENTION_CUTOFF',
      M3_3_HV_H4_A3_RETENTION_GATE_REASON.RETENTION_CUTOFF_NOT_MET,
    );
  }

  const observationCount = await input.db.hvCapacityObservation.count({
    where: { chargeSessionId: input.session.id },
  });
  if (observationCount > 0) {
    return blocked(
      'BLOCKED_CAPACITY_OBSERVATION_REFERENCE',
      M3_3_HV_H4_A3_RETENTION_GATE_REASON.HV_CAPACITY_OBSERVATION_REFERENCE,
    );
  }

  let persistenceInput;
  try {
    persistenceInput = buildM3_3HvH4ChargeSessionEvidencePersistenceInputFromSessionV1(
      input.session,
      M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
    );
  } catch (error) {
    return mapIntegrityError(error);
  }

  const revision = await input.db.batteryHvChargeSessionEvidenceRevision.findUnique({
    where: {
      organizationId_vehicleId_segmentFingerprint_evidenceContractVersion_sourceRevisionFingerprint:
        {
          organizationId: persistenceInput.projection.organizationId,
          vehicleId: persistenceInput.projection.vehicleId,
          segmentFingerprint: persistenceInput.projection.segmentFingerprint,
          evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
          sourceRevisionFingerprint: persistenceInput.sourceRevisionFingerprint,
        },
    },
  });

  if (!revision) {
    return blocked(
      'BLOCKED_CURRENT_REVISION_MISSING',
      M3_3_HV_H4_A3_RETENTION_GATE_REASON.CURRENT_SOURCE_REVISION_NOT_DURABLY_ACKED,
    );
  }

  if (revision.evidenceContractVersion !== M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1) {
    return blocked(
      'BLOCKED_CONTRACT_VERSION',
      M3_3_HV_H4_A3_RETENTION_GATE_REASON.CURRENT_SOURCE_REVISION_NOT_DURABLY_ACKED,
    );
  }

  try {
    assertStoredEvidenceRevisionMatchesPersistenceInputV1(revision, persistenceInput);
  } catch (error) {
    return mapIntegrityError(error);
  }

  const ack = await input.db.batteryHvChargeSessionEvidenceAck.findUnique({
    where: {
      organizationId_vehicleId_segmentFingerprint_evidenceContractVersion_sourceRevisionFingerprint_durabilityAckContractVersion:
        {
          organizationId: revision.organizationId,
          vehicleId: revision.vehicleId,
          segmentFingerprint: revision.segmentFingerprint,
          evidenceContractVersion: revision.evidenceContractVersion,
          sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
    },
  });

  if (!ack) {
    return blocked(
      'BLOCKED_ACK_MISSING',
      M3_3_HV_H4_A3_RETENTION_GATE_REASON.CURRENT_SOURCE_REVISION_NOT_DURABLY_ACKED,
    );
  }

  try {
    assertAckMirrorsRevisionV1(ack, revision);
  } catch (error) {
    return mapIntegrityError(error);
  }

  return { kind: 'DRY_RUN_ELIGIBLE' };
}

async function lockHvChargeSessionForUpdateV1(
  db: Prisma.TransactionClient,
  sessionId: string,
): Promise<HvChargeSession | null> {
  const locked = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM hv_charge_sessions WHERE id = ${sessionId} FOR UPDATE
  `;
  if (locked.length === 0) return null;
  return db.hvChargeSession.findUniqueOrThrow({ where: { id: sessionId } });
}

export async function deleteHvChargeSessionIfDurablyAcknowledgedV1(input: {
  db: Prisma.TransactionClient;
  sessionId: string;
  retentionCutoff: Date;
}): Promise<M3_3HvH4A3RetentionGateOutcomeV1> {
  const session = await lockHvChargeSessionForUpdateV1(input.db, input.sessionId);
  if (!session) {
    return { kind: 'ALREADY_GONE' };
  }

  const evaluation = await evaluateCurrentHvChargeSessionPruneDurabilityV1({
    db: input.db,
    session,
    retentionCutoff: input.retentionCutoff,
  });

  if (evaluation.kind !== 'DRY_RUN_ELIGIBLE') {
    return evaluation.kind === 'BLOCKED'
      ? evaluation
      : { kind: evaluation.kind as 'ALREADY_GONE' };
  }

  await input.db.hvChargeSession.delete({ where: { id: session.id } });
  return { kind: 'DELETED' };
}
