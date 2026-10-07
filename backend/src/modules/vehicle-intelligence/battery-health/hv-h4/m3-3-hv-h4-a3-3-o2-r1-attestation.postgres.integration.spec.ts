import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

async function insertCoherentRevisionWithAck(
  prisma: PrismaClient,
  projection: M3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  withAck = true,
) {
  const sourceRevisionFingerprint =
    computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
  const mirror = mirrorFromScientificProjectionV1(projection);
  const revision = await prisma.batteryHvChargeSessionEvidenceRevision.create({
    data: {
      organizationId: mirror.organizationId,
      vehicleId: mirror.vehicleId,
      sourceHvChargeSessionId: mirror.sourceHvChargeSessionId,
      segmentFingerprint: mirror.segmentFingerprint,
      evidenceContractVersion: projection.evidenceContractVersion,
      sourceRevisionFingerprint,
      scientificEvidenceJson: projection as unknown as Prisma.InputJsonValue,
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
  let ackId: string | null = null;
  if (withAck) {
    const ack = await prisma.batteryHvChargeSessionEvidenceAck.create({
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
    ackId = ack.id;
  }
  return { revision, ackId };
}

async function issueAttestationSql(prisma: PrismaClient, revisionId: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT m3_3_hv_h4_a3_issue_integrity_attestation_v1(
      ${revisionId}::uuid,
      ${M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1}
    ) AS id`;
  return rows[0].id;
}

describe('M3.3-HV-H4-A3.3-O2-R1 integrity attestation foundation', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe.ok) return;
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE ROLE m3_3_hv_h4_a3_r1_app NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO m3_3_hv_h4_a3_r1_app`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO m3_3_hv_h4_a3_r1_app`,
    );
    await prisma.$executeRawUnsafe(
      `REVOKE INSERT, UPDATE, DELETE ON battery_hv_charge_session_evidence_integrity_attestations FROM m3_3_hv_h4_a3_r1_app`,
    );
    await prisma.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION m3_3_hv_h4_a3_issue_integrity_attestation_v1(uuid, text) TO m3_3_hv_h4_a3_r1_app`,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    if (!prisma) return;
    await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.deleteMany();
    await prisma.batteryHvChargeSessionEvidenceAck.deleteMany();
    await prisma.batteryHvChargeSessionEvidenceRevision.deleteMany();
  });

  it('R1-C1 valid issuance', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    const attestationId = await issueAttestationSql(prisma, revision.id);
    const row = await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.findUniqueOrThrow({
      where: { id: attestationId },
    });
    expect(row.revisionId).toBe(revision.id);
  });

  it('R1-C2 corrupt JSON rejected', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { sourceRevisionFingerprint: 'a'.repeat(64) },
    });
    await expect(issueAttestationSql(prisma, revision.id)).rejects.toThrow();
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C3 mirror drift rejected', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { energyAddedKwh: 999 },
    });
    await expect(issueAttestationSql(prisma, revision.id)).rejects.toThrow();
  });

  it('R1-C4 missing ACK rejected', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection, false);
    await expect(issueAttestationSql(prisma, revision.id)).rejects.toThrow();
  });

  it('R1-C5 ACK mismatch rejected', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await prisma.batteryHvChargeSessionEvidenceAck.updateMany({
      data: { segmentFingerprint: 'wrong-fp' },
    });
    await expect(issueAttestationSql(prisma, revision.id)).rejects.toThrow();
  });

  it('R1-C6 revision UPDATE invalidates attestation', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await issueAttestationSql(prisma, revision.id);
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { qualityStatus: 'TOUCHED' },
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C7 ACK UPDATE invalidates attestation', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await issueAttestationSql(prisma, revision.id);
    await prisma.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackId! },
      data: { acknowledgedAt: new Date() },
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C8 revision DELETE cascades', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await issueAttestationSql(prisma, revision.id);
    await prisma.batteryHvChargeSessionEvidenceRevision.delete({ where: { id: revision.id } });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C9 ACK DELETE cascades', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    await issueAttestationSql(prisma, revision.id);
    await prisma.batteryHvChargeSessionEvidenceAck.delete({ where: { id: ackId! } });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C10 org/vehicle cascade', async () => {
    if (!prisma) return;
    const { organization, vehicle } = await createGtOrgVehicle(prisma);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: organization.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${randomUUID()}`,
        dimoSegmentId: `dimo-${randomUUID()}`,
        source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
        startAt: new Date('2026-05-01T08:00:00.000Z'),
        endAt: new Date('2026-05-01T10:00:00.000Z'),
        energyAddedKwh: 10,
        isOngoing: false,
        idempotencyKey: `idem-${randomUUID()}`,
      },
    });
    const sci = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
    const { revision } = await insertCoherentRevisionWithAck(prisma, sci);
    await issueAttestationSql(prisma, revision.id);
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C14 idempotent issuance', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    const a1 = await issueAttestationSql(prisma, revision.id);
    const a2 = await issueAttestationSql(prisma, revision.id);
    expect(a1).toBe(a2);
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('R1-C16 direct unauthorized insert rejected', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAck(prisma, vector.projection);
    const attestationId = randomUUID();
    await expect(
      prisma.$executeRawUnsafe(`
        SET LOCAL ROLE m3_3_hv_h4_a3_r1_app;
        INSERT INTO battery_hv_charge_session_evidence_integrity_attestations (
          id, revision_id, durability_ack_id, organization_id, vehicle_id, segment_fingerprint,
          evidence_contract_version, source_revision_fingerprint, durability_ack_contract_version,
          integrity_attestation_contract_version, attested_at, created_at
        ) VALUES (
          '${attestationId}', '${revision.id}', '${ackId}', '${revision.organizationId}', '${revision.vehicleId}',
          '${revision.segmentFingerprint}', '${revision.evidenceContractVersion}', '${revision.sourceRevisionFingerprint}',
          '${M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1}', '${M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1}',
          NOW(), NOW()
        );
      `),
    ).rejects.toThrow();
  });
});
