import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import {
  insertCoherentRevisionWithAckO2R1,
  insertIntegrityAttestationRowForTestO2R1,
} from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import { verifyDurableEvidenceRevisionForModeALoaderV1 } from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

describe('M3.3-HV-H4-A3.3-O2-R1 integrity attestation foundation', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
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
      `REVOKE INSERT, UPDATE, DELETE ON public.battery_hv_charge_session_evidence_integrity_attestations FROM m3_3_hv_h4_a3_r1_app`,
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

  it('R1-C2 corrupt fingerprint rejected by TS verifier', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ack } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    const corrupt = await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { sourceRevisionFingerprint: 'a'.repeat(64) },
    });
    expect(() =>
      verifyDurableEvidenceRevisionForModeALoaderV1({ revision: corrupt, ack: ack! }),
    ).toThrow();
  });

  it('R1-C4 missing ACK rejected by TS verifier', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection, false);
    expect(() => verifyDurableEvidenceRevisionForModeALoaderV1({ revision, ack: null })).toThrow();
  });

  it('R1-C6 revision UPDATE invalidates attestation', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);
    await prisma.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { qualityStatus: 'TOUCHED' },
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C7 ACK UPDATE invalidates attestation', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);
    await prisma.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackId! },
      data: { acknowledgedAt: new Date() },
    });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C8 revision DELETE cascades', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);
    await prisma.batteryHvChargeSessionEvidenceRevision.delete({ where: { id: revision.id } });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C9 ACK DELETE cascades', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);
    await prisma.batteryHvChargeSessionEvidenceAck.delete({ where: { id: ackId! } });
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C10 org/vehicle cascade', async () => {
    if (!prisma) return;
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId,
        vehicleId,
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
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, sci, true, {
      organizationId,
      vehicleId,
      sourceHvChargeSessionId: session.id,
    });
    await insertIntegrityAttestationRowForTestO2R1(prisma, revision, ackId!);
    await prisma.$executeRaw`
      DELETE FROM public.vehicles
      WHERE id = ${vehicleId}::text
    `;
    expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R1-C13 cross-revision ACK binding rejected at TS verifier', async () => {
    if (!prisma) return;
    const v0 = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const v1 = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[1];
    const { revision: revA } = await insertCoherentRevisionWithAckO2R1(prisma, v0.projection);
    const { ackId: ackB } = await insertCoherentRevisionWithAckO2R1(prisma, v1.projection);
    await prisma.batteryHvChargeSessionEvidenceAck.deleteMany({ where: { revisionId: revA.id } });
    const rebound = await prisma.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackB! },
      data: { revisionId: revA.id },
    });
    expect(() =>
      verifyDurableEvidenceRevisionForModeALoaderV1({ revision: revA, ack: rebound }),
    ).toThrow();
  });

  it('R1-C16 direct unauthorized insert rejected', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    const attestationId = randomUUID();
    await expect(
      prisma.$executeRawUnsafe(`
        SET LOCAL ROLE m3_3_hv_h4_a3_r1_app;
        INSERT INTO public.battery_hv_charge_session_evidence_integrity_attestations (
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
