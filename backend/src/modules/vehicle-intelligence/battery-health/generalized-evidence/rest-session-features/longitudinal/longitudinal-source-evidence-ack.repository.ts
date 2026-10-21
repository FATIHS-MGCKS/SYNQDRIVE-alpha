import { randomUUID } from 'crypto';
import type { BatteryLongitudinalSourceEvidenceAck } from '@prisma/client';
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

export type LongitudinalSourceEvidenceAckLookup = {
  organizationId: string;
  vehicleId: string;
  sourceEvidenceFingerprint: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
};

export type LongitudinalSourceEvidenceAckRepositoryDb = Pick<
  PrismaService,
  'batteryLongitudinalSourceEvidenceAck' | '$queryRaw'
>;

export class LongitudinalSourceEvidenceAckRepository {
  constructor(private readonly db: LongitudinalSourceEvidenceAckRepositoryDb) {}

  async isSourceEvidenceAcknowledged(
    input: LongitudinalSourceEvidenceAckLookup,
  ): Promise<boolean> {
    const row = await this.db.batteryLongitudinalSourceEvidenceAck.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sourceEvidenceFingerprint: input.sourceEvidenceFingerprint,
        longitudinalProfileContractVersion: input.longitudinalProfileContractVersion,
        profilePolicyVersion: input.profilePolicyVersion,
      },
      select: { id: true },
    });
    return row != null;
  }

  async listAcknowledgementsForRevision(
    revisionId: string,
  ): Promise<BatteryLongitudinalSourceEvidenceAck[]> {
    return this.db.batteryLongitudinalSourceEvidenceAck.findMany({
      where: { revisionId },
      orderBy: { acknowledgedAt: 'asc' },
    });
  }

  /** Idempotent append — duplicate target-version fingerprint ack is safe. */
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
      ON CONFLICT (
        organization_id,
        vehicle_id,
        source_evidence_fingerprint,
        longitudinal_profile_contract_version,
        profile_policy_version
      )
      DO NOTHING
      RETURNING id
    `;
    return inserted.length > 0 ? 'CREATED' : 'EXISTING';
  }
}
