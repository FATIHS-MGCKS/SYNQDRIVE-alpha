import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { verifyDurableEvidenceRevisionForModeALoaderV1 } from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';
import type { M3_3HvH4A3IntegrityAttestationIssuerDbV1 } from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.types.v1';

export class M3_3HvH4A3IntegrityAttestationIssueVerificationError extends Error {
  readonly code = 'M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUE_VERIFY_FAILED';
}

export class M3_3HvH4A3IntegrityAttestationIssuePermissionError extends Error {
  readonly code = 'M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUE_PERMISSION_DENIED';
}

export type M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1 = {
  revisionId: string;
  attestedAt?: Date;
};

/**
 * Isolated trusted issuer — normative TS verifier only; INSERT on issuer-bound DB session.
 * NOT wired to Nest runtime; production certification requires role topology proof.
 */
/** Shared issuance steps — same transaction as production issuer (used by concurrency harness). */
export async function issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1(
  tx: Prisma.TransactionClient,
  input: M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1,
  hooks?: { afterRowLocksAcquired?: () => Promise<void> },
): Promise<{ attestationId: string }> {
  const attestedAt = input.attestedAt ?? new Date();

  await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(${input.revisionId}::text) AS ok
  `;

  if (hooks?.afterRowLocksAcquired) {
    await hooks.afterRowLocksAcquired();
  }

  const revision = await tx.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
    where: { id: input.revisionId },
  });
  const ack = await tx.batteryHvChargeSessionEvidenceAck.findFirst({
    where: { revisionId: input.revisionId },
  });

  try {
    verifyDurableEvidenceRevisionForModeALoaderV1({ revision, ack });
  } catch (cause) {
    throw new M3_3HvH4A3IntegrityAttestationIssueVerificationError(
      cause instanceof Error ? cause.message : 'verify failed',
    );
  }

  const attestationId = randomUUID();
  await tx.batteryHvChargeSessionEvidenceIntegrityAttestation.create({
    data: {
      id: attestationId,
      revisionId: revision.id,
      durabilityAckId: ack!.id,
      organizationId: revision.organizationId,
      vehicleId: revision.vehicleId,
      segmentFingerprint: revision.segmentFingerprint,
      evidenceContractVersion: revision.evidenceContractVersion,
      sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
      durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
      integrityAttestationContractVersion: M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
      attestedAt,
    },
  });

  return { attestationId };
}

export async function issueM3_3HvH4A3IntegrityAttestationIsolatedV1(
  issuerDb: M3_3HvH4A3IntegrityAttestationIssuerDbV1,
  input: M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1,
): Promise<{ attestationId: string }> {
  try {
    return await issuerDb.$transaction(async (tx) =>
      issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1(tx, input),
    );
  } catch (error) {
    if (error instanceof M3_3HvH4A3IntegrityAttestationIssueVerificationError) {
      throw error;
    }
    if (error instanceof M3_3HvH4A3IntegrityAttestationIssuePermissionError) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const msg = error.message.toLowerCase();
      if (error.code === 'P2010' || error.code === 'P2004' || msg.includes('permission denied')) {
        throw new M3_3HvH4A3IntegrityAttestationIssuePermissionError(error.message);
      }
    }
    throw error;
  }
}
