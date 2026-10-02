import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  H4EvidenceEffectiveRevisionAmbiguityError,
  H4EvidenceRevisionMissingDurabilityAckError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { createM3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import {
  runM3_3HvH4DurableModeAA2ReportBundleV1,
  runM3_3HvH4LiveDurableModeAParityV1,
} from './m3-3-hv-h4-a3-parity.harness.v1';
import { classifyM3_3HvH4ChargeSessionA2Contribution } from './m3-3-hv-h4-charge-throughput-session.v1';
import { resolveM3_3HvH4ReplacementBoundaries } from './m3-3-hv-h4-lifecycle.util';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const EVAL = new Date('2026-09-01T00:00:00.000Z');

async function createNativeSession(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    id?: string;
    segmentFingerprint?: string;
    startAt?: Date;
    endAt?: Date;
    energyAddedKwh?: number;
    providerSegmentId?: string;
    createdAt?: Date;
    receivedAt?: Date;
    updatedAt?: Date;
    metadata?: Record<string, unknown>;
  },
) {
  const startAt = input.startAt ?? new Date('2026-05-01T08:00:00.000Z');
  const endAt = input.endAt ?? new Date('2026-05-01T10:00:00.000Z');
  const anchor = input.updatedAt ?? input.createdAt ?? endAt;
  return prisma.hvChargeSession.create({
    data: {
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segmentFingerprint: input.segmentFingerprint ?? `fp-${randomUUID()}`,
      dimoSegmentId: `dimo-${randomUUID()}`,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt,
      endAt,
      energyAddedKwh: input.energyAddedKwh ?? 12,
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: input.createdAt ?? anchor,
      receivedAt: input.receivedAt ?? anchor,
      updatedAt: input.updatedAt ?? anchor,
      providerObservedAt: endAt,
      metadata: {
        providerSegmentId: input.providerSegmentId ?? `prov-${randomUUID()}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
        ...(input.metadata ?? {}),
      },
    },
  });
}

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3 durable MODE_A loader postgres parity',
  () => {
    let prisma: PrismaClient;
    let writer: ReturnType<typeof createM3_3HvH4ChargeSessionEvidenceWriterService>;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
      writer = createM3_3HvH4ChargeSessionEvidenceWriterService(prisma);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('A) LIVE === DURABLE MODE_A and raw-delete durable unchanged', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const s1 = await createNativeSession(prisma, { organizationId, vehicleId });
      const s2 = await createNativeSession(prisma, { organizationId, vehicleId });
      await writer.persistFromHvChargeSession(s1);
      await writer.persistFromHvChargeSession(s2);

      const input = { organizationId, vehicleId, evaluationAt: EVAL };
      await runM3_3HvH4LiveDurableModeAParityV1(prisma, input, EVAL);

      const durableBeforeDelete = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        input,
        EVAL,
      );
      await prisma.hvChargeSession.deleteMany({ where: { organizationId, vehicleId } });
      const durableAfterDelete = await runM3_3HvH4DurableModeAA2ReportBundleV1(
        prisma,
        input,
        EVAL,
      );
      expect(durableAfterDelete.throughput).toEqual(durableBeforeDelete.throughput);
      expect(durableAfterDelete.coverage).toEqual(durableBeforeDelete.coverage);
      expect(durableAfterDelete.loadedData.chargeSessionSourceLoad).toEqual(
        durableBeforeDelete.loadedData.chargeSessionSourceLoad,
      );
    });

    it('B/C/D) late created/received/updated sessions stay in population with knowledge exclusion', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const lateCreated = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      });
      await writer.persistFromHvChargeSession(lateCreated);
      const input = { organizationId, vehicleId };
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(prisma, input, EVAL);
      expect(bundle.live.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
      const boundaries = resolveM3_3HvH4ReplacementBoundaries(
        bundle.live.loadedData.groundTruthEvents,
        EVAL,
      );
      const cls = classifyM3_3HvH4ChargeSessionA2Contribution({
        session: bundle.live.loadedData.chargeSessions[0]!,
        replacementBoundaries: boundaries,
        expectedOrganizationId: organizationId,
        expectedVehicleId: vehicleId,
        evaluationAt: EVAL,
      });
      expect(cls.eligibility).toBe('INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION');
    });

    it('H) overlapping eligible native sessions parity', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const start = new Date('2026-05-01T08:00:00.000Z');
      const end1 = new Date('2026-05-01T12:00:00.000Z');
      const end2 = new Date('2026-05-01T14:00:00.000Z');
      const s1 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: start,
        endAt: end1,
      });
      const s2 = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        startAt: new Date('2026-05-01T10:00:00.000Z'),
        endAt: end2,
      });
      await writer.persistFromHvChargeSession(s1);
      await writer.persistFromHvChargeSession(s2);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.throughput.segments[0]?.compositionStatus).toBe('SOURCE_CONFLICT');
    });

    it('E) multiple revisions collapse to one canonical session in A2 population', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-multi-${randomUUID()}`;
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: fp,
      });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: { energyAddedKwh: 20, updatedAt: new Date('2026-08-15T00:00:00.000Z') },
      });
      await writer.persistFromHvChargeSession(updated);
      expect(
        await prisma.batteryHvChargeSessionEvidenceRevision.count({
          where: { organizationId, vehicleId, segmentFingerprint: fp },
        }),
      ).toBe(2);
      const bundle = await runM3_3HvH4LiveDurableModeAParityV1(
        prisma,
        { organizationId, vehicleId },
        EVAL,
      );
      expect(bundle.live.loadedData.chargeSessionSourceLoad.loadedCount).toBe(1);
    });

    it('M) corrupted durable revision fingerprint fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, { organizationId, vehicleId });
      const persisted = await writer.persistFromHvChargeSession(session);
      await prisma.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: persisted.revision.id },
        data: { sourceRevisionFingerprint: '0'.repeat(64) },
      });
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(H4EvidenceRevisionStoredFingerprintMismatchError);
    });

    it('O) missing durability ACK fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const session = await createNativeSession(prisma, { organizationId, vehicleId });
      const persisted = await writer.persistFromHvChargeSession(session);
      await prisma.batteryHvChargeSessionEvidenceAck.deleteMany({
        where: { revisionId: persisted.revision.id },
      });
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(H4EvidenceRevisionMissingDurabilityAckError);
    });

    it('P) ambiguous effective revision tie fails closed', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const fp = `fp-amb-${randomUUID()}`;
      const session = await createNativeSession(prisma, {
        organizationId,
        vehicleId,
        segmentFingerprint: fp,
      });
      await writer.persistFromHvChargeSession(session);
      const updated = await prisma.hvChargeSession.update({
        where: { id: session.id },
        data: {
          energyAddedKwh: 20,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });
      await writer.persistFromHvChargeSession(updated);
      const tie = new Date('2026-07-01T00:00:00.000Z');
      await prisma.batteryHvChargeSessionEvidenceRevision.updateMany({
        where: { organizationId, vehicleId, segmentFingerprint: fp },
        data: { sourceUpdatedAt: tie, capturedAt: tie, createdAt: tie },
      });
      await expect(
        runM3_3HvH4DurableModeAA2ReportBundleV1(
          prisma,
          { organizationId, vehicleId },
          EVAL,
        ),
      ).rejects.toBeInstanceOf(H4EvidenceEffectiveRevisionAmbiguityError);
    });
  },
);
