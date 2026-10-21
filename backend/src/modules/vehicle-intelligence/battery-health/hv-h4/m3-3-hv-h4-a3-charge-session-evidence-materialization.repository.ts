import { randomUUID } from 'crypto';
import {
  Prisma,
  type BatteryHvChargeSessionEvidenceAck,
  type BatteryHvChargeSessionEvidenceRevision,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1,
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  H4EvidenceAckIdempotencyConflictRowNotFoundError,
  H4EvidenceRevisionIdempotencyConflictRowNotFoundError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import {
  assertAckMirrorsRevisionV1,
  assertStoredEvidenceRevisionMatchesPersistenceInputV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.persistence.verify.v1';
import type {
  M3_3HvH4ChargeSessionEvidencePersistOutcomeV1,
  M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
  M3_3HvH4ChargeSessionEvidenceScientificIdentityV1,
} from './m3-3-hv-h4-a3-charge-session-evidence.persistence.types.v1';

export type M3_3HvH4ChargeSessionEvidenceMaterializationRepositoryDb = Pick<
  PrismaService,
  | 'batteryHvChargeSessionEvidenceRevision'
  | 'batteryHvChargeSessionEvidenceAck'
  | '$transaction'
  | '$queryRaw'
>;

function scientificIdentityFromInput(
  input: M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
): M3_3HvH4ChargeSessionEvidenceScientificIdentityV1 {
  return {
    organizationId: input.projection.organizationId,
    vehicleId: input.projection.vehicleId,
    segmentFingerprint: input.projection.segmentFingerprint,
    evidenceContractVersion: input.projection.evidenceContractVersion,
    sourceRevisionFingerprint: input.sourceRevisionFingerprint,
  };
}

function assertIncomingFingerprintMatchesProjection(
  input: M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
): string {
  const recomputed = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(input.projection);
  if (recomputed !== input.sourceRevisionFingerprint) {
    throw new H4EvidenceRevisionStoredFingerprintMismatchError(
      'Incoming sourceRevisionFingerprint does not match scientific projection',
    );
  }
  return buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(input.projection);
}

async function findRevisionByScientificIdentity(
  tx: Pick<
    PrismaService,
    'batteryHvChargeSessionEvidenceRevision'
  >,
  identity: M3_3HvH4ChargeSessionEvidenceScientificIdentityV1,
): Promise<BatteryHvChargeSessionEvidenceRevision | null> {
  return tx.batteryHvChargeSessionEvidenceRevision.findFirst({
    where: {
      organizationId: identity.organizationId,
      vehicleId: identity.vehicleId,
      segmentFingerprint: identity.segmentFingerprint,
      evidenceContractVersion: identity.evidenceContractVersion,
      sourceRevisionFingerprint: identity.sourceRevisionFingerprint,
    },
  });
}

async function ensureDurabilityAckV1(
  tx: Pick<
    PrismaService,
    'batteryHvChargeSessionEvidenceAck' | '$queryRaw'
  >,
  revision: BatteryHvChargeSessionEvidenceRevision,
): Promise<BatteryHvChargeSessionEvidenceAck> {
  const existingForRevision = await tx.batteryHvChargeSessionEvidenceAck.findFirst({
    where: { revisionId: revision.id },
  });
  if (existingForRevision) {
    assertAckMirrorsRevisionV1(existingForRevision, revision);
    return existingForRevision;
  }

  const ackId = randomUUID();
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO battery_hv_charge_session_evidence_acks (
      id,
      organization_id,
      vehicle_id,
      segment_fingerprint,
      evidence_contract_version,
      source_revision_fingerprint,
      revision_id,
      durability_ack_contract_version
    ) VALUES (
      ${ackId},
      ${revision.organizationId},
      ${revision.vehicleId},
      ${revision.segmentFingerprint},
      ${revision.evidenceContractVersion},
      ${revision.sourceRevisionFingerprint},
      ${revision.id},
      ${M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1}
    )
    ON CONFLICT (
      organization_id,
      vehicle_id,
      segment_fingerprint,
      evidence_contract_version,
      source_revision_fingerprint,
      durability_ack_contract_version
    )
    DO NOTHING
    RETURNING id
  `;

  if (inserted.length > 0) {
    const ack = await tx.batteryHvChargeSessionEvidenceAck.findUniqueOrThrow({
      where: { id: inserted[0].id },
    });
    assertAckMirrorsRevisionV1(ack, revision);
    return ack;
  }

  const existing = await tx.batteryHvChargeSessionEvidenceAck.findFirst({
    where: {
      organizationId: revision.organizationId,
      vehicleId: revision.vehicleId,
      segmentFingerprint: revision.segmentFingerprint,
      evidenceContractVersion: revision.evidenceContractVersion,
      sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
      durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
    },
  });

  if (!existing) {
    throw new H4EvidenceAckIdempotencyConflictRowNotFoundError();
  }

  assertAckMirrorsRevisionV1(existing, revision);
  return existing;
}

export class M3_3HvH4ChargeSessionEvidenceMaterializationRepository {
  constructor(private readonly db: M3_3HvH4ChargeSessionEvidenceMaterializationRepositoryDb) {}

  async persistIdempotent(
    input: M3_3HvH4ChargeSessionEvidencePersistenceInputV1,
  ): Promise<M3_3HvH4ChargeSessionEvidencePersistOutcomeV1> {
    assertIncomingFingerprintMatchesProjection(input);
    const identity = scientificIdentityFromInput(input);
    const mirror = input.mirror;

    return this.db.$transaction(
      async (tx) => {
        const revisionId = randomUUID();
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO battery_hv_charge_session_evidence_revisions (
            id,
            organization_id,
            vehicle_id,
            source_hv_charge_session_id,
            segment_fingerprint,
            evidence_contract_version,
            source_revision_fingerprint,
            scientific_evidence_json,
            dimo_segment_id,
            provider_segment_id,
            source,
            start_at,
            end_at,
            is_ongoing,
            energy_added_kwh,
            provider_observed_at,
            added_energy_provenance,
            quality_status,
            superseded_by_segment_fingerprint,
            started_before_range,
            source_created_at,
            source_received_at,
            source_updated_at
          ) VALUES (
            ${revisionId},
            ${input.projection.organizationId},
            ${input.projection.vehicleId},
            ${input.projection.sourceHvChargeSessionId},
            ${input.projection.segmentFingerprint},
            ${input.projection.evidenceContractVersion},
            ${input.sourceRevisionFingerprint},
            ${input.projection as unknown as Prisma.InputJsonValue},
            ${mirror.dimoSegmentId},
            ${mirror.providerSegmentId},
            ${mirror.source},
            ${mirror.startAt},
            ${mirror.endAt},
            ${mirror.isOngoing},
            ${mirror.energyAddedKwh},
            ${mirror.providerObservedAt},
            ${mirror.addedEnergyProvenance},
            ${mirror.qualityStatus},
            ${mirror.supersededBySegmentFingerprint},
            ${mirror.startedBeforeRange},
            ${mirror.sourceCreatedAt},
            ${mirror.sourceReceivedAt},
            ${mirror.sourceUpdatedAt}
          )
          ON CONFLICT (
            organization_id,
            vehicle_id,
            segment_fingerprint,
            evidence_contract_version,
            source_revision_fingerprint
          )
          DO NOTHING
          RETURNING id
        `;

        if (inserted.length > 0) {
          const revision = await tx.batteryHvChargeSessionEvidenceRevision.findUniqueOrThrow({
            where: { id: inserted[0].id },
          });
          assertStoredEvidenceRevisionMatchesPersistenceInputV1(revision, input);
          const ack = await ensureDurabilityAckV1(tx, revision);
          return { persistenceOutcome: 'CREATED', revision, ack };
        }

        const existing = await findRevisionByScientificIdentity(tx, identity);
        if (!existing) {
          throw new H4EvidenceRevisionIdempotencyConflictRowNotFoundError();
        }

        assertStoredEvidenceRevisionMatchesPersistenceInputV1(existing, input);
        const ack = await ensureDurabilityAckV1(tx, existing);
        return { persistenceOutcome: 'ALREADY_EXISTS', revision: existing, ack };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
