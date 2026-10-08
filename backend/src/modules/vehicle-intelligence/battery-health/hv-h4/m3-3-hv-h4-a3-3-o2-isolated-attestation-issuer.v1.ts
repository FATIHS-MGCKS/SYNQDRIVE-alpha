import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { verifyDurableEvidenceRevisionForModeALoaderV1 } from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';
import { M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE } from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

export class M3_3HvH4A3IntegrityAttestationIssueVerificationError extends Error {
  readonly code = 'M3_3_HV_H4_A3_INTEGRITY_ATTESTATION_ISSUE_VERIFY_FAILED';
}

export type M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1 = {
  revisionId: string;
  attestedAt?: Date;
  /** When set, INSERT runs under SET LOCAL ROLE (CI role-isolation proof). */
  trustedIssuerPostgresRole?: string;
};

/**
 * Isolated trusted issuer prototype — uses normative TS verifier only.
 * NOT wired to Nest runtime; production certification requires role topology proof.
 */
export async function issueM3_3HvH4A3IntegrityAttestationIsolatedV1(
  prisma: PrismaClient,
  input: M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1,
): Promise<{ attestationId: string }> {
  const attestedAt = input.attestedAt ?? new Date();
  const issuerRole = input.trustedIssuerPostgresRole ?? M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1
      FROM public.battery_hv_charge_session_evidence_revisions
      WHERE id = ${input.revisionId}::text
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT 1
      FROM public.battery_hv_charge_session_evidence_acks
      WHERE revision_id = ${input.revisionId}::text
      FOR UPDATE
    `;

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

    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${issuerRole}`);
    try {
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
    } finally {
      await tx.$executeRawUnsafe(`RESET ROLE`);
    }

    return { attestationId };
  });
}
