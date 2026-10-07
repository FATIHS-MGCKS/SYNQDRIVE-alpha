import { randomUUID } from 'crypto';
import type { BatteryHvChargeSessionEvidenceAck, BatteryHvChargeSessionEvidenceRevision, Prisma, PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import { mirrorFromScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';

export async function insertCoherentRevisionWithAckO2R1(
  prisma: PrismaClient,
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  withAck = true,
  tenant?: {
    organizationId: string;
    vehicleId: string;
    sourceHvChargeSessionId: string;
  },
) {
  let organizationId: string;
  let vehicleId: string;
  let sourceHvChargeSessionId: string;
  if (tenant) {
    ({ organizationId, vehicleId, sourceHvChargeSessionId } = tenant);
  } else {
    const created = await createGtOrgVehicle(prisma);
    organizationId = created.organizationId;
    vehicleId = created.vehicleId;
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId,
        vehicleId,
        segmentFingerprint: projection.segmentFingerprint,
        dimoSegmentId: projection.dimoSegmentId ?? `dimo-${randomUUID()}`,
        source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
        startAt: new Date(projection.startAt),
        endAt: projection.endAt ? new Date(projection.endAt) : null,
        energyAddedKwh:
          projection.energyAddedKwh.kind === 'FINITE' ? projection.energyAddedKwh.value : null,
        isOngoing: projection.isOngoing,
        idempotencyKey: `idem-${randomUUID()}`,
      },
    });
    sourceHvChargeSessionId = session.id;
  }
  const scopedProjection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 = {
    ...projection,
    organizationId,
    vehicleId,
    sourceHvChargeSessionId,
  };
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(scopedProjection);
  const mirror = mirrorFromScientificProjectionV1(scopedProjection);
  const revision = await prisma.batteryHvChargeSessionEvidenceRevision.create({
    data: {
      organizationId: mirror.organizationId,
      vehicleId: mirror.vehicleId,
      sourceHvChargeSessionId: mirror.sourceHvChargeSessionId,
      segmentFingerprint: mirror.segmentFingerprint,
      evidenceContractVersion: scopedProjection.evidenceContractVersion,
      sourceRevisionFingerprint,
      scientificEvidenceJson: scopedProjection as unknown as Prisma.InputJsonValue,
      dimoSegmentId: mirror.dimoSegmentId,
      providerSegmentId: mirror.providerSegmentId,
      source: mirror.source,
      startAt: mirror.startAt,
      endAt: mirror.endAt,
      isOngoing: mirror.isOngoing,
      energyAddedKwh: mirror.energyAddedKwh,
      providerObservedAt: mirror.providerObservedAt,
      addedEnergyProvenance: mirror.addedEnergyProvenance,
      qualityStatus: mirror.qualityStatus,
      supersededBySegmentFingerprint: mirror.supersededBySegmentFingerprint,
      startedBeforeRange: mirror.startedBeforeRange,
      sourceCreatedAt: mirror.sourceCreatedAt,
      sourceReceivedAt: mirror.sourceReceivedAt,
      sourceUpdatedAt: mirror.sourceUpdatedAt,
    },
  });
  let ack: BatteryHvChargeSessionEvidenceAck | null = null;
  if (withAck) {
    ack = await prisma.batteryHvChargeSessionEvidenceAck.create({
      data: {
        organizationId: revision.organizationId,
        vehicleId: revision.vehicleId,
        segmentFingerprint: revision.segmentFingerprint,
        evidenceContractVersion: revision.evidenceContractVersion,
        sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
        revisionId: revision.id,
        durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
      },
    });
  }
  return { revision, ackId: ack?.id ?? null, ack };
}

/** Test-only attestation row insert (CI migration role). Production issuance is deferred. */
export async function insertIntegrityAttestationRowForTestO2R1(
  prisma: PrismaClient,
  revision: BatteryHvChargeSessionEvidenceRevision,
  durabilityAckId: string,
) {
  const now = new Date();
  return prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.create({
    data: {
      revisionId: revision.id,
      durabilityAckId,
      organizationId: revision.organizationId,
      vehicleId: revision.vehicleId,
      segmentFingerprint: revision.segmentFingerprint,
      evidenceContractVersion: revision.evidenceContractVersion,
      sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
      durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
      integrityAttestationContractVersion: M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
      attestedAt: now,
    },
  });
}
