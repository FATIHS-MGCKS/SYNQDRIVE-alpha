import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export type LongitudinalSourceEvidenceAckInput = {
  organizationId: string;
  vehicleId: string;
  sourceEvidenceFingerprint: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
  canonicalProfileFingerprint: string;
  revisionId: string;
  materializationOutcome: 'CREATED' | 'EXISTING';
};

export type LongitudinalSourceEvidenceAckRepositoryDb = Pick<
  PrismaService,
  'batteryLongitudinalSourceEvidenceAck' | '$queryRaw'
>;

export class LongitudinalSourceEvidenceAckRepository {
  constructor(private readonly db: LongitudinalSourceEvidenceAckRepositoryDb) {}

  async isSourceEvidenceAcknowledged(input: {
    organizationId: string;
    vehicleId: string;
    sourceEvidenceFingerprint: string;
  }): Promise<boolean> {
    const row = await this.db.batteryLongitudinalSourceEvidenceAck.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sourceEvidenceFingerprint: input.sourceEvidenceFingerprint,
      },
      select: { id: true },
    });
    return row != null;
  }

  /** Idempotent append — duplicate fingerprint ack is safe. */
  async acknowledgeSourceEvidence(
    input: LongitudinalSourceEvidenceAckInput,
  ): Promise<'CREATED' | 'EXISTING'> {
    const id = randomUUID();
    const inserted = await this.db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO battery_longitudinal_source_evidence_acks (
        id,
        organization_id,
        vehicle_id,
        source_evidence_fingerprint,
        longitudinal_profile_contract_version,
        profile_policy_version,
        canonical_profile_fingerprint,
        revision_id,
        materialization_outcome
      ) VALUES (
        ${id},
        ${input.organizationId},
        ${input.vehicleId},
        ${input.sourceEvidenceFingerprint},
        ${input.longitudinalProfileContractVersion},
        ${input.profilePolicyVersion},
        ${input.canonicalProfileFingerprint},
        ${input.revisionId},
        ${input.materializationOutcome}
      )
      ON CONFLICT (organization_id, vehicle_id, source_evidence_fingerprint)
      DO NOTHING
      RETURNING id
    `;
    return inserted.length > 0 ? 'CREATED' : 'EXISTING';
  }
}
