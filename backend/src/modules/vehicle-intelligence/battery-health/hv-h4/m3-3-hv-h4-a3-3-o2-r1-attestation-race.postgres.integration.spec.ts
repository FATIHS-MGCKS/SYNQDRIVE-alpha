import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import {
  M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_CONTRACT_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

const HOLD_MS = 400;

function rowLockGate(): { waitUntilLocked: Promise<void>; notifyLocked: () => void } {
  let notifyLocked!: () => void;
  const waitUntilLocked = new Promise<void>((resolve) => {
    notifyLocked = resolve;
  });
  return { waitUntilLocked, notifyLocked };
}

describe('M3.3-HV-H4-A3.3-O2-R1 attestation invalidation races (issuance deferred)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    prisma = new PrismaClient();
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

  it('R1-C11 revision mutation vs attestation insert race', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    if (!ackId) throw new Error('missing ack');

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    const { waitUntilLocked, notifyLocked } = rowLockGate();
    try {
      const insertHeld = clientA.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT 1
          FROM public.battery_hv_charge_session_evidence_revisions
          WHERE id = ${revision.id}::text
          FOR UPDATE
        `;
        notifyLocked();
        const now = new Date();
        await tx.batteryHvChargeSessionEvidenceIntegrityAttestation.create({
          data: {
            revisionId: revision.id,
            durabilityAckId: ackId,
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
        await new Promise((r) => setTimeout(r, HOLD_MS));
      });

      const updateRace = (async () => {
        await waitUntilLocked;
        await clientB.batteryHvChargeSessionEvidenceRevision.update({
          where: { id: revision.id },
          data: { qualityStatus: 'RACE_TOUCH' },
        });
      })();

      await Promise.all([insertHeld, updateRace]);
      expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
    } finally {
      await clientA.$disconnect().catch(() => undefined);
      await clientB.$disconnect().catch(() => undefined);
    }
  });

  it('R1-C12 ACK mutation vs attestation insert race', async () => {
    if (!prisma) return;
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(prisma, vector.projection);
    if (!ackId) throw new Error('missing ack');

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    const { waitUntilLocked, notifyLocked } = rowLockGate();
    try {
      const insertHeld = clientA.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT 1
          FROM public.battery_hv_charge_session_evidence_acks
          WHERE id = ${ackId}::text
          FOR UPDATE
        `;
        notifyLocked();
        const now = new Date();
        await tx.batteryHvChargeSessionEvidenceIntegrityAttestation.create({
          data: {
            revisionId: revision.id,
            durabilityAckId: ackId,
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
        await new Promise((r) => setTimeout(r, HOLD_MS));
      });

      const ackUpdate = (async () => {
        await waitUntilLocked;
        await clientB.batteryHvChargeSessionEvidenceAck.update({
          where: { id: ackId },
          data: { acknowledgedAt: new Date() },
        });
      })();

      await Promise.all([insertHeld, ackUpdate]);
      expect(await prisma.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
    } finally {
      await clientA.$disconnect().catch(() => undefined);
      await clientB.$disconnect().catch(() => undefined);
    }
  });
});
